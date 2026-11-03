import { Sparkles } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState } from "react";
import { runInvestigation, type ReportSummary } from "@/lib/api";
import { loadSettings, saveSettings, useSettings } from "@/lib/settings";
import { ReportView } from "./ReportView";
import { ErrorLine, SectionLabel, Status } from "./ui";

export function InvestigatePanel({
  chain,
  address,
}: {
  chain: string;
  address: string;
}) {
  // One settings source: the key field mirrors the Settings key; model
  // name and reasoning effort come from that same store.
  const { modelKey } = useSettings();
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<ReportSummary | null>(null);

  useEffect(() => {
    setResult(null);
    setError("");
  }, [address]);

  async function run() {
    setRunning(true);
    setError("");
    setResult(null);
    try {
      const s = loadSettings();
      setResult(
        await runInvestigation(chain, address, s.modelKey.trim(), {
          model: s.model || undefined,
          effort: s.effort,
        }),
      );
    } catch (e) {
      setError(
        e instanceof Error && e.message === "missing-model-key"
          ? "Add a Muse key to investigate."
          : "Investigation failed. Check the API and try again.",
      );
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="mt-6 rounded-2xl bg-subtle/70 p-4 sm:p-5">
      <SectionLabel>AI investigation</SectionLabel>
      <div className="mt-3 flex flex-col gap-2 sm:flex-row">
        <input
          type="password"
          value={modelKey}
          onChange={(e) => saveSettings({ modelKey: e.target.value })}
          placeholder="Optional Muse key override (stored only in this browser)"
          autoComplete="off"
          className="h-11 min-w-0 flex-1 rounded-xl border border-line bg-surface px-3.5 font-mono text-[13px] text-ink transition-[border-color,box-shadow] duration-150 outline-none placeholder:font-sans placeholder:text-faint focus:border-ion-400 focus:shadow-focus"
        />
        <button
          onClick={run}
          disabled={running}
          className="inline-flex h-11 items-center justify-center gap-2 rounded-full bg-ink px-5 text-[14px] font-medium text-white transition-all duration-150 hover:bg-ink-soft active:scale-[0.98] disabled:opacity-70"
        >
          <Sparkles className="size-4" />
          {running ? "Investigating…" : "Investigate"}
        </button>
      </div>

      {running && (
        <div className="mt-3">
          <Status text="Tracing funds, screening counterparties, drafting findings…" />
        </div>
      )}
      {error && (
        <div className="mt-3">
          <ErrorLine>{error}</ErrorLine>
        </div>
      )}

      <AnimatePresence>
        {result && (
          <motion.div
            initial={{ opacity: 0, y: 8, filter: "blur(2px)" }}
            animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
            transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
            className="mt-4"
          >
            <p className="text-[15px] leading-[1.6] text-ink">
              {result.summary}
            </p>
            <p className="mt-1.5 text-[12.5px] text-muted">
              {result.findingCount} findings ({result.verdictCounts.verified}{" "}
              verified / {result.verdictCounts.inferred} inferred) ·{" "}
              {result.uncertaintyCount} open questions · {result.nextCheckCount}{" "}
              next checks
              {result.stripped > 0 &&
                ` · ${result.stripped} draft claim(s) removed for missing evidence`}
              {result.reportId !== null && ` · report #${result.reportId}`}
            </p>
          </motion.div>
        )}
      </AnimatePresence>

      {result && result.reportId !== null ? (
        <ReportView reportId={result.reportId} chain={chain} />
      ) : (
        !running && (
          <p className="mt-3 text-[13px] text-muted">
            Findings, uncertainty, and the PDF export render here.
          </p>
        )
      )}
    </div>
  );
}
