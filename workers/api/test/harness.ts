// Shared TST-1/INT-1 harness: in-memory DB from committed schema + seed,
// minimal D1 stub, and an offline Alchemy client that throws on any live call.
import { Database } from 'bun:sqlite';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApp } from '@/app';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

export function makeTestEnv() {
  const db = new Database(':memory:');
  db.exec(readFileSync(join(ROOT, 'sql', 'schema.sql'), 'utf8'));
  db.exec(readFileSync(join(ROOT, 'sql', 'seed.sql'), 'utf8'));

  const DB = {
    prepare(sql: string) {
      const stmt = db.prepare(sql);
      return {
        bind(...p: unknown[]) {
          return {
            async all() {
              return { results: stmt.all(...(p as [])) };
            },
            async first() {
              return stmt.get(...(p as [])) ?? null;
            },
            async run() {
              return { success: true };
            },
          };
        },
      };
    },
    async batch(stmts: { run(): Promise<unknown> }[]) {
      for (const s of stmts) await s.run();
      return [];
    },
  };

  const offlineAlchemy = new Proxy(
    {},
    {
      get: () => () => {
        throw new Error('offline test: live Alchemy call attempted');
      },
    },
  );

  const app = createApp({ alchemy: offlineAlchemy as never });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const env = { DB } as any;
  return { app, env, db };
}

export async function get(
  app: ReturnType<typeof createApp>,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  env: any,
  path: string,
) {
  const res = await app.fetch(new Request(`http://test${path}`), env);
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
}

export const lo = (s: string) => s.toLowerCase();

// Pinned INT-1 fixtures, shared with the loop script and regression suite.
export const FIX = {
  sanctioned: {
    address: '0x0330070FD38Ec3bB94F58FA55D40368271E9e54A',
    chain: 'ethereum',
    list: 'OFAC SDN',
    role: 'sanctioned',
  },
  exploit: {
    address: '0x8B1b6c9A6DB1304000412dd21Ae6A70a82d60D3b',
    chain: 'ethereum',
    list: 'exploit',
    role: 'attacker',
  },
  clean: {
    address: '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045',
    chain: 'ethereum',
  },
  mid: { address: '0x0000000000000000000000000000000000000002', chain: 'ethereum' },
} as const;
