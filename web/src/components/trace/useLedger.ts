import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { fetchLabels, fetchTransfers, type KnownLabel } from "@/lib/api";

// The active address's ledger: every transfer in and out, paged from the
// API (newest first, both directions on one cursor), plus the unique
// counterparties those transfers reach and known labels for them. Resets
// when the address changes; late pages for an old address are dropped.

export interface LedgerRow {
  id: string;
  hash: string;
  direction: "in" | "out";
  counterparty: string;
  asset: string;
  contract: string | null;
  /** Token amount; null when the API gave none (e.g. an NFT). */
  amount: number | null;
  category: string;
  /** ms since epoch; null when unknown. */
  time: number | null;
}

export interface Counterparty {
  address: string;
  inCount: number;
  outCount: number;
  lastTime: number | null;
}

export type LedgerStatus = "loading" | "ready" | "more" | "done" | "error";

const LABEL_BATCH = 400;

export function useLedger(chain: string, address: string) {
  const [rows, setRows] = useState<LedgerRow[]>([]);
  const [status, setStatus] = useState<LedgerStatus>("loading");
  const [error, setError] = useState("");
  const [labels, setLabels] = useState<Record<string, KnownLabel>>({});
  // Whose rows these are: lags the address by one render after a switch,
  // so callers can tell stale rows from fresh ones.
  const [owner, setOwner] = useState("");
  const pageKey = useRef<string | undefined>(undefined);
  const gen = useRef(0);
  const asked = useRef(new Set<string>());
  const me = address.toLowerCase();

  const askLabels = useCallback(
    (addrs: string[], g: number) => {
      const fresh = addrs.filter((a) => !asked.current.has(a));
      fresh.forEach((a) => asked.current.add(a));
      for (let i = 0; i < fresh.length; i += LABEL_BATCH) {
        fetchLabels(chain, fresh.slice(i, i + LABEL_BATCH))
          .then((found) => {
            if (g === gen.current) setLabels((l) => ({ ...l, ...found }));
          })
          .catch(() => {
            // Labels are an enhancement: rows still render without them.
          });
      }
    },
    [chain],
  );

  const load = useCallback(
    async (g: number, key?: string) => {
      try {
        const page = await fetchTransfers(chain, me, key, { live: true });
        if (g !== gen.current) return;
        const next: LedgerRow[] = page.transfers.map((t, i) => {
          const out = t.from.toLowerCase() === me;
          const n = t.value === "" ? NaN : Number(t.value);
          return {
            id: t.uniqueId ?? `${t.hash}:${i}:${key ?? ""}`,
            hash: t.hash,
            direction: out ? "out" : "in",
            counterparty: (out ? t.to : t.from).toLowerCase(),
            asset: t.asset || "Unknown",
            contract: t.contract ?? null,
            amount: Number.isFinite(n) ? n : null,
            category: t.category ?? "",
            time: t.timestamp ? Date.parse(t.timestamp) : null,
          };
        });
        setRows((r) => {
          const seen = new Set(r.map((x) => x.id));
          return [...r, ...next.filter((x) => !seen.has(x.id))];
        });
        pageKey.current = page.pageKey;
        setStatus(page.pageKey ? "ready" : "done");
        askLabels([...new Set(next.map((x) => x.counterparty))], g);
      } catch (err) {
        if (g !== gen.current) return;
        setError(err instanceof Error ? err.message : "lookup failed");
        setStatus("error");
      }
    },
    [chain, me, askLabels],
  );

  useEffect(() => {
    const g = ++gen.current;
    setRows([]);
    setOwner(me);
    setLabels({});
    setError("");
    setStatus("loading");
    pageKey.current = undefined;
    asked.current = new Set();
    if (!me) {
      setStatus("done"); // idle: no address to load
      return;
    }
    askLabels([me], g);
    void load(g);
  }, [me, load, askLabels]);

  const loadMore = useCallback(() => {
    if (status !== "ready" || !pageKey.current) return;
    setStatus("more");
    void load(gen.current, pageKey.current);
  }, [status, load]);

  const retry = useCallback(() => {
    setStatus(rows.length ? "more" : "loading");
    void load(gen.current, pageKey.current);
  }, [load, rows.length]);

  const counterparties = useMemo(() => {
    const m = new Map<string, Counterparty>();
    for (const r of rows) {
      if (!r.counterparty || r.counterparty === me) continue;
      const c = m.get(r.counterparty) ?? {
        address: r.counterparty,
        inCount: 0,
        outCount: 0,
        lastTime: null,
      };
      if (r.direction === "in") c.inCount++;
      else c.outCount++;
      if (r.time && (!c.lastTime || r.time > c.lastTime)) c.lastTime = r.time;
      m.set(r.counterparty, c);
    }
    return [...m.values()].sort(
      (a, b) => b.inCount + b.outCount - (a.inCount + a.outCount),
    );
  }, [rows, me]);

  return {
    owner,
    rows,
    counterparties,
    labels,
    status,
    error,
    loadMore,
    retry,
  };
}
