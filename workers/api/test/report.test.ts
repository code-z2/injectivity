// Post-mortem finalisation: per-field verification, dropped entries and
// renumbered citations; v2 reports through the reports route and PDF.
import { describe, expect, test } from 'bun:test';
import { Ledger } from '@/agent/ledger';
import { finalise, type PostMortem, type ReportV2 } from '@/agent/report';
import { renderPostMortemPdf } from '@/export/postmortem';

const A = '0xa4b2fd68593b6f34e51cb9edb66e71c1b4ab449e';

function ledger() {
  const l = new Ledger();
  l.add({
    kind: 'dataset',
    ref: 'exploits/bybit',
    title: 'Bybit',
    excerpt: `Bybit was exploited on 2025-02-21; loss $1,400,000,000. Attackers: ${A}`,
  });
  l.add({
    kind: 'tx',
    ref: '0xabc',
    title: 'tx',
    excerpt: `On 2025-02-21T14:43:23Z ${A} sent 10000 stETH to ParaSwap`,
  });
  l.add({ kind: 'computed', ref: 'c', title: 'c', excerpt: 'Over 45 transfers' });
  return l;
}

const draft: PostMortem = {
  title: 'Bybit exploit [S1]',
  summary: 'Bybit lost $1.4 billion [S1]. It lost $3 billion [S1].',
  timeline: [
    { at: '2025-02-21', event: 'The exploiter swapped 10,000 stETH [S2].' },
    { at: '2025-03-01', event: 'Funds moved again [S2].' },
    { at: '2025-02-21', event: 'Something happened.' },
  ],
  how: 'The attacker swapped through ParaSwap [S2].',
  fundFlow: '10,000 stETH went to ParaSwap [S2].\n\nWe covered 45 transfers [S3].',
  actors: [
    { name: 'Exploiter', address: A, role: 'attacker', basis: 'Listed in the dataset [S1].' },
    {
      name: 'Ghost',
      address: `0x${'2'.repeat(40)}`,
      role: 'intermediary',
      basis: 'Seen in a transfer [S2].',
    },
  ],
  impact: 'Bybit lost $1.4 billion [S1].',
  assumptions: [
    { statement: 'The swap was laundering.', basis: 'It happened minutes after the drain [S2].' },
    { statement: 'Unbacked guess.', basis: 'None.' },
  ],
  method: 'We analysed 45 transfers [S3].',
};

describe('finalise', () => {
  test('drops failing sentences and entries, renumbers by first use', () => {
    const { postMortem: pm, sources, removed } = finalise(draft, ledger());
    expect(pm.title).toBe('Bybit exploit');
    expect(pm.summary).toBe('Bybit lost $1.4 billion [1].');
    expect(pm.timeline).toEqual([
      { at: '2025-02-21', event: 'The exploiter swapped 10,000 stETH [2].' },
    ]);
    expect(pm.actors.map((a) => a.name)).toEqual(['Exploiter']);
    expect(pm.assumptions.map((a) => a.statement)).toEqual(['The swap was laundering.']);
    expect(pm.fundFlow).toBe('10,000 stETH went to ParaSwap [2].\n\nWe covered 45 transfers [3].');
    expect(sources.map((s) => [s.n, s.ref])).toEqual([
      [1, 'exploits/bybit'],
      [2, '0xabc'],
      [3, 'c'],
    ]);
    expect(removed).toBeGreaterThanOrEqual(3);
  });

  test('renders a PDF', async () => {
    const { postMortem, sources } = finalise(draft, ledger());
    const r: ReportV2 = {
      version: 2,
      chain: 'ethereum',
      addresses: [A],
      postMortem,
      sources,
      meta: { model: 'm', removed: 0, generatedAt: '2026-11-02' },
    };
    const pdf = await renderPostMortemPdf('2026-11-02T00:00:00Z', r);
    expect(new TextDecoder().decode(pdf.slice(0, 5))).toBe('%PDF-');
  });
});

describe('keyed report routes', () => {
  test('page data needs the owner token; the PDF only the key; ids never serve v2', async () => {
    const { makeTestEnv } = await import('./harness');
    const { sha256Hex } = await import('@/agent/reportKeys');
    const { app, env, db } = makeTestEnv();
    const { postMortem, sources } = finalise(draft, ledger());
    const body: ReportV2 = {
      version: 2,
      chain: 'ethereum',
      addresses: [A],
      postMortem,
      sources,
      meta: { model: 'm', removed: 0, generatedAt: '' },
    };
    const key = 'a'.repeat(32);
    const token = 'b'.repeat(48);
    db.prepare(
      'INSERT INTO reports (id, title, body, created_at, key, owner_hash) VALUES (?,?,?,?,?,?)',
    ).run(
      9,
      'Bybit exploit',
      JSON.stringify(body),
      '2026-11-03T00:00:00Z',
      key,
      await sha256Hex(token),
    );
    const go = (path: string, headers: Record<string, string> = {}) =>
      app.fetch(new Request(`http://test${path}`, { headers }), env);

    expect((await go(`/v1/r/${key}`)).status).toBe(403);
    expect((await go(`/v1/r/${key}`, { 'x-report-owner': 'c'.repeat(48) })).status).toBe(403);
    const ok = await go(`/v1/r/${key}`, { 'x-report-owner': token });
    expect(ok.status).toBe(200);
    expect(((await ok.json()) as { postMortem: PostMortem }).postMortem.title).toBe(
      'Bybit exploit',
    );

    const pdf = await go(`/v1/r/${key}/pdf`);
    expect(pdf.status).toBe(200);
    expect(pdf.headers.get('content-type')).toBe('application/pdf');

    expect((await go(`/v1/r/${'f'.repeat(32)}/pdf`)).status).toBe(404);
    expect((await go('/v1/reports/9')).status).toBe(404);
  });
});
