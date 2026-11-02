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
        // A stalled RPC must not hang an agent turn.
        signal: AbortSignal.timeout(30_000),
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
  /** external | internal | erc20 | erc721 | erc1155 */
  category?: string;
  /** Token contract; null for the chain's native coin. */
  contract?: string | null;
  /** ISO block time (from Alchemy metadata). */
  timestamp?: string;
  /** Stable per transfer (several transfers can share one tx hash). */
  uniqueId?: string;
}

interface RawTransfer {
  hash: string;
  from: string;
  to: string | null;
  asset: string | null;
  value: number | string | null;
  blockNum: string;
  category?: string;
  uniqueId?: string;
  rawContract?: { address?: string | null };
  metadata?: { blockTimestamp?: string };
}

export function normalizeTransfer(t: RawTransfer | Transfer): Transfer {
  const raw = t as RawTransfer & Transfer;
  return {
    hash: raw.hash,
    from: raw.from,
    to: raw.to ?? '',
    asset: raw.asset ?? '',
    value: raw.value === null || raw.value === undefined ? '' : String(raw.value),
    blockNum: raw.blockNum,
    category: raw.category,
    contract: raw.contract !== undefined ? raw.contract : (raw.rawContract?.address ?? null),
    timestamp: raw.timestamp ?? raw.metadata?.blockTimestamp,
    uniqueId: raw.uniqueId,
  };
}

// Paging cursor for direction=both: Alchemy pages inflows and outflows
// separately, so the cursor carries one key per side (base64url JSON);
// a side with no key is finished.
interface BothCursor {
  in?: string;
  out?: string;
}
function encodeCursor(c: BothCursor): string | undefined {
  if (!c.in && !c.out) return undefined;
  return btoa(JSON.stringify(c)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function decodeCursor(key: string): BothCursor | null {
  try {
    const b64 = key.replace(/-/g, '+').replace(/_/g, '/');
    const c = JSON.parse(atob(b64)) as BothCursor;
    return typeof c === 'object' && c !== null ? c : null;
  } catch {
    return null;
  }
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
  const cursor = both && pageKey ? decodeCursor(pageKey) : null;
  if (both && pageKey && !cursor) throw new Error('bad-page-key');
  const sides: Array<'in' | 'out'> = both
    ? (['in', 'out'] as const).filter((s) => !cursor || cursor[s])
    : [direction as 'in' | 'out'];
  const out: Transfer[] = [];
  const next: BothCursor = {};
  let single: string | undefined;
  for (const side of sides) {
    const params: Record<string, unknown> = {
      [side === 'in' ? 'toAddress' : 'fromAddress']: address,
      category: ['external', 'erc20', 'erc721', 'erc1155'],
      withMetadata: true,
      excludeZeroValue: true,
      order: 'desc',
      maxCount: `0x${Math.min(maxCount, 100).toString(16)}`,
    };
    const key = both ? cursor?.[side] : pageKey;
    if (key) params.pageKey = key;
    const result = (await rpc(env, chain, 'alchemy_getAssetTransfers', [params])) as {
      transfers?: RawTransfer[];
      pageKey?: string;
    };
    for (const t of result.transfers ?? []) out.push(normalizeTransfer(t));
    if (both) next[side] = result.pageKey;
    else single = result.pageKey;
  }
  out.sort((a, b) => (parseInt(b.blockNum, 16) || 0) - (parseInt(a.blockNum, 16) || 0));
  // direction=both returns both sides' pages whole: trimming would drop
  // rows the cursor has already moved past.
  return {
    transfers: both ? out : out.slice(0, maxCount),
    pageKey: both ? encodeCursor(next) : single,
  };
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

/** Token logo from Alchemy metadata (the ledger's last icon fallback). */
export async function getTokenLogo(
  env: Env,
  chain: string,
  contract: string,
): Promise<string | null> {
  const result = (await rpc(env, chain, 'alchemy_getTokenMetadata', [contract])) as {
    logo?: string | null;
  };
  return result.logo || null;
}

/** Any JSON-RPC method on the chain's RPC (the agent's transaction and code lookups). */
export const call = (env: Env, chain: string, method: string, params: unknown[]) =>
  rpc(env, chain, method, params);

export const alchemyClient = { getTransfers, getNativeBalance, getTokenBalances, call };
