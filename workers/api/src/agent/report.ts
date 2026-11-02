// The post-mortem report. The writer model gets the conversation's verified
// answers and the full evidence ledger, and returns a structured report
// with [S#] citations. Every field then goes through the verifier; what
// survives is renumbered [1], [2], … in order of first use, and only the
// cited sources are kept.
import { citedIds, type Ledger, type Source } from '@/agent/ledger';
import { verifyText } from '@/agent/verify';
import type { ModelAdapter, ModelConfig } from '@/llm/adapters';

export interface PostMortem {
  title: string;
  summary: string;
  timeline: { at: string; event: string }[];
  how: string;
  fundFlow: string;
  actors: { name: string; address: string; role: string; basis: string }[];
  impact: string;
  assumptions: { statement: string; basis: string }[];
  method: string;
}

export interface ReportSource {
  n: number;
  kind: Source['kind'];
  title: string;
  excerpt: string;
  ref: string;
  chain?: string;
  url?: string;
  page?: number;
}

export interface ReportV2 {
  version: 2;
  chain: string;
  addresses: string[];
  postMortem: PostMortem;
  sources: ReportSource[];
  meta: { model: string; removed: number; generatedAt: string };
}

export const SWEEP_PROMPT = `Before the report is written, check the evidence covers what a post-mortem needs, and research any gap now with your tools:
1. Who the root address is (labels, the exploits dataset, recall).
2. The incident itself: date, victim, loss, mechanism and attribution (exploit transactions, the contracts involved). If web search is available, search for the incident and read at least two independent write-ups with read_page (or read_pdf) so the mechanism and attribution can be cited.
3. Where the funds went from every address in the analyst's chain, and where the largest amounts sit now (balances).
Don't repeat lookups already done. When the evidence is sufficient, reply with one short sentence saying so.`;

export const WRITER_PROMPT = `You write the final report of an on-chain security investigation: a post-mortem for readers who were not part of it. You are given the investigation's verified findings and its evidence ledger (sources S1, S2, … each with an excerpt). Use nothing else.

## Content
- title: incident-style, e.g. "Bybit cold-wallet exploit, February 2025".
- summary: four to six sentences: what happened, to whom, when, how much, and where the money is now.
- timeline: the key dated events in order (ISO date or date-time in "at"), one sentence each.
- how: the mechanism in plain language: what the attacker did, which contracts and functions, why it worked.
- fundFlow: where the money went, hop by hop, with amounts, the protocols and services used (swaps, bridges, mixers, exchanges), and where it sits now.
- actors: each address that matters, a short name, its role (attacker, victim, intermediary, service…), and the basis for that role.
- impact: who lost what, in totals.
- assumptions: every conclusion that is inferred rather than shown directly, stated concretely with what it rests on.
- method: what was analysed, as facts: which addresses, how many transfers and hops, which data sources, whether the web was consulted. Name limits plainly ("funds beyond the second hop were not followed").

## Rules (hard)
- Every sentence ends with the sources it rests on: "… drained 401,347 ETH [S4][S9]." Each actor's basis and each assumption's basis cite too.
- Figures must match their sources, but write them for people: "$1.4 billion", "about 401,000 ETH", "50,000 stETH", "21 February 2025 at 14:13 UTC". Rounding is fine; changing a value is not. Write addresses and hashes exactly, in full, the first time; afterwards use the actor's name ("the exploiter", "the first laundering wallet").
- No next steps, recommendations, open questions or speculation. An unknown becomes an assumption (with its basis) or a statement in method.

## Style
- Plain prose a non-specialist can follow, in short paragraphs separated by a blank line. Vary sentence structure; never chain items with "and … and …" — use commas, or a short series of sentences.
- Write labels as names ("listed as the Bybit hacker"), not as data ("Bybit / hacker").
- Focus on what is material: the stolen assets, the main laundering routes, where value ended up. Mention dust, airdrops and spam tokens at most once, as such.
- No markdown headings, lists or code formatting inside fields.`;

const SCHEMA = {
  name: 'post_mortem',
  schema: {
    type: 'object',
    properties: {
      title: { type: 'string' },
      summary: { type: 'string' },
      timeline: {
        type: 'array',
        items: {
          type: 'object',
          properties: { at: { type: 'string' }, event: { type: 'string' } },
          required: ['at', 'event'],
          additionalProperties: false,
        },
      },
      how: { type: 'string' },
      fundFlow: { type: 'string' },
      actors: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            address: { type: 'string' },
            role: { type: 'string' },
            basis: { type: 'string' },
          },
          required: ['name', 'address', 'role', 'basis'],
          additionalProperties: false,
        },
      },
      impact: { type: 'string' },
      assumptions: {
        type: 'array',
        items: {
          type: 'object',
          properties: { statement: { type: 'string' }, basis: { type: 'string' } },
          required: ['statement', 'basis'],
          additionalProperties: false,
        },
      },
      method: { type: 'string' },
    },
    required: [
      'title',
      'summary',
      'timeline',
      'how',
      'fundFlow',
      'actors',
      'impact',
      'assumptions',
      'method',
    ],
    additionalProperties: false,
  },
};

const EXCERPT_CHARS = 400;
const MAX_SOURCES = 500;

export function writerInput(findings: string[], ledger: Ledger, context: string): string {
  const sources = ledger
    .all()
    .slice(-MAX_SOURCES)
    .map(
      (s) =>
        `${s.id} [${s.kind}${s.chain ? `, ${s.chain}` : ''}] ${s.title}: ${s.excerpt.length > EXCERPT_CHARS ? `${s.excerpt.slice(0, EXCERPT_CHARS)}…` : s.excerpt}`,
    );
  return [
    `# Investigation\n${context}`,
    `# Verified findings from the conversation\n${findings.join('\n\n') || '(none)'}`,
    `# Evidence ledger (${sources.length} sources)\n${sources.join('\n')}`,
  ].join('\n\n');
}

export async function writePostMortem(opts: {
  adapter: ModelAdapter;
  cfg: ModelConfig;
  input: string;
  signal?: AbortSignal;
}): Promise<PostMortem> {
  const turn = await opts.adapter.run(opts.cfg, {
    system: WRITER_PROMPT,
    messages: [{ role: 'user', text: opts.input }],
    schema: SCHEMA,
    maxTokens: 24000,
    signal: opts.signal ?? AbortSignal.timeout(10 * 60_000),
  });
  const json = /\{[\s\S]*\}/.exec(turn.text)?.[0];
  if (!json) throw new Error('the writer returned no report');
  return normalise(JSON.parse(json));
}

function normalise(raw: Partial<PostMortem>): PostMortem {
  const s = (v: unknown) => (typeof v === 'string' ? v : '');
  const arr = <T>(v: unknown) => (Array.isArray(v) ? (v as T[]) : []);
  return {
    title: s(raw.title) || 'Investigation report',
    summary: s(raw.summary),
    timeline: arr<PostMortem['timeline'][number]>(raw.timeline).map((t) => ({
      at: s(t?.at),
      event: s(t?.event),
    })),
    how: s(raw.how),
    fundFlow: s(raw.fundFlow),
    actors: arr<PostMortem['actors'][number]>(raw.actors).map((a) => ({
      name: s(a?.name),
      address: s(a?.address),
      role: s(a?.role),
      basis: s(a?.basis),
    })),
    impact: s(raw.impact),
    assumptions: arr<PostMortem['assumptions'][number]>(raw.assumptions).map((a) => ({
      statement: s(a?.statement),
      basis: s(a?.basis),
    })),
    method: s(raw.method),
  };
}

/**
 * Verify every field, drop what fails, renumber citations by first use.
 * Timeline entries need a cited date; actors need their address in a cited
 * source; assumptions need a cited basis.
 */
export function finalise(
  pm: PostMortem,
  ledger: Ledger,
): { postMortem: PostMortem; sources: ReportSource[]; removed: number } {
  let removed = 0;
  const v = (text: string) => {
    const r = verifyText(text, ledger);
    removed += r.removed.length;
    return r.text;
  };
  const cited = (text: string) => citedIds(text).length > 0;

  const timeline = pm.timeline
    .map((t) => ({ at: t.at, event: v(t.event) }))
    .filter((t) => {
      if (!t.event || !cited(t.event)) return false;
      const day = /^\d{4}-\d{2}-\d{2}/.exec(t.at)?.[0];
      if (!day) return true;
      const ok = citedIds(t.event).some((id) => {
        const s = ledger.get(id);
        return s ? `${s.excerpt} ${s.ref}`.includes(day) : false;
      });
      if (!ok) removed++;
      return ok;
    });
  const actors = pm.actors
    .map((a) => ({ ...a, basis: v(a.basis) }))
    .filter((a) => {
      if (!a.basis || !cited(a.basis)) return false;
      if (!/^0x[0-9a-fA-F]{40}$/.test(a.address)) return true;
      const ok = citedIds(a.basis).some((id) =>
        `${ledger.get(id)?.excerpt ?? ''} ${ledger.get(id)?.ref ?? ''}`
          .toLowerCase()
          .includes(a.address.toLowerCase()),
      );
      if (!ok) removed++;
      return ok;
    });
  const assumptions = pm.assumptions
    .map((a) => ({ statement: v(a.statement), basis: v(a.basis) }))
    .filter((a) => a.statement && a.basis && cited(a.basis));

  const clean: PostMortem = {
    title: pm.title.replace(/\[S\d+\]/g, '').trim(),
    summary: v(pm.summary),
    timeline,
    how: v(pm.how),
    fundFlow: v(pm.fundFlow),
    actors,
    impact: v(pm.impact),
    assumptions,
    method: v(pm.method),
  };

  // Renumber in reading order.
  const order: string[] = [];
  const all = [
    clean.summary,
    ...clean.timeline.map((t) => t.event),
    clean.how,
    clean.fundFlow,
    ...clean.actors.map((a) => a.basis),
    clean.impact,
    ...clean.assumptions.flatMap((a) => [a.statement, a.basis]),
    clean.method,
  ];
  for (const text of all) for (const id of citedIds(text)) if (!order.includes(id)) order.push(id);
  const num = new Map(order.map((id, i) => [id, i + 1]));
  const re = (text: string) =>
    text.replace(/\[(S\d+(?:\s*,\s*S\d+)*)\]/g, (_, ids: string) =>
      ids
        .split(',')
        .map((id) => `[${num.get(id.trim())}]`)
        .join(''),
    );
  const postMortem: PostMortem = {
    title: clean.title,
    summary: re(clean.summary),
    timeline: clean.timeline.map((t) => ({ at: t.at, event: re(t.event) })),
    how: re(clean.how),
    fundFlow: re(clean.fundFlow),
    actors: clean.actors.map((a) => ({ ...a, basis: re(a.basis) })),
    impact: re(clean.impact),
    assumptions: clean.assumptions.map((a) => ({
      statement: re(a.statement),
      basis: re(a.basis),
    })),
    method: re(clean.method),
  };
  const sources: ReportSource[] = order.map((id, i) => {
    const s = ledger.get(id)!;
    return {
      n: i + 1,
      kind: s.kind,
      title: s.title,
      excerpt: s.excerpt,
      ref: s.ref,
      ...(s.chain ? { chain: s.chain } : {}),
      ...(s.url ? { url: s.url } : {}),
      ...(s.page ? { page: s.page } : {}),
    };
  });
  return { postMortem, sources, removed };
}
