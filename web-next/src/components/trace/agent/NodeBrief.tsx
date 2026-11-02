import { BorderBeam } from "border-beam";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState } from "react";
import { type NodeSummary, type Source, streamSummary } from "@/lib/agent";
import type { Chain } from "@/lib/api";
import { short } from "@/lib/utils";
import type { AddressRole } from "../types";
import { Answer } from "./Answer";

// The node brief: a fixed-height card with a short summary of the
// inspected card's fund movement. It shows only the finished, verified
// summary (at most three sentences); while it's being written the border
// beam runs. Until a card is inspected it waits.

const ROLE_DOT: Record<AddressRole, string> = {
  attacker: "bg-attacker",
  victim: "bg-victim",
  normal: "bg-normal",
};

const MAX_SENTENCES = 3;

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

export function NodeBrief({
  chain,
  address,
  name,
  role,
}: {
  chain: Chain;
  address: string | null;
  name?: string;
  role: AddressRole;
}) {
  const key = address ? `${chain}:${address}` : "";
  const [summary, setSummary] = useState<NodeSummary | null>(null);
  const [failed, setFailed] = useState(false);

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

  const writing = Boolean(address) && !summary && !failed;
  const text = summary?.text ? firstSentences(summary.text, MAX_SENTENCES) : "";
  const sources = new Map<string, Source>(
    (summary?.sources ?? []).map((s) => [s.id, s]),
  );

  return (
    <BorderBeam
      active={writing}
      borderRadius={16}
      colorVariant="ocean"
      size="md"
      strength={0.8}
      theme="light"
    >
      <div className="flex h-[176px] flex-col rounded-2xl bg-surface ring-1 ring-line">
        {address && (
          <div className="flex shrink-0 items-center gap-2 px-4 pt-3 text-[12px]">
            <span
              className={`size-2 shrink-0 rounded-full ${ROLE_DOT[role]}`}
            />
            <span className="font-mono text-ink">{short(address)}</span>
            {name && <span className="truncate text-muted">{name}</span>}
            {summary?.coverage && summary.coverage.transfers > 0 && (
              <span className="ml-auto shrink-0 text-faint tabular-nums">
                {summary.coverage.transfers}
                {summary.coverage.more ? "+" : ""} transfers
              </span>
            )}
          </div>
        )}
        <div className="relative min-h-0 flex-1">
          <AnimatePresence initial={false} mode="wait">
            {text ? (
              <motion.div
                animate={{ opacity: 1, filter: "blur(0px)" }}
                className="absolute inset-0 overflow-y-auto px-4 pt-2 pb-3"
                exit={{ opacity: 0 }}
                initial={{ opacity: 0, filter: "blur(3px)" }}
                key={`text:${key}`}
                transition={{ duration: 0.35 }}
              >
                <Answer sources={sources} text={text} />
              </motion.div>
            ) : (
              <motion.div
                animate={{ opacity: 1 }}
                className="absolute inset-0 flex flex-col items-center justify-center px-6 text-center"
                exit={{ opacity: 0 }}
                initial={{ opacity: 0 }}
                key={`wait:${key}:${writing}:${failed}`}
                transition={{ duration: 0.2 }}
              >
                <p className="text-[13px] text-muted">
                  {!address
                    ? "Summaries will appear here"
                    : writing
                      ? "Summarising its fund movement…"
                      : "No summary for this address yet"}
                </p>
                {!address && (
                  <p className="mt-1 text-[12px] text-faint">
                    Click a card on the globe to inspect it.
                  </p>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </BorderBeam>
  );
}
