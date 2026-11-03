// Server progress frames → the step list AILoadingState renders. Each tool
// call is a step; stages (checking the question, writing, verifying, …)
// are steps of their own.
import type { AgentStep } from "@/components/kokonutui/ai-loading";
import type { Stage, Step } from "@/lib/agent";
import { short } from "@/lib/utils";

const STAGE_LABEL: Record<Stage, string> = {
  gate: "Reading the question",
  research: "Researching",
  verify: "Checking every claim against its sources",
  sweep: "Filling the gaps a report needs",
  write: "Writing the report",
  save: "Saving the report",
  memory: "Keeping what's worth remembering",
};

const hostOf = (url: unknown) => {
  try {
    return new URL(String(url)).hostname.replace(/^www\./, "");
  } catch {
    return "a page";
  }
};

export function toolLabel(name: string, args: Record<string, unknown>): string {
  const a = (k: string) => short(String(args[k] ?? ""));
  switch (name) {
    case "workspace":
      return "Reading your trace";
    case "recall":
      return "Checking what earlier investigations found";
    case "get_transfers":
      return `Transfers of ${a("address")}`;
    case "get_transaction":
      return `Transaction ${short(String(args.hash ?? ""), 8, 4)}`;
    case "get_balances":
      return `Balances of ${a("address")}`;
    case "get_contract":
      return `Contract at ${a("address")}`;
    case "trace_funds":
      return `Following funds from ${a("address")}`;
    case "lookup_labels": {
      const n = Array.isArray(args.addresses) ? args.addresses.length : 0;
      return `Checking labels of ${n} address${n === 1 ? "" : "es"}`;
    }
    case "search_exploits":
      return `Searching known exploits for "${String(args.query ?? "").slice(0, 40)}"`;
    case "read_page":
      return `Reading ${hostOf(args.url)}`;
    case "read_pdf":
      return `Reading ${hostOf(args.url)} (PDF)`;
    default:
      return name.replace(/_/g, " ");
  }
}

let seq = 0;
const id = () => `s${++seq}`;

/** Marks the running step done and appends the next one. */
function advance(steps: AgentStep[], next: Omit<AgentStep, "id">): AgentStep[] {
  return [
    ...steps.map((s) =>
      s.status === "running" ? { ...s, status: "done" as const } : s,
    ),
    { id: id(), ...next },
  ];
}

export function onStage(steps: AgentStep[], stage: Stage): AgentStep[] {
  // "Researching" stays one step; its tool calls follow it.
  if (
    stage === "research" &&
    steps.some((s) => s.label === STAGE_LABEL.research)
  )
    return steps;
  return advance(steps, { label: STAGE_LABEL[stage], status: "running" });
}

export function onStep(steps: AgentStep[], step: Step): AgentStep[] {
  if (step.type === "tool")
    return advance(steps, {
      label: toolLabel(step.name, step.args),
      status: "running",
    });
  if (step.type === "tool_done") {
    let i = steps.length - 1;
    while (i >= 0 && steps[i].status !== "running") i--;
    if (i < 0) return steps;
    const s = steps[i];
    const detail = step.ok
      ? step.sources
        ? [`${step.sources} new source${step.sources === 1 ? "" : "s"}`]
        : ["nothing new"]
      : ["couldn't complete this lookup"];
    return steps.map((x, j) =>
      j === i
        ? {
            ...s,
            status: step.ok ? ("done" as const) : ("error" as const),
            detail,
          }
        : x,
    );
  }
  if (step.type === "search")
    return [
      ...steps,
      {
        id: id(),
        label: `Searched the web · ${step.results} result${step.results === 1 ? "" : "s"}`,
        status: "done",
        detail: step.sources.slice(0, 6).map((s) => hostOf(s.url)),
      },
    ];
  return steps;
}

/** Everything finished. */
export const finish = (steps: AgentStep[]): AgentStep[] =>
  steps.map((s) => (s.status === "running" ? { ...s, status: "done" } : s));

/** Stopped or failed: the running step shows where. */
export const fail = (steps: AgentStep[]): AgentStep[] =>
  steps.map((s) => (s.status === "running" ? { ...s, status: "error" } : s));
