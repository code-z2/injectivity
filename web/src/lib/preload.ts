// Load an investigation's first view (ENS → address, intel, first page of
// transfers) before navigating, so the landing can show its thinking orb
// while the work happens and the terminal opens already filled. One-shot
// cache: the terminal takes the entry once; anything else refetches.
import {
  fetchIntel,
  fetchTransfers,
  type Chain,
  type Intel,
  type TransfersPage,
} from "./api";
import { looksLikeEns, resolveEns } from "./ens";
import { ADDRESS_RE } from "./utils";

export interface Preloaded {
  address: string;
  intel: Intel;
  first: TransfersPage;
}

const cache = new Map<string, Preloaded>();
const key = (chain: string, target: string) =>
  `${chain}:${target.trim().toLowerCase()}`;

export async function preloadInvestigation(
  chain: Chain,
  target: string,
): Promise<Preloaded> {
  const addr = looksLikeEns(target) ? await resolveEns(target) : target.trim();
  if (!ADDRESS_RE.test(addr)) throw new Error("bad-address");
  const [intel, first] = await Promise.all([
    fetchIntel(chain, addr),
    fetchTransfers(chain, addr),
  ]);
  const out = { address: addr.toLowerCase(), intel, first };
  cache.set(key(chain, target), out);
  return out;
}

export function takePreloaded(
  chain: string,
  target: string,
): Preloaded | undefined {
  const k = key(chain, target);
  const v = cache.get(k);
  // Deferred delete: React StrictMode re-runs effects immediately in dev,
  // and the second run must still find the entry.
  if (v) setTimeout(() => cache.delete(k), 0);
  return v;
}

export function lookupErrorMessage(e: unknown): string {
  const m = e instanceof Error ? e.message : "";
  if (m === "ens-unresolved") return "That name does not resolve on mainnet.";
  if (m === "bad-address") return "Enter a 0x address or an ENS name.";
  return "Lookup failed. Is the API running?";
}
