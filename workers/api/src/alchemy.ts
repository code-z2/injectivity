// Minimal Alchemy Token API client (getAssetTransfers, balances).
// Worker-direct: no key means no live calls; cached D1 rows still serve.
import { chainBase } from '@/constants/chains';
import type { Env } from '@/types';

function backoffMs(attempt: number): number {
  return Math.min(2000, 250 * 2 ** attempt) + Math.floor(Math.random() * 250);
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

async function rpc(env: Env, chain: string, method: string, params: unknown[]): Promise<unknown> {
  const base = chainBase(chain);
  if (!base || !env.ALCHEMY_API_KEY) throw new Error('alchemy-unavailable');
  let lastErr = '';
  for (let attempt = 0; attempt < 4; attempt++) {
    if (attempt > 0) await sleep(backoffMs(attempt - 1));
    let res: Response;
    try {
      res = await fetch(`${base}/v2/${env.ALCHEMY_API_KEY}`, {
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
