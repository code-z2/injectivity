// TST-1: risk match types (exact vs inferred R1 vs none).
import { describe, expect, test } from 'bun:test';
import { FIX, get, lo, makeTestEnv } from './harness';

describe('risk match types', () => {
  test('sanctioned address is verified with its OFAC label', async () => {
    const { app, env } = makeTestEnv();
    const r = await get(app, env, `/v1/address/ethereum/${FIX.sanctioned.address}`);
    const risk = r.body.risk as { level: string };
    const labels = r.body.labels as { list_name: string; role: string }[];
    expect(r.status).toBe(200);
    expect(risk.level).toBe('verified');
    expect(labels.some((l) => l.list_name === 'OFAC SDN' && l.role === 'sanctioned')).toBe(true);
  });

  test('exploit address is verified with its attacker label', async () => {
    const { app, env } = makeTestEnv();
    const r = await get(app, env, `/v1/address/ethereum/${FIX.exploit.address}`);
    const risk = r.body.risk as { level: string };
    const labels = r.body.labels as { list_name: string; role: string }[];
    expect(r.status).toBe(200);
    expect(risk.level).toBe('verified');
    expect(labels.some((l) => l.list_name === 'exploit' && l.role === 'attacker')).toBe(true);
  });

  test('one-hop counterparty is inferred, never verified', async () => {
    const { app, env, db } = makeTestEnv();
    db.prepare(
      `INSERT INTO transfers (tx_hash, chain, from_addr, to_addr, asset, amount, block_number, raw, fetched_at)
       VALUES (?,?,?,?,?,?,?,?,?)`,
    ).run(
      `0x${'c'.repeat(64)}`,
      'ethereum',
      lo(FIX.sanctioned.address),
      lo(FIX.mid.address),
      'ETH',
      '1.0',
      21000000,
      '{}',
      new Date().toISOString(),
    );
    const r = await get(app, env, `/v1/address/ethereum/${FIX.mid.address}`);
    const risk = r.body.risk as {
      level: string;
      matches: { match_type: string; via: string | null }[];
    };
    expect(r.status).toBe(200);
    expect(risk.level).toBe('inferred');
    expect(
      risk.matches.some(
        (m) => m.match_type === 'inferred:R1' && m.via === lo(FIX.sanctioned.address),
      ),
    ).toBe(true);
    // Inferred associations never surface as verified labels.
    expect((r.body.labels as unknown[]).length).toBe(0);
  });

  test('clean address has no labels and level none', async () => {
    const { app, env } = makeTestEnv();
    const r = await get(app, env, `/v1/address/ethereum/${FIX.clean.address}`);
    const risk = r.body.risk as { level: string };
    expect(r.status).toBe(200);
    expect(risk.level).toBe('none');
    expect((r.body.labels as unknown[]).length).toBe(0);
  });
});
