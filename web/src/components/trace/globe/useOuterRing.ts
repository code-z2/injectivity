import { useEffect, useState } from "react";
import { fetchLabels, fetchTransfers, type KnownLabel } from "@/lib/api";
import type { NodeStat } from "./molecule";

// Outer atoms: each parent address's own counterparties (ring 2 from ring
// 1, ring 3 from ring 2), from its first page of transfers (newest, both
// directions), with the counts and token flows between them. Fetched two
// at a time and shown as they arrive. Remembered for the session, so
// turning back is instant. Moving the globe never calls this; only a
// change of the active address or of the parents does.

const CONCURRENCY = 2;

const cache = new Map<string, NodeStat[]>();
const failed = new Set<string>();

async function statsOf(chain: string, address: string): Promise<NodeStat[]> {
  const key = `${chain}:${address}`;
  const hit = cache.get(key);
  if (hit) return hit;
  // live=1: the cache only holds rows seen while loading other addresses
  // (where this one was merely a counterparty), which would look complete
  // but isn't.
  const page = await fetchTransfers(chain, address, undefined, { live: true });
  const m = new Map<string, NodeStat>();
  for (const t of page.transfers) {
    const out = t.from.toLowerCase() === address;
    const cp = (out ? t.to : t.from).toLowerCase();
    if (!cp || cp === address) continue;
    const s = m.get(cp) ?? { address: cp, inCount: 0, outCount: 0, flows: [] };
    // Counts are from the counterparty's side of the link: money the
    // parent sent is money the counterparty received.
    if (out) s.inCount++;
    else s.outCount++;
    const n = t.value === "" ? NaN : Number(t.value);
    s.flows.push({
      contract: t.contract ?? null,
      asset: t.asset,
      amount: Number.isFinite(n) ? n : null,
      category: t.category ?? "",
    });
    m.set(cp, s);
  }
  const list = [...m.values()].sort(
    (a, b) => b.inCount + b.outCount - (a.inCount + a.outCount),
  );
  cache.set(key, list);
  return list;
}

export function useOuterRing(
  chain: string,
  active: string,
  parents: string[],
  perParent: number,
) {
  const [ring, setRing] = useState<Map<string, NodeStat[]>>(new Map());
  const [labels, setLabels] = useState<Record<string, KnownLabel>>({});
  const [pending, setPending] = useState(0);
  const key = parents.join(",");

  useEffect(() => {
    let live = true;
    const queue = [...parents];
    const found = new Map<string, NodeStat[]>();
    const pick = (list: NodeStat[]) =>
      list.filter((k) => k.address !== active).slice(0, perParent);
    for (const p of parents) {
      const hit = cache.get(`${chain}:${p}`);
      if (hit) found.set(p, pick(hit));
    }
    setRing(new Map(found));
    setPending(queue.length);

    const worker = async () => {
      while (live && queue.length) {
        const p = queue.shift()!;
        if (failed.has(`${chain}:${p}`)) {
          setPending((n) => n - 1);
          continue;
        }
        try {
          const kids = pick(await statsOf(chain, p));
          if (!live) return;
          found.set(p, kids);
          setRing(new Map(found));
          if (kids.length) {
            fetchLabels(
              chain,
              kids.map((k) => k.address),
            )
              .then((l) => live && setLabels((x) => ({ ...x, ...l })))
              .catch(() => {});
          }
        } catch {
          failed.add(`${chain}:${p}`);
        } finally {
          if (live) setPending((n) => n - 1);
        }
      }
    };
    for (let i = 0; i < CONCURRENCY; i++) void worker();
    return () => {
      live = false;
    };
  }, [chain, active, key]); // eslint-disable-line react-hooks/exhaustive-deps

  return { ring, labels, pending };
}
