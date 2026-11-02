// Curated memory: the curator's gates, merge/conflict/new writes, recall,
// and retraction from analyst feedback.
import { describe, expect, test } from 'bun:test';
import { gate } from '@/agent/memory/curator';
import { recallFacts, retractFromReport, similarity, writeFact } from '@/agent/memory/store';
import type { ReportV2 } from '@/agent/report';
import { makeTestEnv } from './harness';

const A = '0xa4b2fd68593b6f34e51cb9edb66e71c1b4ab449e';
const P = '0x6bb000067005450704003100632eb93ea00c0000';

const report: ReportV2 = {
  version: 2,
  chain: 'ethereum',
  addresses: [A],
  postMortem: {} as never,
  sources: [
    {
      n: 1,
      kind: 'dataset',
      title: 'Bybit',
      ref: 'exploits/bybit',
      excerpt: `Bybit was exploited on 2025-02-21; loss $1,400,000,000. Attackers: ${A} (hacker)`,
    },
    { n: 2, kind: 'tx', title: 'tx', ref: '0xabc', excerpt: `${A} sent 10000 stETH to ${P}` },
    {
      n: 3,
      kind: 'computed',
      title: 'totals',
      ref: 'c',
      excerpt: 'Over 45 transfers: stETH in 90,375',
    },
    {
      n: 4,
      kind: 'web',
      title: 'News A',
      ref: 'https://a.test/x',
      url: 'https://a.test/x',
      excerpt: 'Lazarus Group was behind the Bybit hack',
    },
    {
      n: 5,
      kind: 'web',
      title: 'News A2',
      ref: 'https://a.test/y',
      url: 'https://a.test/y',
      excerpt: 'Lazarus Group was behind the Bybit hack',
    },
    {
      n: 6,
      kind: 'web',
      title: 'News B',
      ref: 'https://b.test/z',
      url: 'https://b.test/z',
      excerpt: 'Lazarus Group was behind the Bybit hack',
    },
  ],
  meta: { model: 'm', removed: 0, generatedAt: '' },
};

const p = (o: Partial<Parameters<typeof gate>[0]>) =>
  gate(
    { kind: 'attribution', subject: A, statement: '', confidence: 'high', sources: [1], ...o },
    report,
  );

describe('curator gates', () => {
  test('accepts on-chain or dataset-backed facts about a subject in its sources', () => {
    const g = p({ statement: `${A} is the Bybit exploiter that took $1.4 billion.` });
    expect('candidate' in g && g.candidate.confidence).toBe('high');
  });

  test('refuses weak, unimportant or unsupported facts', () => {
    expect(p({ kind: 'balance', statement: 'x' })).toEqual({ refused: 'not a kept kind' });
    expect(p({ subject: 'bybit', statement: 'x' })).toEqual({
      refused: 'subject is not an address, tx or protocol',
    });
    expect(p({ sources: [3], statement: 'Moved 90,375 stETH.' })).toEqual({
      refused: 'rests only on recomputable totals',
    });
    expect(
      p({
        subject: 'protocol:bybit',
        sources: [4, 5],
        statement: 'Lazarus Group was behind the Bybit hack.',
      }),
    ).toEqual({
      refused: 'needs on-chain evidence or two independent web sources',
    });
    expect(
      'candidate' in
        p({
          subject: 'protocol:bybit',
          sources: [4, 6],
          statement: 'Lazarus Group was behind the Bybit hack.',
        }),
    ).toBe(true);
    expect(p({ statement: `${A} took $9 billion.` })).toEqual({
      refused: 'not supported: $9 billion does not match the cited sources',
    });
    expect(p({ subject: P, sources: [1], statement: 'An exchange.' })).toEqual({
      refused: 'subject is not in its sources',
    });
  });
});

describe('memory store', () => {
  const cand = (statement: string, kind: 'attribution' | 'pattern' = 'attribution') => ({
    kind,
    subject: A,
    chain: 'ethereum',
    statement,
    confidence: 'high' as const,
    sources: [{ kind: 'dataset' as const, ref: 'exploits/bybit', excerpt: 'x' }],
  });

  test('new, merged, conflict; recall; retraction', async () => {
    const { env, db } = makeTestEnv();
    // The harness D1 stub doesn't execute writes; give it real ones.
    env.DB.prepare = ((sql: string) => {
      const stmt = db.prepare(sql);
      const bound = (p: unknown[]) => ({
        all: async () => ({ results: stmt.all(...(p as [])) }),
        first: async () => stmt.get(...(p as [])) ?? null,
        run: async () => {
          const r = stmt.run(...(p as []));
          return { success: true, meta: { last_row_id: Number(r.lastInsertRowid) } };
        },
      });
      return { bind: (...p: unknown[]) => bound(p), ...bound([]) };
    }) as never;
    env.DB.batch = (async (s: { run(): Promise<unknown> }[]) =>
      Promise.all(s.map((x) => x.run()))) as never;

    const first = await writeFact(env, cand(`${A} is the Bybit exploiter.`), 1);
    expect(first.action).toBe('added');
    expect((await writeFact(env, cand(`${A} is the Bybit exploiter wallet.`), 2)).action).toBe(
      'merged',
    );
    expect((await writeFact(env, cand(`${A} is a Binance hot wallet.`), 2)).action).toBe(
      'conflict',
    );
    expect(
      (await writeFact(env, cand(`${A} swaps stolen stETH through ParaSwap.`, 'pattern'), 2))
        .action,
    ).toBe('added');

    const facts = await recallFacts(env, { subjects: [A] });
    expect(facts.length).toBe(2);
    expect(facts.find((f) => f.kind === 'attribution')!.sources.length).toBe(1);
    expect((await recallFacts(env, { query: 'paraswap swaps' })).length).toBe(1);

    const { retracted } = await retractFromReport(
      env,
      2,
      `${A} swaps stolen stETH through ParaSwap`,
    );
    expect(retracted.length).toBe(1);
    expect((await recallFacts(env, { subjects: [A] })).map((f) => f.kind)).toEqual(['attribution']);
  });

  test('similarity', () => {
    expect(similarity('the Bybit exploiter', 'Bybit exploiter wallet')).toBeCloseTo(2 / 3);
    expect(similarity('a', '')).toBe(0);
  });
});
