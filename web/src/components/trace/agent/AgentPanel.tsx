import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { ChevronUp, FileText } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import AILoadingState, {
  type AgentStep,
} from "@/components/kokonutui/ai-loading";
import type { Chain } from "@/lib/api";
import {
  type AgentSocket,
  askExtras,
  connectSession,
  type Entry,
  forgetSession,
  type ServerFrame,
  type Source,
  sessionFor,
  type Workspace,
} from "@/lib/agent";
import { getAgentWidth, setAgentWidth, useAgentWidth } from "@/lib/agentDock";
import { rememberReport } from "@/lib/reports";
import { cn } from "@/lib/utils";
import type { AddressRole, ChainLink } from "../types";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Answer, type OnPreview } from "./Answer";
import { Composer } from "./Composer";
import { SummaryStrip } from "./NodeBrief";
import { type Reveal, SideCard } from "./SideCard";
import { SourcePreview } from "./SourcePreview";
import { ThinkingLine } from "./ThinkingLine";
import { fail, finish, onStage, onStep } from "./steps";

// The agent dock (right): a collapsible panel matching the bottom dock.
// Open, it holds the node brief, the investigation conversation (each
// answer verified and cited), then Generate and the composer; collapsed,
// just its header. Inspecting a card opens it. One agent session per trace
// root, kept across reloads.

const HEADER_H = 60;
const GAP = 12;
const EASE = [0.22, 1, 0.36, 1] as const;
const OPEN_KEY = "intel-terminal:agent-dock-open";

function useViewportHeight() {
  const [h, setH] = useState(() => innerHeight);
  useEffect(() => {
    const on = () => setH(innerHeight);
    addEventListener("resize", on);
    return () => removeEventListener("resize", on);
  }, []);
  return h;
}

interface Run {
  kind: "ask" | "report";
  steps: AgentStep[];
  failed?: boolean;
}

export function AgentPanel({
  chain,
  root,
  links,
  active,
  inspected,
  inspectedName,
  inspectedRole,
  openKey,
}: {
  chain: Chain;
  root: string;
  links: ChainLink[];
  active: string;
  inspected: string | null;
  inspectedName?: string;
  inspectedRole: AddressRole;
  /** Changes when a card is inspected: the dock opens. */
  openKey: number;
}) {
  const reduce = useReducedMotion();
  const width = useAgentWidth();
  const vh = useViewportHeight();
  const [open, setOpenState] = useState(() => {
    try {
      return localStorage.getItem(OPEN_KEY) !== "0";
    } catch {
      return true;
    }
  });
  const setOpen = (v: boolean) => {
    setOpenState(v);
    try {
      localStorage.setItem(OPEN_KEY, v ? "1" : "0");
    } catch {
      // Not remembered.
    }
  };
  useEffect(() => {
    if (openKey > 0) setOpenState(true);
  }, [openKey]);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const [transcript, setTranscript] = useState<Entry[]>([]);
  const [sources, setSources] = useState<Map<string, Source>>(new Map());
  const [run, setRun] = useState<Run | null>(null);
  // Steps of finished turns, by the index of the entry they produced.
  const [traces, setTraces] = useState<Record<number, AgentStep[]>>({});
  const [failure, setFailure] = useState<string | null>(null);
  const socket = useRef<AgentSocket | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  // What the side card shows: a citation's sources or the node summary.
  const [reveal, setReveal] = useState<Reveal | null>(null);
  const preview: OnPreview = (p) =>
    setReveal(
      p
        ? {
            key: `sources:${p.key}`,
            anchor: p.rect,
            content: <SourcePreview sources={p.sources} />,
          }
        : null,
    );

  // Session for this trace root.
  useEffect(() => {
    let live = true;
    sessionFor(chain, root)
      .then((id) => live && setSessionId(id))
      .catch(() => live && setFailure("The agent is unavailable right now."));
    return () => {
      live = false;
    };
  }, [chain, root]);

  // Frames from the session.
  useEffect(() => {
    if (!sessionId) return;
    const onFrame = (f: ServerFrame) => {
      switch (f.type) {
        case "state":
          for (const e of f.transcript)
            if (e.reportKey && e.reportToken)
              rememberReport(e.reportKey, e.reportToken);
          setTranscript(f.transcript);
          setSources(new Map(f.sources.map((s) => [s.id, s])));
          break;
        case "status":
          setRun((r) => (r ? { ...r, steps: onStage(r.steps, f.stage) } : r));
          break;
        case "step":
          setRun((r) => (r ? { ...r, steps: onStep(r.steps, f.step) } : r));
          break;
        case "answer":
        case "declined":
          setSources((m) => {
            const next = new Map(m);
            if (f.type === "answer")
              for (const s of f.sources) next.set(s.id, s);
            return next;
          });
          setTranscript((t) => {
            setRun((r) => {
              if (r) setTraces((x) => ({ ...x, [t.length]: finish(r.steps) }));
              return null;
            });
            return [...t, f.entry];
          });
          break;
        case "report":
          rememberReport(f.reportKey, f.ownerToken);
          setTranscript((t) => [...t, f.entry]);
          break;
        case "memory":
          setRun(null);
          break;
        case "error":
          setRun((r) => (r ? { ...r, steps: fail(r.steps), failed: true } : r));
          setFailure(
            f.error === "stopped"
              ? "Stopped."
              : f.error === "session not initialised"
                ? "This session expired. Reload to start a new one."
                : f.error,
          );
          if (f.error === "session not initialised") forgetSession(chain, root);
          setTimeout(() => setRun(null), 1500);
          break;
      }
    };
    const s = connectSession(sessionId, { onFrame, onStatus: setConnected });
    socket.current = s;
    return () => {
      s.close();
      socket.current = null;
    };
  }, [sessionId, chain, root]);

  // Keep the agent's view of the workspace current.
  const workspace = useMemo<Workspace>(
    () => ({
      chain,
      links: links.map((l) => ({
        address: l.address,
        role: l.role,
        ...(l.label ? { label: l.label } : {}),
      })),
      active,
      inspected,
    }),
    [chain, links, active, inspected],
  );
  useEffect(() => {
    if (connected) socket.current?.send({ type: "workspace", workspace });
  }, [connected, workspace]);

  // Follow the conversation as it grows.
  useEffect(() => {
    const el = scroller.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [transcript.length, run?.steps.length]);

  const busy = run !== null;

  const ask = (query: string) => {
    setFailure(null);
    if (
      !socket.current?.send({ type: "ask", text: query, ...askExtras(chain) })
    ) {
      setFailure("Not connected to the agent.");
      return;
    }
    setTranscript((t) => [
      ...t,
      { role: "user", text: query, at: new Date().toISOString() },
    ]);
    setRun({ kind: "ask", steps: [] });
  };

  const generate = () => {
    setFailure(null);
    if (!socket.current?.send({ type: "report", ...askExtras(chain) })) {
      setFailure("Not connected to the agent.");
      return;
    }
    setRun({ kind: "report", steps: [] });
  };

  // The server echoes the user's message in the transcript only on reload,
  // so a live turn shows the local copy; a state frame replaces both.
  const answered = transcript.some(
    (e) => e.role === "assistant" && !e.declined && !e.reportId,
  );

  const status = !connected
    ? "Connecting…"
    : run?.kind === "report"
      ? "Writing the report…"
      : run
        ? "Researching…"
        : answered
          ? plural(
              transcript.filter((e) => e.role === "user").length,
              "question",
            )
          : "Ask about this trace";

  return (
    <motion.section
      animate={{ height: open ? vh - GAP * 2 : HEADER_H }}
      aria-label="Agent"
      className="absolute top-3 right-3 z-20 flex flex-col overflow-hidden rounded-[22px] border border-glass-edge bg-glass/80 shadow-console backdrop-blur-xl"
      style={{ width }}
      initial={false}
      transition={reduce ? { duration: 0 } : { duration: 0.5, ease: EASE }}
    >
      {open && <ResizeEdge width={width} />}
      <header
        className="flex shrink-0 cursor-pointer items-center gap-3 px-4 select-none"
        onClick={() => setOpen(!open)}
        style={{ height: HEADER_H }}
      >
        <div className="min-w-0 flex-1">
          <h2 className="text-[13.5px] font-medium text-ink">Agent</h2>
          <p className="truncate text-[11.5px] text-faint">{status}</p>
        </div>
        <ThemeToggle className="hover:bg-ink/5" />
        <button
          aria-expanded={open}
          aria-label={open ? "Collapse" : "Expand"}
          className="flex size-8 items-center justify-center rounded-full text-muted transition-colors hover:bg-ink/5 hover:text-ink"
          onClick={(e) => {
            e.stopPropagation();
            setOpen(!open);
          }}
          type="button"
        >
          <ChevronUp
            className={cn(
              "size-4 transition-transform duration-300",
              open && "rotate-180",
            )}
          />
        </button>
      </header>

      <div className="flex min-h-0 flex-1 flex-col">
        <div className="shrink-0 px-3">
          <SummaryStrip
            address={inspected}
            chain={chain}
            name={inspectedName}
            onReveal={setReveal}
            role={inspectedRole}
          />
        </div>

        <div
          className="min-h-0 flex-1 overflow-y-auto px-4 pt-4 pb-2"
          ref={scroller}
        >
          {transcript.length === 0 && !run && (
            <p className="px-1 pt-1 text-[13px] text-ink">
              Ask about this trace.
            </p>
          )}
          <div className="flex flex-col gap-4">
            {transcript.map((e, i) =>
              e.role === "user" ? (
                <div className="flex justify-end" key={i}>
                  <p className="max-w-[85%] rounded-2xl rounded-br-md bg-subtle px-3 py-2 text-[13px] leading-5 text-ink">
                    {e.text}
                  </p>
                </div>
              ) : (
                <div className="flex flex-col gap-2" key={i}>
                  {traces[i] && <AILoadingState steps={traces[i]} />}
                  {e.reportKey ? (
                    <Link
                      className="flex items-center gap-2.5 rounded-xl bg-subtle px-3 py-2.5 text-[13px] text-ink transition-colors hover:bg-line"
                      params={{ key: e.reportKey }}
                      to="/report/$key"
                    >
                      <FileText className="size-4 shrink-0 text-muted" />
                      <span className="min-w-0 flex-1 truncate">
                        {e.text.replace(/^Report ready:\s*/, "")}
                      </span>
                      <span className="shrink-0 text-[12px] text-muted">
                        Open
                      </span>
                    </Link>
                  ) : e.declined ? (
                    <p className="text-[13px] leading-6 text-muted">{e.text}</p>
                  ) : (
                    <Answer
                      onPreview={preview}
                      sources={sources}
                      text={e.text}
                    />
                  )}
                </div>
              ),
            )}
            {run && (
              <ThinkingLine
                failed={Boolean(run.failed)}
                key={`${transcript.length}:${run.kind}`}
                steps={run.steps}
              />
            )}
            {failure && !run && (
              <p className="text-[12px] text-muted">{failure}</p>
            )}
          </div>
        </div>

        <div className="shrink-0 px-3 pt-1 pb-3">
          <Composer
            canGenerate={connected}
            disabled={!connected || run?.kind === "report"}
            generating={run?.kind === "report"}
            onAsk={ask}
            onGenerate={generate}
            onStop={() => socket.current?.send({ type: "stop" })}
            placeholder={connected ? "Ask about this trace…" : "Connecting…"}
            running={busy}
          />
        </div>
      </div>
      <SideCard reveal={open ? reveal : null} />
    </motion.section>
  );
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/**
 * The dock's left edge, dragged to resize it (300–560px); a grip shows on
 * hover. Double-click restores the default width.
 */
function ResizeEdge({ width }: { width: number }) {
  const start = useRef<{ x: number; w: number } | null>(null);
  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: pointer-only resize; keyboard users keep the default width
    <div
      className="group absolute inset-y-0 left-0 z-10 w-2 cursor-ew-resize touch-none"
      onDoubleClick={() => setAgentWidth(340, true)}
      onPointerDown={(e) => {
        start.current = { x: e.clientX, w: width };
        try {
          e.currentTarget.setPointerCapture(e.pointerId);
        } catch {
          // Capture is a nicety; the drag still works without it.
        }
      }}
      onPointerMove={(e) => {
        if (start.current)
          setAgentWidth(start.current.w + (start.current.x - e.clientX));
      }}
      onPointerUp={() => {
        if (!start.current) return;
        start.current = null;
        setAgentWidth(getAgentWidth(), true);
      }}
      title="Drag to resize"
    >
      <span className="absolute top-1/2 left-1 h-10 w-1 -translate-y-1/2 rounded-full bg-ink/0 transition-colors group-hover:bg-ink/15 group-active:bg-ink/25" />
    </div>
  );
}
