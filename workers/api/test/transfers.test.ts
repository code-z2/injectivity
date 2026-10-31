// TST-1: transfers cache behavior (fresh hit, stale + keyless, TTL override).
import { describe, expect, test } from 'bun:test';
import { FIX, get, lo, makeTestEnv } from './harness';

function seedTransfer(
  db: { prepare(sql: string): { run(...p: unknown[]): void } },
  fetchedAt: string,
) {
  db.prepare(
    `INSERT INTO transfers (tx_hash, chain, from_addr, to_addr, asset, amount, block_number, raw, fetched_at)
     VALUES (?,?,?,?,?,?,?,?,?)`,
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
