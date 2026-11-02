// Minimal Alchemy Token API client (getAssetTransfers, balances).
// Worker-direct: no key means no live calls; cached D1 rows still serve.
import { chainBase } from '@/constants/chains';
import type { Env } from '@/types';

function backoffMs(attempt: number): number {
  return Math.min(2000, 250 * 2 ** attempt) + Math.floor(Math.random() * 250);
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

// BYOR seam: RPC_URLS (JSON, {chain: url}) overrides the built-in Alchemy
// bases per chain. It comes from the binding, or per request from the
// client's x-rpc-url header (see withRequestRpc in app.ts). A custom URL is
// used as-is (it carries its own credentials); built-in bases use the
// Alchemy key. Custom endpoints must speak alchemy_getAssetTransfers.
function overrideBase(env: Env, chain: string): string | undefined {
  try {
    const overrides = env.RPC_URLS ? (JSON.parse(env.RPC_URLS) as Record<string, string>) : {};
    return overrides[chain.toLowerCase()] || undefined;
  } catch {
    return undefined; // Malformed RPC_URLS: fall through to built-ins.
  }
}

function rpcUrlFor(env: Env, chain: string): string | undefined {
  const custom = overrideBase(env, chain);
  const builtin = chainBase(chain);
  return (
    custom ?? (builtin && env.ALCHEMY_API_KEY ? `${builtin}/v2/${env.ALCHEMY_API_KEY}` : undefined)
  );
}

/** True when live calls are possible: the built-in key or a custom RPC. */
export function hasLiveRpc(env: Env, chain?: string): boolean {
  if (chain) return rpcUrlFor(env, chain) !== undefined;
  return Boolean(env.ALCHEMY_API_KEY || env.RPC_URLS);
}

export type RpcHealth = 'ok' | 'rate-limited' | 'unsupported' | 'error' | 'unavailable';

// One un-retried transfers query for the latest block: proves the RPC is
// reachable, not throttled, and speaks alchemy_getAssetTransfers (what
// lookups actually need), at the cost of a single small call.
export async function probeRpc(
  env: Env,
  chain: string,
): Promise<{ health: RpcHealth; ms: number | null; custom: boolean }> {
  const url = rpcUrlFor(env, chain);
  const custom = overrideBase(env, chain) !== undefined;
  if (!url) return { health: 'unavailable', ms: null, custom };
  const t0 = Date.now();
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        id: 1,
        jsonrpc: '2.0',
        method: 'alchemy_getAssetTransfers',
        params: [
          { fromBlock: 'latest', toBlock: 'latest', category: ['external'], maxCount: '0x1' },
        ],
      }),
      signal: AbortSignal.timeout(6000),
    });
    const ms = Date.now() - t0;
    if (res.status === 429) return { health: 'rate-limited', ms, custom };
    if (!res.ok) return { health: 'error', ms, custom };
    const body = (await res.json()) as {
      result?: unknown;
      error?: { code?: number; message?: string };
    };
    if (body.error) {
      const m = (body.error.message ?? '').toLowerCase();
      if (body.error.code === 429 || m.includes('rate') || m.includes('capacity')) {
        return { health: 'rate-limited', ms, custom };
      }
      if (body.error.code === -32601 || m.includes('not found') || m.includes('not supported')) {
        return { health: 'unsupported', ms, custom };
      }
      return { health: 'error', ms, custom };
    }
    return { health: 'ok', ms, custom };
  } catch {
    return { health: 'error', ms: null, custom };
  }
}

async function rpc(env: Env, chain: string, method: string, params: unknown[]): Promise<unknown> {
  const url = rpcUrlFor(env, chain);
  if (!url) throw new Error('alchemy-unavailable');
  let lastErr = '';
  for (let attempt = 0; attempt < 4; attempt++) {
    if (attempt > 0) await sleep(backoffMs(attempt - 1));
    let res: Response;
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id: 1, jsonrpc: '2.0', method, params }),
      });
    } catch (err) {
      lastErr = `network: ${err instanceof Error ? err.message : 'unknown'}`;
      continue;
    }
    if (res.status === 429 || res.status >= 500) {
      lastErr = `alchemy-http-${res.status}`;
      continue;
    }
    if (!res.ok) throw new Error(`alchemy-http-${res.status}`);
    const body = (await res.json()) as { result?: unknown; error?: { message?: string } };
    if (body.error) throw new Error(`alchemy-rpc: ${body.error.message ?? 'unknown'}`);
    return body.result;
  }
  throw new Error(lastErr || 'alchemy-unavailable');
}

export interface Transfer {
  hash: string;
  from: string;
  to: string;
  asset: string;
  value: string;
  blockNum: string;
}

export async function getTransfers(
  env: Env,
  chain: string,
  address: string,
  direction: 'in' | 'out' | 'both',
  pageKey?: string,
  maxCount = 100,
): Promise<{ transfers: Transfer[]; pageKey?: string }> {
  const both = direction === 'both';
  const queries = both ? ['to', 'from'] : [direction === 'in' ? 'to' : 'from'];
  const out: Transfer[] = [];
  let next: string | undefined;
  for (const q of queries) {
    const params: Record<string, unknown> = {
      [q === 'to' ? 'toAddress' : 'fromAddress']: address,
      category: ['external', 'erc20', 'erc721', 'erc1155'],
      withMetadata: true,
      excludeZeroValue: true,
      maxCount: `0x${Math.min(maxCount, 100).toString(16)}`,
    };
    if (pageKey && !both) params.pageKey = pageKey;
    const result = (await rpc(env, chain, 'alchemy_getAssetTransfers', [params])) as {
      transfers?: Transfer[];
      pageKey?: string;
    };
    for (const t of result.transfers ?? []) out.push(t);
    if (!both) next = result.pageKey;
  }
  out.sort((a, b) => (a.blockNum > b.blockNum ? -1 : 1));
  return { transfers: out.slice(0, maxCount), pageKey: next };
}

export async function getNativeBalance(env: Env, chain: string, address: string): Promise<string> {
  const result = (await rpc(env, chain, 'eth_getBalance', [address, 'latest'])) as string;
  return result;
}

export async function getTokenBalances(
  env: Env,
  chain: string,
  address: string,
): Promise<Array<{ contractAddress: string; tokenBalance: string }>> {
  const result = (await rpc(env, chain, 'alchemy_getTokenBalances', [address, 'erc20'])) as {
    tokenBalances?: Array<{ contractAddress: string; tokenBalance: string; error?: string }>;
  };
  return (result.tokenBalances ?? []).filter((t) => !t.error && t.tokenBalance !== '0x0');
}

export const alchemyClient = { getTransfers, getNativeBalance, getTokenBalances };
