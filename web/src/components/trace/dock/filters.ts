import type { KnownLabel } from "@/lib/api";
import { type Prices, valueOf } from "@/lib/prices";
import { spoofOf } from "./spoof";
import { roleFromLabel } from "../types";
import type { LedgerRow } from "../useLedger";

// The dock's filters and sort, applied to the rows loaded so far.

export type Direction = "all" | "in" | "out";
export type Range = "all" | "24h" | "7d" | "30d";
export type RoleFilter = "attacker" | "victim" | "labelled" | "unlabelled";
export type Sort = "newest" | "oldest" | "amount" | "token";

export interface Filters {
  dir: Direction;
  range: Range;
  tokens: string[];
  roles: RoleFilter[];
  counterparty: string | null;
  min: number | null;
  sort: Sort;
  /** Show dust and spoof-token transfers (hidden by default). */
  dust: boolean;
}

export const NO_FILTERS: Filters = {
  dir: "all",
  range: "all",
  tokens: [],
  roles: [],
  counterparty: null,
  min: null,
  sort: "newest",
  dust: false,
};

/**
 * Dust: spoof-token transfers, priced transfers under $1, and unpriced
 * amounts under a millionth (address-poisoning spam). Same rules as the
 * API's profile.
 */
export function isDust(chain: string, r: LedgerRow, prices: Prices): boolean {
  if (r.asset && spoofOf(r.asset)) return true;
  if (r.amount === null) return false;
  const v = valueOf(
    chain,
    [
      {
        contract: r.contract,
        asset: r.asset,
        amount: r.amount,
        category: r.category,
      },
    ],
    prices,
  );
  if (!v.partial) return v.usd < 1;
  const nft = r.category === "erc721" || r.category === "erc1155";
  return !nft && Math.abs(r.amount) < 1e-6;
}

const RANGE_MS: Record<Exclude<Range, "all">, number> = {
  "24h": 864e5,
  "7d": 7 * 864e5,
  "30d": 30 * 864e5,
};

export const tokenKey = (r: Pick<LedgerRow, "contract" | "asset">) =>
  r.contract ?? `native:${r.asset}`;

/** Filters other than direction and sort that are switched on. */
export function activeCount(f: Filters): number {
  return (
    (f.range !== "all" ? 1 : 0) +
    (f.tokens.length ? 1 : 0) +
    (f.roles.length ? 1 : 0) +
    (f.counterparty ? 1 : 0) +
    (f.min !== null ? 1 : 0)
  );
}

export function applyFilters(
  rows: LedgerRow[],
  f: Filters,
  labels: Record<string, KnownLabel>,
  dusty: (r: LedgerRow) => boolean = () => false,
  now = Date.now(),
): LedgerRow[] {
  const since = f.range === "all" ? null : now - RANGE_MS[f.range];
  const tokens = f.tokens.length ? new Set(f.tokens) : null;
  const out = rows.filter((r) => {
    if (!f.dust && dusty(r)) return false;
    if (f.dir !== "all" && r.direction !== f.dir) return false;
    if (since !== null && (r.time === null || r.time < since)) return false;
    if (tokens && !tokens.has(tokenKey(r))) return false;
    if (f.counterparty && r.counterparty !== f.counterparty) return false;
    if (f.min !== null && (r.amount === null || r.amount < f.min)) return false;
    if (f.roles.length) {
      const l = labels[r.counterparty];
      const role = roleFromLabel(l);
      const ok = f.roles.some((want) =>
        want === "labelled"
          ? Boolean(l)
          : want === "unlabelled"
            ? !l
            : role === want,
      );
      if (!ok) return false;
    }
    return true;
  });
  const t = (r: LedgerRow) => r.time ?? 0;
  switch (f.sort) {
    case "oldest":
      return out.sort((a, b) => t(a) - t(b));
    case "amount":
      return out.sort((a, b) => (b.amount ?? -1) - (a.amount ?? -1));
    case "token":
      return out.sort((a, b) => a.asset.localeCompare(b.asset) || t(b) - t(a));
    default:
      return out.sort((a, b) => t(b) - t(a));
  }
}

const compact = new Intl.NumberFormat("en-US", {
  notation: "compact",
  maximumFractionDigits: 2,
});
const grouped = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 });

export function fmtAmount(n: number | null): string {
  if (n === null) return "—";
  const a = Math.abs(n);
  if (a >= 1e6) return compact.format(n);
  if (a >= 1) return grouped.format(n);
  if (a === 0) return "0";
  if (a < 0.0001) return n < 0 ? "−<0.0001" : "<0.0001";
  return n.toPrecision(3).replace(/\.?0+$/, "");
}

export function timeAgo(ms: number | null, now = Date.now()): string {
  if (ms === null) return "";
  const s = Math.max(0, (now - ms) / 1000);
  if (s < 60) return "now";
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  if (s < 30 * 86400) return `${Math.floor(s / 86400)}d`;
  return new Date(ms).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}
