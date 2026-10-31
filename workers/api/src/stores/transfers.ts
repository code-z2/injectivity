// transfers cache (Alchemy payloads), freshness-aware.
import type { Transfer } from '@/alchemy';
import type { Env } from '@/types';

export function nowIso(): string {
  return new Date().toISOString();
}

export function ttlSeconds(env: Env): number {
  const n = Number(env.CACHE_TTL_SECONDS ?? '300');
  return Number.isFinite(n) && n > 0 ? n : 300;
}

function fresh(fetchedAt: string, env: Env): boolean {
  if (!fetchedAt) return false;
  const age = (Date.now() - Date.parse(fetchedAt)) / 1000;
  return age >= 0 && age < ttlSeconds(env);
}

export async function cachedTransfers(
  env: Env,
  chain: string,
  address: string,
  direction: 'in' | 'out' | 'both',
): Promise<{ rows: Transfer[]; fresh: boolean }> {
  const addr = address.toLowerCase();
  const clause =
    direction === 'in'
      ? 'to_addr = ?'
      : direction === 'out'
        ? 'from_addr = ?'
        : '(from_addr = ? OR to_addr = ?)';
  const binds = direction === 'both' ? [chain, addr, addr] : [chain, addr];
  const rows = await env.DB.prepare(
    `SELECT tx_hash, from_addr, to_addr, asset, amount, block_number, fetched_at
     FROM transfers WHERE chain = ? AND ${clause}
     ORDER BY block_number DESC LIMIT 100`,
  )
    .bind(...binds)
    .all<{
      tx_hash: string;
      from_addr: string;
      to_addr: string;
      asset: string;
      amount: string;
      block_number: number;
      fetched_at: string;
    }>();
  const list = rows.results ?? [];
  const transfers: Transfer[] = list.map((r) => ({
    hash: r.tx_hash,
    from: r.from_addr,
    to: r.to_addr,
    asset: r.asset,
    value: r.amount,
    blockNum: '0x' + r.block_number.toString(16),
  }));
  const isFresh = list.length > 0 && list.every((r) => fresh(r.fetched_at, env));
  return { rows: transfers, fresh: isFresh };
}

export async function storeTransfers(
  env: Env,
  chain: string,
  transfers: Transfer[],
): Promise<void> {
  const at = nowIso();
  const stmts = transfers.map((t) =>
    env.DB.prepare(
      `INSERT OR REPLACE INTO transfers
       (tx_hash, chain, from_addr, to_addr, asset, amount, block_number, raw, fetched_at)
       VALUES (?,?,?,?,?,?,?,?,?)`,
    ).bind(
      t.hash,
      chain,
      t.from.toLowerCase(),
      t.to.toLowerCase(),
      t.asset ?? '',
      t.value ?? '',
      parseInt(t.blockNum ?? '0x0', 16) || 0,
      JSON.stringify(t),
      at,
    ),
  );
  if (stmts.length > 0) await env.DB.batch(stmts);
}
