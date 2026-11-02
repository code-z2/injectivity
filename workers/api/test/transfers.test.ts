// TST-1: transfers cache behavior (fresh hit, stale + keyless, TTL override).
import { describe, expect, test } from 'bun:test';
import { transferUid } from '@/stores/transfers';
import { FIX, get, lo, makeTestEnv } from './harness';

function seedTransfer(
  db: { prepare(sql: string): { run(...p: unknown[]): void } },
  fetchedAt: string,
) {
  db.prepare(
    `INSERT INTO transfers (uid, tx_hash, chain, from_addr, to_addr, asset, amount, block_number, raw, fetched_at)
     VALUES (?1,?1,?2,?3,?4,?5,?6,?7,?8,?9)`,
  ).run(
    `0x${'d'.repeat(64)}`,
    'ethereum',
    lo(FIX.sanctioned.address),
    lo(FIX.mid.address),
    'ETH',
    '1.0',
    21000000,
    '{}',
    fetchedAt,
  );
}

describe('transfers cache', () => {
  test('fresh cache is served without going live', async () => {
    const { app, env, db } = makeTestEnv();
    seedTransfer(db, new Date().toISOString());
    const r = await get(app, env, `/v1/address/ethereum/${FIX.sanctioned.address}/transfers`);
    expect(r.status).toBe(200);
    expect(r.body.live).toBe(false);
    expect(r.body.cached).toBe(true);
    expect((r.body.transfers as unknown[]).length).toBeGreaterThanOrEqual(1);
  });

  test('stale cache with no key is served marked stale', async () => {
    const { app, env, db } = makeTestEnv();
    seedTransfer(db, '2020-01-01T00:00:00.000Z');
    const r = await get(app, env, `/v1/address/ethereum/${FIX.sanctioned.address}/transfers`);
    expect(r.status).toBe(200);
    expect(r.body.stale).toBe(true);
    expect((r.body.transfers as unknown[]).length).toBeGreaterThanOrEqual(1);
  });

  test('TTL override narrows freshness', async () => {
    const { app, env, db } = makeTestEnv();
    // Fetched 90s ago: fresh under the default 300s TTL, stale under 60s.
    seedTransfer(db, new Date(Date.now() - 90_000).toISOString());
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tightEnv = { ...env, CACHE_TTL_SECONDS: '60' } as any;
    const r = await get(app, tightEnv, `/v1/address/ethereum/${FIX.sanctioned.address}/transfers`);
    expect(r.status).toBe(200);
    expect(r.body.stale).toBe(true);
  });

  test('empty cache with no key reports no transfers, not an error', async () => {
    const { app, env } = makeTestEnv();
    const r = await get(app, env, `/v1/address/ethereum/${FIX.clean.address}/transfers`);
    expect(r.status).toBe(200);
    expect((r.body.transfers as unknown[]).length).toBe(0);
  });
});

describe('transfers cache key', () => {
  test('several transfers in one tx are kept as separate rows', async () => {
    const { db } = makeTestEnv();
    const hash = `0x${'f'.repeat(64)}`;
    const base = { hash, from: FIX.sanctioned.address, to: FIX.mid.address, blockNum: '0x1' };
    const a = { ...base, asset: 'USDC', value: '5', contract: '0xa0b8' };
    const b = { ...base, asset: 'USDT', value: '7', contract: '0xdac1' };
    expect(transferUid(a)).not.toBe(transferUid(b));
    expect(transferUid({ ...a, uniqueId: `${hash}:log:3` })).toBe(`${hash}:log:3`);
    const insert = db.prepare(
      `INSERT INTO transfers (uid, tx_hash, chain, from_addr, to_addr) VALUES (?,?,?,?,?)`,
    );
    insert.run(transferUid(a), hash, 'ethereum', lo(base.from), lo(base.to));
    insert.run(transferUid(b), hash, 'ethereum', lo(base.from), lo(base.to));
    const n = db.prepare('SELECT COUNT(*) AS n FROM transfers WHERE tx_hash = ?').get(hash) as {
      n: number;
    };
    expect(n.n).toBe(2);
  });
});
