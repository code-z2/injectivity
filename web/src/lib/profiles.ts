// Address profiles and balances for the trace, cached for the session.
// Profiles rank counterparties by value over the first 5,000 transfers;
// balances are fetched in batches of 12 as cards appear.
import { useEffect, useRef, useState } from "react";
import {
  type Balance,
  fetchBalances,
  fetchProfile,
  type KnownLabel,
  type Profile,
} from "./api";

const profiles = new Map<string, Promise<Profile>>();

export function profileOf(chain: string, address: string): Promise<Profile> {
  const key = `${chain}:${address}`;
  let p = profiles.get(key);
  if (!p) {
    p = fetchProfile(chain, address);
    p.catch(() => profiles.delete(key));
    profiles.set(key, p);
  }
  return p;
}

export function useProfile(chain: string, address: string) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let live = true;
    setProfile(null);
    setFailed(false);
    profileOf(chain, address)
      .then((p) => live && setProfile(p))
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
    };
  }, [chain, address]);
  return { profile, failed };
}

/** Labels carried by a profile's counterparties, in the trace's label shape. */
export function profileLabels(p: Profile): Record<string, KnownLabel> {
  const out: Record<string, KnownLabel> = {};
  for (const c of p.counterparties)
    if (c.label)
      out[c.address] = {
        list: c.label.list,
        role: c.label.role,
        label: c.label.name,
        chains: [p.chain],
      };
  return out;
}

/** Protocol contracts (routers, bridges, mixers) are where trails end. */
export const isProtocol = (l: KnownLabel | undefined) => l?.list === "protocol";

const balances = new Map<string, Balance>();
const requested = new Set<string>();
const BATCH = 12;

/**
 * Balances for the given addresses, filled in as batches return. Each
 * address is fetched once per session.
 */
export function useBalances(chain: string, addresses: string[]) {
  const [, bump] = useState(0);
  const key = addresses.join(",");
  const live = useRef(true);
  useEffect(() => {
    live.current = true;
    const todo = addresses.filter((a) => !requested.has(`${chain}:${a}`));
    for (const a of todo) requested.add(`${chain}:${a}`);
    const batches: string[][] = [];
    for (let i = 0; i < todo.length; i += BATCH)
      batches.push(todo.slice(i, i + BATCH));
    let next = 0;
    const worker = async () => {
      while (next < batches.length) {
        const batch = batches[next++]!;
        try {
          for (const b of await fetchBalances(chain, batch))
            balances.set(`${chain}:${b.address}`, b);
        } catch {
          for (const a of batch) requested.delete(`${chain}:${a}`);
        }
        if (live.current) bump((n) => n + 1);
      }
    };
    void worker();
    void worker();
    return () => {
      live.current = false;
    };
  }, [chain, key]); // eslint-disable-line react-hooks/exhaustive-deps
  return (address: string) => balances.get(`${chain}:${address}`);
}
