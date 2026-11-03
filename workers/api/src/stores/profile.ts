// Address profile: the first transfers of an address (oldest first, up to
// 5,000, internal included where indexed), with dust and spoof tokens set
// aside, every counterparty valued in USD over the whole span, and the
// totals. What the trace's rings are chosen from: value moved, not count.
import { getEarlyTransfers, hasLiveRpc, type Transfer } from '@/alchemy';
import { loadPrices, type Prices, valueOf } from '@/agent/facts/prices';
import { spoofOf } from '@/agent/facts/spoof';
import { storeTransfers } from '@/stores/transfers';
import type { Env } from '@/types';

export interface CounterpartyStat {
  address: string;
  inCount: number;
  outCount: number;
  inUsd: number;
  outUsd: number;
  /** Some transfers with it couldn't be priced: USD figures are lower bounds. */
  partial: boolean;
  label?: { list: string; role: string; name: string };
}

export interface Profile {
  chain: string;
  address: string;
  scanned: number;
  /** False when the address has more transfers than were read. */
  complete: boolean;
  first: string | null;
  last: string | null;
  dust: { transfers: number; spoof: number };
  totals: { inUsd: number; outUsd: number; partial: boolean };
  tokens: { asset: string; contract: string | null; in: number; out: number; n: number }[];
  counterparties: CounterpartyStat[];
  live: boolean;
}

export const PROFILE_LIMIT = 5000;
const TOP = 80;
const TTL_MS = 10 * 60_000;
const DUST_USD = 1;
const DUST_NATIVE = 1e-6;

/** A transfer is dust when it carries a spoof symbol or under $1 / a millionth of the coin. */
function classify(
  chain: string,
  t: Transfer,
  prices: Prices,
): { dust: 'spoof' | 'tiny' | null; usd: number; priced: boolean } {
  if (t.asset && spoofOf(t.asset)) return { dust: 'spoof', usd: 0, priced: false };
  const amount = Number(t.value);
  const flow = {
    contract: t.contract ?? null,
    asset: t.asset ?? '',
    amount: Number.isFinite(amount) && t.value !== '' ? amount : null,
    category: t.category ?? '',
  };
  const v = valueOf(chain, [flow], prices);
  const priced = !v.partial;
  if (priced && v.usd < DUST_USD) return { dust: 'tiny', usd: v.usd, priced };
  const nft = t.category === 'erc721' || t.category === 'erc1155';
  if (!priced && !nft && flow.amount !== null && Math.abs(flow.amount) < DUST_NATIVE)
    return { dust: 'tiny', usd: 0, priced };
  return { dust: null, usd: v.usd, priced };
}

export async function buildProfile(
  env: Env,
  chain: string,
  address: string,
  fetchImpl: typeof fetch = fetch,
): Promise<Profile> {
  const a = address.toLowerCase();
  const key = `profile:${chain}:${a}`;
  const hit = await env.DB.prepare('SELECT body FROM tool_cache WHERE key = ? AND expires_at > ?')
    .bind(key, new Date().toISOString())
    .first<{ body: string }>()
    .catch(() => null);
  if (hit) return JSON.parse(hit.body) as Profile;

  if (!hasLiveRpc(env, chain)) throw new Error('no live RPC for this chain');
  const [{ transfers, complete }, prices] = await Promise.all([
    getEarlyTransfers(env, chain, a, PROFILE_LIMIT),
    loadPrices(chain, fetchImpl),
  ]);

  const cps = new Map<string, CounterpartyStat>();
  const tokens = new Map<string, Profile['tokens'][number]>();
  const dust = { transfers: 0, spoof: 0 };
  const totals = { inUsd: 0, outUsd: 0, partial: false };
  for (const t of transfers) {
    const out = t.from.toLowerCase() === a;
    const cp = (out ? t.to : t.from).toLowerCase();
    if (!cp || cp === a) continue;
    const c = classify(chain, t, prices);
    if (c.dust) {
      dust.transfers++;
      if (c.dust === 'spoof') dust.spoof++;
      continue;
    }
    const s = cps.get(cp) ?? {
      address: cp,
      inCount: 0,
      outCount: 0,
      inUsd: 0,
      outUsd: 0,
      partial: false,
    };
    if (out) {
      s.outCount++;
      s.outUsd += c.usd;
      totals.outUsd += c.usd;
    } else {
      s.inCount++;
      s.inUsd += c.usd;
      totals.inUsd += c.usd;
    }
    if (!c.priced) {
      s.partial = true;
      totals.partial = true;
    }
    cps.set(cp, s);
    const tk = t.contract ?? t.asset ?? '';
    const x = tokens.get(tk) ?? {
      asset: t.asset || '?',
      contract: t.contract ?? null,
      in: 0,
      out: 0,
      n: 0,
    };
    const amount = Number(t.value) || 0;
    if (out) x.out += amount;
    else x.in += amount;
    x.n++;
    tokens.set(tk, x);
  }

  const ranked = [...cps.values()]
    .sort(
      (p, q) =>
        q.inUsd + q.outUsd - (p.inUsd + p.outUsd) ||
        q.inCount + q.outCount - (p.inCount + p.outCount),
    )
    .slice(0, TOP);
  const labels = await labelsFor(
    env,
    ranked.map((r) => r.address),
  );
  for (const r of ranked) {
    const l = labels.get(r.address);
    if (l) r.label = l;
  }

  const times = transfers.map((t) => t.timestamp).filter(Boolean) as string[];
  const profile: Profile = {
    chain,
    address: a,
    scanned: transfers.length,
    complete,
    first: times[0] ?? null,
    last: times[times.length - 1] ?? null,
    dust,
    totals,
    tokens: [...tokens.values()].sort((p, q) => q.n - p.n).slice(0, 10),
    counterparties: ranked,
    live: true,
  };

  // Cache the profile, and the transfers for the ledger and the agent.
  await env.DB.prepare('INSERT OR REPLACE INTO tool_cache (key, body, expires_at) VALUES (?,?,?)')
    .bind(key, JSON.stringify(profile), new Date(Date.now() + TTL_MS).toISOString())
    .run()
    .catch(() => undefined);
  for (let i = 0; i < transfers.length; i += 400)
    await storeTransfers(env, chain, transfers.slice(i, i + 400)).catch(() => undefined);
  return profile;
}

async function labelsFor(env: Env, addresses: string[]) {
  const out = new Map<string, NonNullable<CounterpartyStat['label']>>();
  if (!addresses.length) return out;
  const rows =
    (
      await env.DB.prepare(
        `SELECT address, list_name, role, label FROM risk_lists WHERE address IN (${addresses.map(() => '?').join(',')})`,
      )
        .bind(...addresses)
        .all<{ address: string; list_name: string; role: string; label: string }>()
    ).results ?? [];
  // Exploit and sanction labels win over protocol names.
  const rank = (l: string) => (l === 'protocol' ? 1 : 0);
  for (const r of rows.sort((x, y) => rank(y.list_name) - rank(x.list_name)))
    out.set(r.address, { list: r.list_name, role: r.role, name: r.label });
  return out;
}
