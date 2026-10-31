// Build workers/api/sql/seed.sql from the versioned seed JSONs (stdlib only).
// Run: bun run gen:seed
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

interface OfacSeed {
  meta: { lists_branch_commit: string; fetched: string };
  sanctioned: { address: string; chains: string[]; assets: string[]; source_url: string }[];
}

interface ExploitSeed {
  meta: { generated: string };
  exploits: {
    protocol: string;
    sources?: string[];
    hacker_addresses: { address: string; chain: string; label: string }[];
    victim_addresses: { address: string; chain: string; label: string }[];
  }[];
}

// SQL string literal quoting.
const q = (s: unknown): string => `'${String(s).replace(/'/g, "''")}'`;

// Python json.dumps default separators (", ", ": ") for string arrays —
// only chain lists go through here, so this stays byte-identical to the old generator.
const pyList = (arr: string[]): string => `[${arr.map((s) => JSON.stringify(s)).join(', ')}]`;

const ofac = JSON.parse(readFileSync(join(ROOT, 'data/seeds/ofac.json'), 'utf8')) as OfacSeed;
const ex = JSON.parse(readFileSync(join(ROOT, 'data/seeds/exploits.json'), 'utf8')) as ExploitSeed;
const ofacV = ofac.meta.lists_branch_commit;
const exV = ex.meta.generated;

const rowsOfac: string[] = [];
const rowsEx: string[] = [];

for (const r of ofac.sanctioned) {
  rowsOfac.push(
    `INSERT OR REPLACE INTO risk_lists VALUES (` +
      `'OFAC SDN',${q(r.address.toLowerCase())},${q(pyList(r.chains))},'sanctioned',` +
      `${q(r.assets.join('|'))},${q(r.source_url)},${q(ofacV)});`,
  );
}

for (const e of ex.exploits) {
  const src = (e.sources ?? [''])[0];
  for (const h of e.hacker_addresses) {
    rowsEx.push(
      `INSERT OR REPLACE INTO risk_lists VALUES (` +
        `'exploit',${q(h.address.toLowerCase())},${q(pyList([h.chain]))},'attacker',` +
        `${q(e.protocol + ' / ' + h.label)},${q(src)},${q(exV)});`,
    );
  }
  for (const v of e.victim_addresses) {
    rowsEx.push(
      `INSERT OR REPLACE INTO risk_lists VALUES (` +
        `'exploit',${q(v.address.toLowerCase())},${q(pyList([v.chain]))},'victim',` +
        `${q(e.protocol + ' / ' + v.label)},${q(src)},${q(exV)});`,
    );
  }
}

const out = [
  `INSERT OR REPLACE INTO seed_versions VALUES ('OFAC SDN',${q(ofacV)},${q(ofac.meta.fetched)},${rowsOfac.length});`,
  `INSERT OR REPLACE INTO seed_versions VALUES ('exploit',${q(exV)},${q(exV)},${rowsEx.length});`,
  ...rowsOfac,
  ...rowsEx,
];
writeFileSync(join(ROOT, 'workers/api/sql/seed.sql'), out.join('\n') + '\n');
console.log(`seed.sql: ${rowsOfac.length} ofac + ${rowsEx.length} exploit rows`);
