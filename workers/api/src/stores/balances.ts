// Current holdings of an address in USD (native coin plus the liquid
// tokens we price; anything else makes the figure a lower bound), whether
// it is a contract, and its verified name. Cached per address.
import { call, getNativeBalance, getTokenBalances, hasLiveRpc } from '@/alchemy';
import { loadPrices, type Prices } from '@/agent/facts/prices';
import type { Env } from '@/types';

export interface Balance {
  address: string;
  usd: number;
  /** Holds tokens we can't price: usd is a lower bound. */
  partial: boolean;
  holdings: { symbol: string; amount: number; usd: number }[];
  isContract: boolean;
  contractName: string | null;
}

const TTL_MS = 10 * 60_000;
const NAME_TTL_MS = 7 * 24 * 3600_000;
const NATIVE: Record<string, string> = { bsc: 'BNB', polygon: 'POL' };
const CHAIN_ID: Record<string, number> = {
  ethereum: 1,
  bsc: 56,
  arbitrum: 42161,
  base: 8453,
  polygon: 137,
  optimism: 10,
};

async function cached<T>(env: Env, key: string, ttl: number, make: () => Promise<T>): Promise<T> {
  const hit = await env.DB.prepare('SELECT body FROM tool_cache WHERE key = ? AND expires_at > ?')
    .bind(key, new Date().toISOString())
    .first<{ body: string }>()
    .catch(() => null);
  if (hit) return JSON.parse(hit.body) as T;
  const value = await make();
  await env.DB.prepare('INSERT OR REPLACE INTO tool_cache (key, body, expires_at) VALUES (?,?,?)')
    .bind(key, JSON.stringify(value), new Date(Date.now() + ttl).toISOString())
    .run()
    .catch(() => undefined);
  return value;
}

async function tokenMeta(env: Env, chain: string, token: string) {
  return cached(env, `meta:${chain}:${token}`, NAME_TTL_MS, async () => {
    const m = (await call(env, chain, 'alchemy_getTokenMetadata', [token])) as {
      symbol?: string;
      decimals?: number | null;
    };
    return { symbol: m.symbol ?? '?', decimals: m.decimals ?? null };
  });
}

async function contractName(env: Env, chain: string, address: string, fetchImpl: typeof fetch) {
  return cached(env, `name:${chain}:${address}`, NAME_TTL_MS, async () => {
    const id = CHAIN_ID[chain];
    if (!id) return null;
    try {
      const r = await fetchImpl(
        `https://sourcify.dev/server/v2/contract/${id}/${address}?fields=compilation`,
        { signal: AbortSignal.timeout(8000) },
      );
      if (!r.ok) return null;
      return ((await r.json()) as { compilation?: { name?: string } }).compilation?.name ?? null;
    } catch {
      return null;
    }
  });
}

export async function balanceOf(
  env: Env,
  chain: string,
  address: string,
  prices: Prices,
  fetchImpl: typeof fetch = fetch,
): Promise<Balance> {
  const a = address.toLowerCase();
  return cached(env, `balance:${chain}:${a}`, TTL_MS, async () => {
    const [nativeHex, tokens, code] = await Promise.all([
      getNativeBalance(env, chain, a),
      getTokenBalances(env, chain, a).catch(() => []),
      call(env, chain, 'eth_getCode', [a, 'latest']) as Promise<string>,
    ]);
    const isContract = Boolean(code && code !== '0x' && !code.startsWith('0xef0100'));
    const holdings: Balance['holdings'] = [];
    let usd = 0;
    let partial = !prices;
    const native = Number(BigInt(nativeHex || '0x0')) / 1e18;
    if (native > 0) {
      const v = prices?.native ? native * prices.native : 0;
      if (!prices?.native) partial = true;
      usd += v;
      holdings.push({ symbol: NATIVE[chain] ?? 'ETH', amount: native, usd: v });
    }
    // Only tokens we price are worth a metadata lookup; the rest just mark
    // the figure as a lower bound.
    for (const t of tokens) {
      const token = t.contractAddress.toLowerCase();
      const price = prices?.[token];
      if (!price) {
        partial = true;
        continue;
      }
      const m = await tokenMeta(env, chain, token);
      if (m.decimals === null) continue;
      const amount = Number(BigInt(t.tokenBalance)) / 10 ** m.decimals;
      if (amount <= 0) continue;
      usd += amount * price;
      holdings.push({ symbol: m.symbol, amount, usd: amount * price });
    }
    holdings.sort((p, q) => q.usd - p.usd);
    return {
      address: a,
      usd,
      partial,
      holdings: holdings.slice(0, 3),
      isContract,
      contractName: isContract ? await contractName(env, chain, a, fetchImpl) : null,
    };
  });
}

export async function balancesOf(
  env: Env,
  chain: string,
  addresses: string[],
  fetchImpl: typeof fetch = fetch,
): Promise<Balance[]> {
  if (!hasLiveRpc(env, chain)) throw new Error('no live RPC for this chain');
  const prices = await loadPrices(chain, fetchImpl);
  const out: Balance[] = [];
  // A few at a time keeps each request well inside the subrequest limit.
  for (let i = 0; i < addresses.length; i += 4) {
    const batch = await Promise.all(
      addresses
        .slice(i, i + 4)
        .map((a) => balanceOf(env, chain, a, prices, fetchImpl).catch(() => null)),
    );
    for (const b of batch) if (b) out.push(b);
  }
  return out;
}
