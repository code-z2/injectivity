// TST-1: tracing caps (depth/fanout/empty-cache/offline proof).
import { describe, expect, test } from 'bun:test';
import { FIX, get, lo, makeTestEnv } from './harness';

function seedGraph(db: { prepare(sql: string): { run(...p: unknown[]): void } }) {
  const rows = [
    [`0x${'a'.repeat(64)}`, FIX.sanctioned.address, FIX.mid.address],
    [`0x${'b'.repeat(64)}`, FIX.mid.address, FIX.exploit.address],
  ] as const;
  for (const [hash, from, to] of rows) {
    db.prepare(
      `INSERT INTO transfers (tx_hash, chain, from_addr, to_addr, asset, amount, block_number, raw, fetched_at)
       VALUES (?,?,?,?,?,?,?,?,?)`,
    ).run(
      hash,
      'ethereum',
      lo(from),
      lo(to),
      'ETH',
      '1.0',
      21000000,
      '{}',
      new Date().toISOString(),
    );
  }
}

describe('trace caps', () => {
  test('depth above 2 is rejected', async () => {
    const { app, env } = makeTestEnv();
    const r = await get(app, env, `/v1/trace/ethereum/${FIX.sanctioned.address}?depth=3`);
    expect(r.status).toBe(400);
  });

  test('two-hop path reaches the exploit, fully offline', async () => {
    const { app, env, db } = makeTestEnv();
    seedGraph(db);
    const r = await get(app, env, `/v1/trace/ethereum/${FIX.sanctioned.address}?depth=2`);
    const edges = (r.body.edges as unknown[]) ?? [];
    const paths = (r.body.pathsOut as string[][]) ?? [];
    const stats = r.body.stats as { liveCalls: number };
    expect(r.status).toBe(200);
    expect(edges.length).toBeGreaterThanOrEqual(2);
    expect(paths.some((p) => p.at(-1) === lo(FIX.exploit.address))).toBe(true);
    expect(stats.liveCalls).toBe(0);
  });

  test('empty cache with no key is a 502 with a note, not an empty 200', async () => {
    const { app, env } = makeTestEnv();
    const r = await get(app, env, `/v1/trace/ethereum/${FIX.clean.address}`);
    expect(r.status).toBe(502);
    expect(typeof r.body.note).toBe('string');
  });

  test('unsupported chain is rejected', async () => {
    const { app, env } = makeTestEnv();
    const r = await get(app, env, `/v1/trace/solana/${FIX.clean.address}`);
    expect(r.status).toBe(400);
  });
});
