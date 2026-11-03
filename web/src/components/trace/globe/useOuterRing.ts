import { useEffect, useState } from "react";
import type { KnownLabel } from "@/lib/api";
import { profileLabels, profileOf } from "@/lib/profiles";
import type { NodeStat } from "./molecule";

// Outer atoms: each parent address's own counterparties (ring 2 from ring
// 1, ring 3 from ring 2), the largest by value from its profile (first
// 5,000 transfers, dust set aside). Fetched two at a time and shown as
// they arrive; profiles are remembered for the session. Moving the globe
// never calls this; only a change of the active address or parents does.

const CONCURRENCY = 2;

const failed = new Set<string>();

async function statsOf(
  chain: string,
  address: string,
): Promise<{ stats: NodeStat[]; labels: Record<string, KnownLabel> }> {
  const p = await profileOf(chain, address);
  // Counts are from the counterparty's side of the link: money the parent
  // sent is money the counterparty received.
  const stats = p.counterparties.map((c) => ({
    address: c.address,
    inCount: c.outCount,
    outCount: c.inCount,
    flows: [],
    movedUsd: c.inUsd + c.outUsd,
    movedPartial: c.partial,
  }));
  return { stats, labels: profileLabels(p) };
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
          const { stats, labels: found_labels } = await statsOf(chain, p);
          const kids = pick(stats);
          if (!live) return;
          found.set(p, kids);
          setRing(new Map(found));
          setLabels((x) => ({ ...x, ...found_labels }));
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
