// INT-1: end-to-end investigation loop over pinned fixtures.
// seed -> lookup -> trace -> screen -> explain -> export.
// Offline by default (no keys in env): explain asserts the 401 BYO-key gate;
// set INT1_LIVE=1 with MODEL_API_KEY (+ALCHEMY_API_KEY) to run live explain.
// Export/PDF is INFRA-2 and reported pending, not failed.
// Run: bun run int1
import { Database } from 'bun:sqlite';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApp } from '@/app';

const DIR = dirname(fileURLToPath(import.meta.url));
const ROOT = join(DIR, '..');

// Pinned fixtures: one sanctioned, one exploit-linked, one clean.
const FIX = {
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
  // Synthetic 2-hop bridge: sanctioned -> MID -> exploit. Asserted label-free
  // before wiring, so the screen step proves the verified/inferred split.
  mid: { address: '0x0000000000000000000000000000000000000002', chain: 'ethereum' },
} as const;

// In-memory DB from the committed schema + seed: loop never touches real D1.
const db = new Database(':memory:');
db.exec(readFileSync(join(ROOT, 'sql', 'schema.sql'), 'utf8'));
db.exec(readFileSync(join(ROOT, 'sql', 'seed.sql'), 'utf8'));

// Minimal D1 stub over node:sqlite.
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

// Offline proof: any live Alchemy call throws loudly instead of hitting net.
const offlineAlchemy = new Proxy(
  {},
  {
    get: () => () => {
      throw new Error('INT-1 offline: live Alchemy call attempted');
    },
  },
);

const app = createApp({ alchemy: offlineAlchemy as never });
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const env = { DB } as any;

async function get(path: string) {
  const res = await app.fetch(new Request(`http://int1${path}`), env);
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
}

async function post(path: string, json: unknown, headers: Record<string, string> = {}) {
  const res = await app.fetch(
    new Request(`http://int1${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body: JSON.stringify(json),
    }),
    env,
  );
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
}

const results: [string, boolean, string][] = [];
function check(name: string, ok: boolean, detail = '') {
  results.push([name, ok, detail]);
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
}

const lo = (s: string) => s.toLowerCase();

// Wire the 2-hop fixture graph (lowercase, matching store normalization).
for (const [hash, from, to] of [
  [`0x${'a'.repeat(64)}`, FIX.sanctioned.address, FIX.mid.address],
  [`0x${'b'.repeat(64)}`, FIX.mid.address, FIX.exploit.address],
] as const) {
  db.prepare(
    `INSERT INTO transfers (tx_hash, chain, from_addr, to_addr, asset, amount, block_number, raw, fetched_at)
     VALUES (?,?,?,?,?,?,?,?,?)`,
  ).run(hash, 'ethereum', lo(from), lo(to), 'ETH', '1.0', 21000000, '{}', new Date().toISOString());
}

// 1. lookup sanctioned -> verified
{
  const r = await get(`/v1/address/ethereum/${FIX.sanctioned.address}`);
  const risk = r.body.risk as { level: string } | undefined;
  const labels = (r.body.labels as { list_name: string; role: string }[]) ?? [];
  check(
    'lookup-sanctioned',
    r.status === 200 &&
      risk?.level === 'verified' &&
      labels.some((l) => l.list_name === FIX.sanctioned.list && l.role === FIX.sanctioned.role),
    `status=${r.status} level=${risk?.level}`,
  );
}

// 2. lookup exploit -> verified
{
  const r = await get(`/v1/address/ethereum/${FIX.exploit.address}`);
  const risk = r.body.risk as { level: string } | undefined;
  const labels = (r.body.labels as { list_name: string; role: string }[]) ?? [];
  check(
    'lookup-exploit',
    r.status === 200 &&
      risk?.level === 'verified' &&
      labels.some((l) => l.list_name === FIX.exploit.list && l.role === FIX.exploit.role),
    `status=${r.status} level=${risk?.level}`,
  );
}

// 3. lookup clean -> none, no labels
{
  const r = await get(`/v1/address/ethereum/${FIX.clean.address}`);
  const risk = r.body.risk as { level: string } | undefined;
  const labels = (r.body.labels as unknown[]) ?? [];
  check(
    'lookup-clean',
    r.status === 200 && risk?.level === 'none' && labels.length === 0,
    `status=${r.status} level=${risk?.level}`,
  );
}

// 4. history: cached transfers for sanctioned
{
  const r = await get(`/v1/address/ethereum/${FIX.sanctioned.address}/transfers`);
  const t = (r.body.transfers as unknown[]) ?? [];
  check('history-cached', r.status === 200 && t.length >= 1, `status=${r.status} n=${t.length}`);
}

// 5. trace: sanctioned depth 2 reaches exploit, fully offline
{
  const r = await get(`/v1/trace/ethereum/${FIX.sanctioned.address}?depth=2`);
  const edges = (r.body.edges as { from?: string; to?: string }[]) ?? [];
  const paths = (r.body.pathsOut as string[][]) ?? [];
  const stats = r.body.stats as { liveCalls: number } | undefined;
  const reaches = paths.some((p) => p.at(-1) === lo(FIX.exploit.address));
  check(
    'trace-two-hop',
    r.status === 200 && edges.length >= 2 && reaches && stats?.liveCalls === 0,
    `status=${r.status} edges=${edges.length} reaches=${reaches} liveCalls=${stats?.liveCalls}`,
  );
}

// 6. screen: MID is inferred (R1 via sanctioned), never verified
{
  const r = await get(`/v1/address/ethereum/${FIX.mid.address}`);
  const risk = r.body.risk as
    { level: string; matches: { match_type: string; via: string | null }[] } | undefined;
  const labels = (r.body.labels as unknown[]) ?? [];
  const inferred = (risk?.matches ?? []).some(
    (m) => m.match_type === 'inferred:R1' && m.via === lo(FIX.sanctioned.address),
  );
  check(
    'screen-inferred-split',
    r.status === 200 && risk?.level === 'inferred' && inferred && labels.length === 0,
    `status=${r.status} level=${risk?.level}`,
  );
}

// 7. invalid inputs rejected
{
  const a = await get(`/v1/address/solana/${FIX.clean.address}`);
  const b = await get(`/v1/address/ethereum/0x1234`);
  check('invalid-rejected', a.status === 400 && b.status !== 200, `${a.status}/${b.status}`);
}

// 8. explain: offline asserts the BYO-key 401 gate
{
  const r = await post('/v1/investigate', {
    chain: 'ethereum',
    address: FIX.sanctioned.address,
  });
  check('explain-offline-gate', r.status === 401, `status=${r.status}`);
}

// 9. explain live (opt-in): INT1_LIVE=1 with keys in env
if (process.env.INT1_LIVE === '1' && process.env.MODEL_API_KEY) {
  const r = await post(
    '/v1/investigate',
    { chain: 'ethereum', address: FIX.exploit.address, depth: 1, fanout: 5 },
    process.env.INT1_MODEL_KEY ? { 'x-model-key': process.env.INT1_MODEL_KEY } : {},
  );
  const findings = (r.body.report as { findings?: unknown[] } | undefined)?.findings;
  check(
    'explain-live',
    r.status === 200 && Array.isArray(findings),
    `status=${r.status} findings=${Array.isArray(findings) ? findings.length : 'n/a'}`,
  );
} else {
  console.log('skip explain-live (set INT1_LIVE=1 with MODEL_API_KEY for the live pass)');
}

// 10. export: PDF path is INFRA-2
console.log(
  'pending export-pdf (INFRA-2: report template + graph snapshot + risk split + sources)',
);

const failed = results.filter(([, ok]) => !ok);
console.log(`\nINT-1: ${results.length - failed.length}/${results.length} green`);
if (failed.length > 0) process.exit(1);
