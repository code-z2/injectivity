// Evals: run the agent end to end on exploits whose answers are known (from
// the curated dataset) and score the reports. Costs model and RPC calls, so
// it runs by hand, not in CI. Usage: bun run eval [count=3] [offset=0]
// Scores per report:
//   attacker  — the dataset's attacker address is among the report's actors
//   loss      — a figure within 10% of the dataset loss appears in the report
//   tx        — an exploit tx hash appears in the report or its sources
//   cited     — every section that has text carries citations
//   clean     — no next steps, recommendations or questions
//   kept      — share of draft sentences that survived the verifier
import { writeFileSync } from 'node:fs';
import { alchemyClient } from '@/alchemy';
import type { Source } from '@/agent/ledger';
import type { ReportV2 } from '@/agent/report';
import {
  type Entry,
  type Meta,
  SessionCore,
  type SessionState,
  type SessionStore,
} from '@/agent/session';
import type { Workspace } from '@/agent/tools/types';
import { close, figuresIn } from '@/agent/verify';
import type { Msg } from '@/llm/adapters';
import type { Env } from '@/types';
import { devVars, localD1 } from './local';

class MemoryStore implements SessionStore {
  s: SessionState = { meta: null, messages: [], sources: [], transcript: [], workspace: null };
  async load() {
    return structuredClone(this.s);
  }
  async setMeta(m: Meta) {
    this.s.meta = m;
  }
  async setWorkspace(w: Workspace) {
    this.s.workspace = w;
  }
  async append(a: { messages?: Msg[]; sources?: Source[]; transcript?: Entry[] }) {
    this.s.messages.push(...(a.messages ?? []));
    this.s.sources.push(...(a.sources ?? []));
    this.s.transcript.push(...(a.transcript ?? []));
  }
}

const [count = '3', offset = '0'] = process.argv.slice(2);
const env = { ...devVars(), DB: localD1() } as unknown as Env;

interface Case {
  id: string;
  protocol: string;
  loss_usd: number;
  body: string;
}
const cases =
  (
    await env.DB.prepare(
      `SELECT id, protocol, loss_usd, body FROM exploits
       WHERE chains LIKE '%ethereum%' AND loss_usd > 5000000 ORDER BY loss_usd DESC LIMIT ? OFFSET ?`,
    )
      .bind(Number(count), Number(offset))
      .all<Case>()
  ).results ?? [];

const results: Record<string, unknown>[] = [];
for (const c of cases) {
  const e = JSON.parse(c.body) as {
    hacker_addresses: { address: string; chain: string }[];
    exploit_txs: { hash: string }[];
  };
  const attacker = e.hacker_addresses.find((h) => h.chain === 'ethereum')?.address.toLowerCase();
  if (!attacker) continue;
  const t0 = Date.now();
  const store = new MemoryStore();
  const session = new SessionCore(store, env, alchemyClient);
  await session.init('ethereum', attacker);
  let error = '';
  let reportId: number | null = null;
  let removed = 0;
  const onEvent = (ev: { type: string; [k: string]: unknown }) => {
    if (ev.type === 'error') error = String(ev.error);
    if (ev.type === 'report') {
      reportId = ev.reportId as number;
      removed = ev.removed as number;
    }
  };
  console.error(`\n▶ ${c.protocol} (${attacker})`);
  await session.ask('Who is this address, what happened, and where did the funds go?', { onEvent });
  if (!error) await session.report({ onEvent });
  if (!reportId) {
    results.push({ case: c.protocol, error: error || 'no report' });
    console.error(`  ✗ ${error || 'no report'}`);
    continue;
  }
  const row = await env.DB.prepare('SELECT body FROM reports WHERE id = ?')
    .bind(reportId)
    .first<{ body: string }>();
  const r = JSON.parse(row!.body) as ReportV2;
  const pm = r.postMortem;
  const sections = [pm.summary, pm.how, pm.fundFlow, pm.impact, pm.method];
  const all = [
    ...sections,
    ...pm.timeline.map((t) => t.event),
    ...pm.actors.map((a) => `${a.address} ${a.basis}`),
    ...pm.assumptions.flatMap((a) => [a.statement, a.basis]),
  ].join('\n');
  const sentences = all.split(/(?<=[.!?])\s+/).filter((s) => s.trim()).length;
  const lossFig = { value: c.loss_usd, sig: 6, text: '' };
  const score = {
    case: c.protocol,
    reportId,
    attacker: pm.actors.some((a) => a.address.toLowerCase() === attacker),
    loss: figuresIn(all).some(
      (f) => Math.abs(f.value - c.loss_usd) <= 0.1 * c.loss_usd || close(f, lossFig),
    ),
    tx: e.exploit_txs.some(
      (t) =>
        all.toLowerCase().includes(t.hash.toLowerCase()) ||
        r.sources.some((s) => s.ref.toLowerCase().startsWith(t.hash.toLowerCase())),
    ),
    cited: sections.every((s) => !s.trim() || /\[\d+\]/.test(s)),
    clean: !/\?|next step|recommend|should (?:be|consider)|further investigation/i.test(all),
    kept: sentences ? Math.round((100 * sentences) / (sentences + removed)) / 100 : 0,
    sources: r.sources.length,
    seconds: Math.round((Date.now() - t0) / 1000),
  };
  results.push(score);
  console.error(`  ${JSON.stringify(score)}`);
}

const out = `eval-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
writeFileSync(out, JSON.stringify(results, null, 2));
const ok = (k: string) => results.filter((r) => r[k] === true).length;
console.log(
  `\n${results.length} cases · attacker ${ok('attacker')} · loss ${ok('loss')} · tx ${ok('tx')} · cited ${ok('cited')} · clean ${ok('clean')} → ${out}`,
);
