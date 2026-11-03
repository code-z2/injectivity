// Curated memory: verified, new, important facts the agent keeps between
// investigations, each with its sources. Similarity is lexical (exact
// subject, then word overlap) so memory works without an embedding index.
import type { SourceKind } from '@/agent/ledger';
import type { Env } from '@/types';

export type FactKind = 'attribution' | 'cluster' | 'mechanism' | 'pattern' | 'label' | 'correction';
export const FACT_KINDS: FactKind[] = [
  'attribution',
  'cluster',
  'mechanism',
  'pattern',
  'label',
  'correction',
];

export interface FactSource {
  kind: SourceKind;
  ref: string;
  excerpt: string;
  url?: string;
}

export interface Fact {
  id: number;
  kind: FactKind;
  subject: string;
  chain: string;
  statement: string;
  confidence: 'high' | 'medium';
  status: 'active' | 'superseded' | 'retracted';
  learned_from: number | null;
  created_at: string;
  sources: FactSource[];
}

export interface Candidate {
  kind: FactKind;
  subject: string;
  chain: string;
  statement: string;
  confidence: 'high' | 'medium';
  sources: FactSource[];
}

const STOP = new Set(
  'the a an of to in on at by for and or is was were be been it its this that with from as which'.split(
    ' ',
  ),
);
const words = (s: string) =>
  new Set(
    s
      .toLowerCase()
      .replace(/\[\d+\]/g, ' ')
      .split(/[^a-z0-9.$]+/)
      .map((w) => w.replace(/^\.+|\.+$/g, ''))
      .filter((w) => w.length > 1 && !STOP.has(w)),
  );

/** Word-overlap similarity (Jaccard) of two statements, 0–1. */
export function similarity(a: string, b: string): number {
  const x = words(a);
  const y = words(b);
  if (!x.size || !y.size) return 0;
  let both = 0;
  for (const w of x) if (y.has(w)) both++;
  return both / (x.size + y.size - both);
}

async function withSources(env: Env, rows: Omit<Fact, 'sources'>[]): Promise<Fact[]> {
  if (!rows.length) return [];
  const ids = rows.map((r) => r.id);
  const src =
    (
      await env.DB.prepare(
        `SELECT fact_id, kind, ref, excerpt, url FROM memory_sources WHERE fact_id IN (${ids.map(() => '?').join(',')})`,
      )
        .bind(...ids)
        .all<FactSource & { fact_id: number; url: string }>()
    ).results ?? [];
  return rows.map((r) => ({
    ...r,
    sources: src
      .filter((s) => s.fact_id === r.id)
      .map(({ kind, ref, excerpt, url }) => ({ kind, ref, excerpt, ...(url ? { url } : {}) })),
  }));
}

/** Active facts about any of these subjects, plus those matching the query words. */
export async function recallFacts(
  env: Env,
  opts: { subjects?: string[]; query?: string; limit?: number },
): Promise<Fact[]> {
  const subjects = (opts.subjects ?? []).map((s) => s.toLowerCase()).slice(0, 50);
  const terms = [...words(opts.query ?? '')].filter((w) => w.length > 3).slice(0, 6);
  const clauses: string[] = [];
  const binds: unknown[] = [];
  if (subjects.length) {
    clauses.push(`subject IN (${subjects.map(() => '?').join(',')})`);
    binds.push(...subjects);
  }
  for (const t of terms) {
    clauses.push('lower(statement) LIKE ?');
    binds.push(`%${t}%`);
  }
  if (!clauses.length) return [];
  const rows =
    (
      await env.DB.prepare(
        `SELECT id, kind, subject, chain, statement, confidence, status, learned_from, created_at
         FROM memory_facts WHERE status = 'active' AND (${clauses.join(' OR ')})
         ORDER BY confidence = 'high' DESC, updated_at DESC LIMIT ?`,
      )
        .bind(...binds, opts.limit ?? 12)
        .all<Omit<Fact, 'sources'>>()
    ).results ?? [];
  return withSources(env, rows);
}

export type WriteOutcome =
  | { action: 'added'; id: number }
  | { action: 'merged'; id: number }
  | { action: 'conflict'; id: number }
  | { action: 'skipped'; reason: string };

/**
 * Store a gated candidate: a near-duplicate of an active fact on the same
 * subject adds its sources there; an attribution or label that disagrees
 * with an existing one goes to the conflicts queue; otherwise it's new.
 */
export async function writeFact(
  env: Env,
  c: Candidate,
  reportId: number | null,
): Promise<WriteOutcome> {
  const subject = c.subject.toLowerCase();
  const existing =
    (
      await env.DB.prepare(
        `SELECT id, kind, statement FROM memory_facts WHERE subject = ? AND status = 'active'`,
      )
        .bind(subject)
        .all<{ id: number; kind: FactKind; statement: string }>()
    ).results ?? [];
  const at = new Date().toISOString();
  const near = existing
    .map((e) => ({ ...e, sim: similarity(e.statement, c.statement) }))
    .sort((a, b) => b.sim - a.sim)[0];

  if (near && near.sim >= 0.6) {
    await addSources(env, near.id, c.sources);
    await env.DB.prepare('UPDATE memory_facts SET updated_at = ? WHERE id = ?')
      .bind(at, near.id)
      .run();
    return { action: 'merged', id: near.id };
  }
  const rival = existing.find(
    (e) => e.kind === c.kind && (c.kind === 'attribution' || c.kind === 'label'),
  );
  if (rival) {
    await env.DB.prepare(
      'INSERT INTO memory_conflicts (fact_id, candidate, sources_json, created_at) VALUES (?,?,?,?)',
    )
      .bind(rival.id, c.statement, JSON.stringify(c.sources), at)
      .run();
    return { action: 'conflict', id: rival.id };
  }
  const res = (await env.DB.prepare(
    `INSERT INTO memory_facts (kind, subject, chain, statement, confidence, status, learned_from, created_at, updated_at)
     VALUES (?,?,?,?,?,'active',?,?,?)`,
  )
    .bind(c.kind, subject, c.chain, c.statement, c.confidence, reportId, at, at)
    .run()) as unknown as { meta?: { last_row_id?: number } };
  const id = res.meta?.last_row_id;
  if (typeof id !== 'number') return { action: 'skipped', reason: 'insert failed' };
  await addSources(env, id, c.sources);
  return { action: 'added', id };
}

async function addSources(env: Env, factId: number, sources: FactSource[]) {
  const stmts = sources.map((s) =>
    env.DB.prepare(
      'INSERT OR IGNORE INTO memory_sources (fact_id, kind, ref, excerpt, url) VALUES (?,?,?,?,?)',
    ).bind(factId, s.kind, s.ref, s.excerpt.slice(0, 1000), s.url ?? ''),
  );
  if (stmts.length) await env.DB.batch(stmts);
}

/**
 * The analyst marked a report sentence wrong: retract facts learned from
 * that report that say the same thing, and keep the correction.
 */
export async function retractFromReport(
  env: Env,
  reportId: number,
  sentence: string,
): Promise<{ retracted: number[] }> {
  const rows =
    (
      await env.DB.prepare(
        `SELECT id, statement FROM memory_facts WHERE learned_from = ? AND status = 'active'`,
      )
        .bind(reportId)
        .all<{ id: number; statement: string }>()
    ).results ?? [];
  const hit = rows.filter((r) => similarity(r.statement, sentence) >= 0.35).map((r) => r.id);
  const at = new Date().toISOString();
  for (const id of hit)
    await env.DB.prepare(
      `UPDATE memory_facts SET status = 'retracted', updated_at = ? WHERE id = ?`,
    )
      .bind(at, id)
      .run();
  await env.DB.prepare(
    `INSERT INTO memory_facts (kind, subject, chain, statement, confidence, status, learned_from, created_at, updated_at)
     VALUES ('correction', ?, '', ?, 'high', 'active', ?, ?, ?)`,
  )
    .bind(
      `report:${reportId}`,
      `An analyst marked this report statement as wrong: "${sentence.slice(0, 500)}"`,
      reportId,
      at,
      at,
    )
    .run();
  return { retracted: hit };
}
