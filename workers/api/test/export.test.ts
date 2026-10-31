// TST-1/INFRA-2: saved investigations export as downloadable PDFs.
import { describe, expect, test } from 'bun:test';
import { FIX, get, lo, makeTestEnv } from './harness';

function seedReport(db: {
  prepare(sql: string): { run(...p: unknown[]): void };
  query(sql: string): { get(): unknown };
}) {
  const hashA = `0x${'a'.repeat(64)}`;
  db.prepare(
    `INSERT INTO transfers (tx_hash, chain, from_addr, to_addr, asset, amount, block_number, raw, fetched_at)
     VALUES (?,?,?,?,?,?,?,?,?)`,
  ).run(
    hashA,
    'ethereum',
    lo(FIX.sanctioned.address),
    lo(FIX.exploit.address),
    'ETH',
    '2.5',
    21000000,
    '{}',
    new Date().toISOString(),
  );
  db.prepare('INSERT INTO reports (title, body, created_at) VALUES (?,?,?)').run(
    `Intel: ${lo(FIX.exploit.address)} (ethereum)`,
    JSON.stringify({
      address: lo(FIX.exploit.address),
      chain: 'ethereum',
      report: {
        summary: 'KelpDAO hacker fund-flow screening.',
        findings: [
          {
            claim: 'Address received funds directly from an OFAC-sanctioned address.',
            verdict: 'verified',
            evidence: { txHashes: [hashA], listRefs: ['exploit/attacker'] },
            confidence: 'high',
          },
        ],
        uncertainty: ['Coverage limited to cached transfers.'],
        nextChecks: ['Expand trace as fresh transfers arrive.'],
      },
    }),
    new Date().toISOString(),
  );
  return (db.query('SELECT last_insert_rowid() AS id').get() as { id: number }).id;
}

describe('report pdf export', () => {
  test('saved investigation renders a non-trivial PDF', async () => {
    const { app, env, db } = makeTestEnv();
    const id = seedReport(db);
    const res = await app.fetch(new Request(`http://test/v1/reports/${id}?format=pdf`), env);
    const bytes = new Uint8Array(await res.arrayBuffer());
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('application/pdf');
    expect(String.fromCharCode(...bytes.slice(0, 4))).toBe('%PDF');
    expect(bytes.length).toBeGreaterThan(2000);
  });

  test('missing report is a 404, bad id is a 400', async () => {
    const { app, env } = makeTestEnv();
    const missing = await get(app, env, '/v1/reports/999999');
    expect(missing.status).toBe(404);
    const bad = await get(app, env, '/v1/reports/abc');
    expect(bad.status).toBe(400);
  });
});
