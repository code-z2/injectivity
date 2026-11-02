// The curator runs once after a report. The model proposes candidate facts
// from the verified report; the code keeps only those that pass all three
// gates before anything is written:
//   verified  — backed on-chain or by an exact dataset hit, or by two
//               independent web sources; its figures and addresses check out;
//   important — one of the kept kinds, about an address, tx or protocol,
//               and not resting only on recomputable totals;
//   new       — not already known (store.writeFact merges or queues).
import { Ledger, type SourceKind } from '@/agent/ledger';
import type { ReportSource, ReportV2 } from '@/agent/report';
import { verifyText } from '@/agent/verify';
import type { ModelAdapter, ModelConfig } from '@/llm/adapters';
import type { Env } from '@/types';
import { type Candidate, FACT_KINDS, type FactKind, writeFact, type WriteOutcome } from './store';

const CURATOR_PROMPT = `You curate the long-term memory of an on-chain security agent. From the verified report below, propose only facts worth remembering for future investigations:
- attribution: an address belongs to an exploiter, exchange, mixer, bridge, protocol or service;
- cluster: addresses controlled by the same actor;
- mechanism: how an exploit worked;
- pattern: a laundering or movement pattern of an actor;
- label: a name for a high-volume or high-loss address.
Never propose routine transfers, one-off counterparties, balances, or anything a single lookup could recompute. Each fact: one self-contained sentence naming the subject in full, the subject key (a lowercase 0x address, a tx hash, or "protocol:<name>"), and the report source numbers it rests on. Propose at most 8. Reply with JSON only.`;

const SCHEMA = {
  name: 'memory_candidates',
  schema: {
    type: 'object',
    properties: {
      facts: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            kind: {
              type: 'string',
              enum: ['attribution', 'cluster', 'mechanism', 'pattern', 'label'],
            },
            subject: { type: 'string' },
            statement: { type: 'string' },
            confidence: { type: 'string', enum: ['high', 'medium'] },
            sources: { type: 'array', items: { type: 'integer' } },
          },
          required: ['kind', 'subject', 'statement', 'confidence', 'sources'],
          additionalProperties: false,
        },
      },
    },
    required: ['facts'],
    additionalProperties: false,
  },
};

const HARD: SourceKind[] = ['tx', 'chain_state', 'contract', 'dataset', 'document'];

export interface Proposed {
  kind: string;
  subject: string;
  statement: string;
  confidence: string;
  sources: number[];
}

/** The code-side gates. Returns a storable candidate, or why it was refused. */
export function gate(
  p: Proposed,
  report: ReportV2,
): { candidate: Candidate } | { refused: string } {
  if (!FACT_KINDS.includes(p.kind as FactKind) || p.kind === 'correction')
    return { refused: 'not a kept kind' };
  const subject = p.subject.trim().toLowerCase();
  if (!/^(0x[0-9a-f]{40}|0x[0-9a-f]{64}|protocol:[a-z0-9 ._-]{2,60})$/.test(subject))
    return { refused: 'subject is not an address, tx or protocol' };
  const cited = [...new Set(p.sources)]
    .map((n) => report.sources.find((s) => s.n === n))
    .filter((s): s is ReportSource => Boolean(s));
  if (!cited.length) return { refused: 'cites no report source' };
  if (cited.every((s) => s.kind === 'computed'))
    return { refused: 'rests only on recomputable totals' };
  const hard = cited.some((s) => HARD.includes(s.kind));
  const webDomains = new Set(
    cited
      .filter((s) => s.kind === 'web' && s.url)
      .map((s) => new URL(s.url!).hostname.replace(/^www\./, '')),
  );
  if (!hard && webDomains.size < 2)
    return { refused: 'needs on-chain evidence or two independent web sources' };

  // Figures and addresses in the statement must be in its sources.
  const ledger = new Ledger();
  const ids = cited.map((s) =>
    ledger.add({ kind: s.kind, ref: s.ref, title: s.title, excerpt: s.excerpt, url: s.url }),
  );
  const text = `${p.statement.replace(/\[\d+\]/g, '').trim()} ${ids.map((id) => `[${id}]`).join('')}`;
  const checked = verifyText(text, ledger);
  if (checked.removed.length) return { refused: `not supported: ${checked.removed[0]!.reason}` };
  if (
    subject.startsWith('0x') &&
    !cited.some((s) => `${s.ref} ${s.excerpt}`.toLowerCase().includes(subject))
  )
    return { refused: 'subject is not in its sources' };

  return {
    candidate: {
      kind: p.kind as FactKind,
      subject,
      chain: report.chain,
      statement: p.statement.replace(/\[\d+\]/g, '').trim(),
      confidence: p.confidence === 'high' && hard ? 'high' : 'medium',
      sources: cited.map((s) => ({ kind: s.kind, ref: s.ref, excerpt: s.excerpt, url: s.url })),
    },
  };
}

export async function curate(opts: {
  env: Env;
  adapter: ModelAdapter;
  cfg: ModelConfig;
  report: ReportV2;
  reportId: number;
}): Promise<{ outcomes: WriteOutcome[]; refused: { statement: string; reason: string }[] }> {
  const { report } = opts;
  const pm = report.postMortem;
  const input = [
    `# ${pm.title}`,
    pm.summary,
    pm.timeline.map((t) => `${t.at}: ${t.event}`).join('\n'),
    pm.how,
    pm.fundFlow,
    pm.actors.map((a) => `${a.name} (${a.role}, ${a.address}): ${a.basis}`).join('\n'),
    pm.impact,
    pm.assumptions.map((a) => `Assumption: ${a.statement} Basis: ${a.basis}`).join('\n'),
    `# Sources\n${report.sources.map((s) => `[${s.n}] (${s.kind}) ${s.title}: ${s.excerpt.slice(0, 300)}`).join('\n')}`,
  ].join('\n\n');
  const turn = await opts.adapter.run(opts.cfg, {
    system: CURATOR_PROMPT,
    messages: [{ role: 'user', text: input }],
    schema: SCHEMA,
    maxTokens: 8000,
    signal: AbortSignal.timeout(3 * 60_000),
  });
  const json = /\{[\s\S]*\}/.exec(turn.text)?.[0];
  const proposed = (json ? (JSON.parse(json) as { facts?: Proposed[] }).facts : []) ?? [];
  const outcomes: WriteOutcome[] = [];
  const refused: { statement: string; reason: string }[] = [];
  for (const p of proposed.slice(0, 8)) {
    const g = gate(p, report);
    if ('refused' in g) refused.push({ statement: p.statement, reason: g.refused });
    else outcomes.push(await writeFact(opts.env, g.candidate, opts.reportId));
  }
  return { outcomes, refused };
}
