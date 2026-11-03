import { Link } from "@tanstack/react-router";
import { ArrowLeft, Copy, Check } from "lucide-react";
import { motion } from "motion/react";
import { useEffect, useState } from "react";
import { Console } from "@/components/Console";
import { SettingsDialog } from "@/components/SettingsDialog";
import {
  fetchIntel,
  fetchTransfers,
  type Chain,
  type Intel,
  type Transfer,
} from "@/lib/api";
import { CHAIN_META } from "@/lib/chains";
import { looksLikeEns, resolveEns } from "@/lib/ens";
import { saveSettings } from "@/lib/settings";
import { takePreloaded } from "@/lib/preload";
import { ADDRESS_RE, fmtNative, nativeSymbol } from "@/lib/utils";
import { HistoryTable } from "./HistoryTable";
import { InvestigatePanel } from "./InvestigatePanel";
import { RiskBadge } from "./RiskBadge";
import { RiskPanel } from "./RiskPanel";
import { TraceGraph } from "./TraceGraph";
import { ErrorLine, Panel, SectionLabel, Status } from "./ui";

type Phase = "idle" | "resolving" | "loading" | "ready" | "error";

// The investigation terminal. Same sections and behaviour as v1 — search,
// profile (risk, balances, history, AI investigation) and the fund-flow
// mesh — reskinned to the light brand system. Driven by the URL.
export function Terminal({ chain, target }: { chain: Chain; target: string }) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState("");
  const [intel, setIntel] = useState<Intel | null>(null);
  const [transfers, setTransfers] = useState<Transfer[]>([]);
  const [pageKey, setPageKey] = useState<string | undefined>(undefined);
  const [loadingMore, setLoadingMore] = useState(false);
  const [address, setAddress] = useState("");

  // Keep the chain picker in step with a shared / pasted URL.
  useEffect(() => saveSettings({ chain }), [chain]);

  useEffect(() => {
    // Opened from the landing spotlight: data is already loaded.
    const pre = takePreloaded(chain, target);
    if (pre) {
      setAddress(pre.address);
      setIntel(pre.intel);
      setTransfers(pre.first.transfers);
      setPageKey(pre.first.pageKey);
      setError("");
      setPhase("ready");
      return;
    }
    let live = true;
    setPhase("resolving");
    setError("");
    setIntel(null);
    setTransfers([]);
    setPageKey(undefined);
    (async () => {
      try {
        const addr = looksLikeEns(target) ? await resolveEns(target) : target;
        if (!ADDRESS_RE.test(addr)) throw new Error("bad-address");
        if (!live) return;
        setAddress(addr.toLowerCase());
        setPhase("loading");
        const [info, first] = await Promise.all([
          fetchIntel(chain, addr),
          fetchTransfers(chain, addr),
        ]);
        if (!live) return;
        setIntel(info);
        setTransfers(first.transfers);
        setPageKey(first.pageKey);
        setPhase("ready");
      } catch (e) {
        if (!live) return;
        setPhase("error");
        setError(
          e instanceof Error && e.message === "ens-unresolved"
            ? "That name does not resolve on mainnet."
            : e instanceof Error && e.message === "bad-address"
              ? "Enter a 0x address or an ENS name."
              : "Lookup failed. Is the API running?",
        );
      }
    })();
    return () => {
      live = false;
    };
  }, [chain, target]);

  async function more() {
    if (pageKey === undefined || loadingMore || !intel) return;
    setLoadingMore(true);
    try {
      const next = await fetchTransfers(chain, address, pageKey);
      setTransfers((t) => [...t, ...next.transfers]);
      setPageKey(next.pageKey);
    } finally {
      setLoadingMore(false);
    }
  }

  const busy = phase === "loading" || phase === "resolving";

  return (
    <div className="min-h-svh">
      <div className="sticky top-0 z-30 border-b border-line/70 bg-canvas/80 backdrop-blur-xl">
        <div className="flex h-14 items-center justify-between px-5">
          <div className="flex items-center gap-4">
            {/* Brand orb is the root-layout Wordmark, fixed over this slot. */}
            <span aria-hidden className="w-6 shrink-0" />
            <Link
              to="/"
              className="hidden items-center gap-1.5 text-[13px] font-medium text-muted transition-colors hover:text-ink sm:inline-flex"
            >
              <ArrowLeft className="size-3.5" />
              New investigation
            </Link>
          </div>
          <SettingsDialog />
        </div>
      </div>

      <div className="mx-auto max-w-[1080px] px-4 pt-8 pb-16 sm:px-5">
        <header className="mb-6">
          <h1 className="text-[32px] display sm:text-[40px]">Intel Terminal</h1>
          <p className="mt-1.5 text-[14px] text-muted">
            On-chain security investigations. Paste an address — no wallet,
            ever.
          </p>
        </header>

        <Console variant="compact" initial={target} busy={busy} />

        <div className="mt-3 min-h-5">
          {phase === "resolving" && <Status text="Resolving name…" />}
          {phase === "loading" && <Status text="Fetching intel…" />}
          {error && <ErrorLine>{error}</ErrorLine>}
        </div>

        {intel && (
          <motion.div
            initial={{ opacity: 0, y: 12, filter: "blur(3px)" }}
            animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
            transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
          >
            <Panel className="mt-4">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0">
                  <AddressLine address={intel.address} />
                  <p className="mt-1.5 flex flex-wrap items-center gap-x-2 text-[12.5px] text-muted">
                    <span>
                      {CHAIN_META[intel.chain as Chain]?.label ?? intel.chain}
                    </span>
                    <span className="text-line-strong">·</span>
                    <span>{intel.live ? "live" : "cached"}</span>
                    <span className="text-line-strong">·</span>
                    <span>
                      {intel.balances
                        ? "balances loaded"
                        : "balances unavailable"}
                    </span>
                  </p>
                </div>
                <RiskBadge level={intel.risk.level} />
              </div>

              {intel.labels.length > 0 && (
                <div className="mt-4 flex flex-wrap gap-2">
                  {intel.labels.map((l) => (
                    <span
                      key={`${l.list_name}/${l.role}`}
                      className="rounded-full bg-verified-soft px-2.5 py-1 font-mono text-[11.5px] text-verified"
                    >
                      {l.list_name} / {l.role} — {l.label}
                    </span>
                  ))}
                </div>
              )}

              <RiskPanel
                matches={intel.risk.matches}
                screened={intel.risk.screened}
              />

              {intel.balances && (
                <div className="mt-6 flex items-baseline gap-3">
                  <span className="font-mono text-[24px] font-medium tracking-[-0.02em]">
                    {fmtNative(intel.balances.native)}{" "}
                    <span className="text-[15px] text-muted">
                      {nativeSymbol(intel.chain)}
                    </span>
                  </span>
                  <span className="text-[12.5px] text-muted">
                    {intel.balances.tokens.length} token(s)
                  </span>
                </div>
              )}

              <SectionLabel className="mt-7 mb-2">History</SectionLabel>
              <HistoryTable
                rows={transfers}
                self={intel.address}
                chain={intel.chain}
                hasMore={pageKey !== undefined}
                loadingMore={loadingMore}
                onLoadMore={() => void more()}
              />

              <InvestigatePanel
                key={intel.address}
                chain={intel.chain}
                address={intel.address}
              />
            </Panel>

            <TraceGraph
              key={`graph-${intel.address}`}
              chain={intel.chain}
              address={intel.address}
            />
          </motion.div>
        )}
      </div>
    </div>
  );
}

function AddressLine({ address }: { address: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex items-center gap-2">
      <p className="font-mono text-[15px] break-all text-ink">{address}</p>
      <button
        onClick={() => {
          void navigator.clipboard?.writeText(address).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 1400);
          });
        }}
        aria-label="Copy address"
        className="shrink-0 rounded-md p-1.5 text-faint transition-colors hover:bg-subtle hover:text-ink"
      >
        {copied ? (
          <Check className="size-3.5 text-clean" />
        ) : (
          <Copy className="size-3.5" />
        )}
      </button>
    </div>
  );
}
