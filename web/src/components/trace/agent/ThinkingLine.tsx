import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState } from "react";
import type { AgentStep } from "@/components/kokonutui/ai-loading";

// The agent at work, on one line: the current step (shimmering, swapping
// in place as steps change), how many lookups so far, and the time.

const EASE = [0.23, 1, 0.32, 1] as const;

const clock = (s: number) =>
  s < 60 ? `${s}s` : `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

export function ThinkingLine({
  steps,
  failed,
}: {
  steps: AgentStep[];
  failed: boolean;
}) {
  const [start] = useState(() => Date.now());
  const [now, setNow] = useState(start);
  useEffect(() => {
    if (failed) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [failed]);

  const current =
    [...steps].reverse().find((s) => s.status === "running") ?? steps.at(-1);
  const label = failed
    ? `Stopped${current ? ` at: ${current.label}` : ""}`
    : (current?.label ?? "Getting ready");
  // Tool calls only: stage steps aren't lookups.
  const lookups = steps.filter((s) => s.detail?.length).length;

  return (
    <div className="flex h-6 items-center gap-2 text-[12.5px]">
      {!failed && (
        <svg
          aria-hidden="true"
          className="size-3.5 shrink-0 motion-safe:animate-spin"
          fill="none"
          style={{ animationDuration: "0.8s" }}
          viewBox="0 0 16 16"
        >
          <circle
            cx="8"
            cy="8"
            r="6.25"
            stroke="var(--color-line)"
            strokeWidth="1.5"
          />
          <path
            d="M8 1.75a6.25 6.25 0 0 1 6.25 6.25"
            stroke="var(--color-ink-soft)"
            strokeLinecap="round"
            strokeWidth="1.5"
          />
        </svg>
      )}
      <span className="relative min-w-0 flex-1">
        <AnimatePresence initial={false} mode="popLayout">
          <motion.span
            animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
            className={
              failed
                ? "block truncate text-muted"
                : "text-shimmer block truncate"
            }
            exit={{ opacity: 0, y: -6, filter: "blur(2px)" }}
            initial={{ opacity: 0, y: 6, filter: "blur(2px)" }}
            key={label}
            transition={{ duration: 0.2, ease: EASE }}
          >
            {label}
          </motion.span>
        </AnimatePresence>
      </span>
      <span className="shrink-0 text-[11.5px] text-faint tabular-nums">
        {lookups > 0 && `${lookups} lookup${lookups === 1 ? "" : "s"} · `}
        {clock(Math.round((now - start) / 1000))}
      </span>
    </div>
  );
}
