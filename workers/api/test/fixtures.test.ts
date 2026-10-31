// TST-1: regression net over the pinned INT-1 fixtures.
import { describe, expect, test } from 'bun:test';
import { FIX, get, makeTestEnv } from './harness';

describe('pinned fixtures', () => {
  for (const [name, fix, level] of [
    ['sanctioned', FIX.sanctioned, 'verified'],
    ['exploit', FIX.exploit, 'verified'],
    ['clean', FIX.clean, 'none'],
  ] as const) {
    test(`${name} fixture resolves to ${level}`, async () => {
      const { app, env } = makeTestEnv();
      const r = await get(app, env, `/v1/address/${fix.chain}/${fix.address}`);
      const risk = r.body.risk as { level: string };
      expect(r.status).toBe(200);
      expect(risk.level).toBe(level);
    });
  }
});
