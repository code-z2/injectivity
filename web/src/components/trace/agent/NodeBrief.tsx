import { BorderBeam } from "border-beam";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { useTheme } from "@/lib/theme";
import { type NodeSummary, type Source, streamSummary } from "@/lib/agent";
import type { Chain } from "@/lib/api";
import { cn, short } from "@/lib/utils";
import type { AddressRole } from "../types";
import { Answer } from "./Answer";
import type { Reveal } from "./SideCard";

// Quick summaries: a thin strip at the top of the agent dock that follows
// the inspected card — "Quick summaries" while idle, "Generating summary"
// with the beam travelling along it, then "Summary ready". Hovering it
// reveals the summary (at most three verified sentences) in the side card.

const ROLE_DOT: Record<AddressRole, string> = {
  attacker: "bg-attacker",
  victim: "bg-victim",
  normal: "bg-normal",
};

const MAX_SENTENCES = 3;
const EASE = [0.23, 1, 0.32, 1] as const;

// Summaries already fetched this page load, by chain:address.
const cache = new Map<string, NodeSummary>();

/** The first n sentences, keeping each sentence's citations with it. */
export function firstSentences(text: string, n: number): string {
  const parts = text
    .replace(/\s+/g, " ")
    .trim()
    .split(/(?<=[.!?](?:\s*\[[^\]]+\])*)\s+(?=[A-Z0-9"(])/);
  return parts.slice(0, n).join(" ");
}

type State = "idle" | "writing" | "ready" | "none";

export function SummaryStrip({
  chain,
  address,
  name,
  role,
  onReveal,
}: {
  chain: Chain;
  address: string | null;
  name?: string;
  role: AddressRole;
  onReveal: (r: Reveal | null) => void;
}) {
  const key = address ? `${chain}:${address}` : "";
  const theme = useTheme();
  const [summary, setSummary] = useState<NodeSummary | null>(null);
  const [failed, setFailed] = useState(false);
  const strip = useRef<HTMLButtonElement>(null);
  const hovered = useRef(false);

  useEffect(() => {
    if (!address) return;
    const hit = cache.get(key);
    setSummary(hit ?? null);
    setFailed(false);
    if (hit) return;
    const ctl = new AbortController();
    streamSummary(
      chain,
      address,
      {
        facts: () => undefined,
        summary: (s) => {
          cache.set(key, s);
          setSummary(s);
        },
      },
      ctl.signal,
    ).catch(() => !ctl.signal.aborted && setFailed(true));
    return () => ctl.abort();
  }, [chain, address, key]);

  const mine = summary && summary.address === address ? summary : null;
  const text = mine?.text ? firstSentences(mine.text, MAX_SENTENCES) : "";
  const state: State = !address
    ? "idle"
    : text
      ? "ready"
      : failed || mine
        ? "none"
        : "writing";

  const show = () => {
    if (!address || !text || !strip.current) return;
    const sources = new Map<string, Source>(
      (mine?.sources ?? []).map((s) => [s.id, s]),
    );
    onReveal({
      key: `summary:${key}`,
      anchor: strip.current.getBoundingClientRect(),
      content: (
        <SummaryCard
          address={address}
          name={name}
          role={role}
          sources={sources}
          summary={mine}
          text={text}
        />
      ),
    });
  };

  // A summary that lands while the strip is hovered opens straight away;
  // a new card hides the old summary.
  // biome-ignore lint/correctness/useExhaustiveDependencies: re-reveal only when the content changes
  useEffect(() => {
    if (hovered.current && text) show();
    else if (hovered.current) onReveal(null);
  }, [text, key]);

  const label =
    state === "idle"
      ? "Quick summaries"
      : state === "writing"
        ? "Generating summary"
        : state === "ready"
          ? "Summary ready"
          : "No summary yet";

  return (
    // The library's search-field variant: the line beam travelling along
    // the bottom edge of a fully round field.
    <BorderBeam
      active={state === "writing"}
      borderRadius={20}
      colorVariant="colorful"
      size="line"
      theme={theme}
    >
      <button
        aria-label={state === "ready" ? `${label}: hover to read` : label}
        className={cn(
          "flex h-10 w-full items-center gap-2 rounded-[20px] bg-glass px-3.5 text-left text-[12px] shadow-[inset_0_0_0_1px_var(--color-line),0_1px_2px_rgb(0_0_0/0.04)] outline-none",
          state === "ready" ? "cursor-help" : "cursor-default",
        )}
        onBlur={() => {
          hovered.current = false;
          onReveal(null);
        }}
        onFocus={() => {
          hovered.current = true;
          show();
        }}
        onPointerEnter={() => {
          hovered.current = true;
          show();
        }}
        onPointerLeave={() => {
          hovered.current = false;
          onReveal(null);
        }}
        ref={strip}
        type="button"
      >
        <span
          className={cn(
            "size-1.5 shrink-0 rounded-full transition-colors",
            state === "ready"
              ? "bg-ion-500"
              : state === "writing"
                ? "bg-ion-400 motion-safe:animate-pulse"
                : "bg-line-strong",
          )}
        />
        <span className="relative min-w-0 flex-1">
          <AnimatePresence initial={false} mode="popLayout">
            <motion.span
              animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
              className={cn(
                "block truncate",
                state === "writing"
                  ? "text-shimmer"
                  : state === "ready"
                    ? "text-ink"
                    : "text-muted",
              )}
              exit={{ opacity: 0, y: -6, filter: "blur(2px)" }}
              initial={{ opacity: 0, y: 6, filter: "blur(2px)" }}
              key={label}
              transition={{ duration: 0.2, ease: EASE }}
            >
              {label}
            </motion.span>
          </AnimatePresence>
        </span>
        {address ? (
          <span className="flex shrink-0 items-center gap-1.5">
            <span className={`size-1.5 rounded-full ${ROLE_DOT[role]}`} />
            <span className="font-mono text-[11.5px] text-muted">
              {short(address, 4, 4)}
            </span>
          </span>
        ) : (
          <span className="shrink-0 text-[11.5px] text-faint">
            Click a card
          </span>
        )}
      </button>
    </BorderBeam>
  );
}

function SummaryCard({
  address,
  name,
  role,
  summary,
  text,
  sources,
}: {
  address: string;
  name?: string;
  role: AddressRole;
  summary: NodeSummary | null;
  text: string;
  sources: Map<string, Source>;
}) {
  return (
    <div className="p-3">
      <div className="flex items-center gap-2 text-[12px]">
        <span className={`size-2 shrink-0 rounded-full ${ROLE_DOT[role]}`} />
        <span className="font-mono text-ink">{short(address)}</span>
        {name && <span className="truncate text-muted">{name}</span>}
        {summary?.coverage && summary.coverage.transfers > 0 && (
          <span className="ml-auto shrink-0 text-faint tabular-nums">
            {summary.coverage.transfers}
            {summary.coverage.more ? "+" : ""} transfers
          </span>
        )}
      </div>
      <div className="mt-2">
        <Answer sources={sources} text={text} />
      </div>
    </div>
  );
}
