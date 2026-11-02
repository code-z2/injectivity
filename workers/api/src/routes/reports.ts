// INFRA-2 route: GET /v1/reports/:id.pdf renders a saved investigation
// as a four-section PDF (snapshot, paths, risk split, findings+sources).
// Trace and risk context are re-derived cache-first at export time so the
// stored row stays a plain report body.
import { Hono } from 'hono';
import { alchemyClient } from '@/alchemy';
import type { ReportV2 } from '@/agent/report';
import { retractFromReport } from '@/agent/memory/store';
import { renderIntelPdf } from '@/export/pdf';
import { renderPostMortemPdf } from '@/export/postmortem';
import type { IntelReport } from '@/llm/investigate';
import { assessRisk } from '@/stores/risk';
import { nowIso } from '@/stores/transfers';
import { traceFunds } from '@/stores/trace';
import type { AlchemyClient, Env } from '@/types';

interface StoredReport {
  id: number;
  title: string;
  body: string;
  created_at: string;
}

export function createReportsRoutes(client: AlchemyClient = alchemyClient) {
  const routes = new Hono<{ Bindings: Env }>();

  routes.get('/v1/reports/:id', async (c) => {
    const id = Number(c.req.param('id'));
    if (!Number.isInteger(id) || id <= 0) return c.json({ error: 'invalid report id' }, 400);
    const row = await c.env.DB.prepare(
      'SELECT id, title, body, created_at FROM reports WHERE id = ?',
    )
      .bind(id)
      .first<StoredReport>();
    if (!row) return c.json({ error: 'report not found' }, 404);

    let parsed: unknown = null;
    try {
      parsed = JSON.parse(row.body);
    } catch {
      return c.json({ error: 'stored report is not readable JSON' }, 502);
    }
    // v2: the agent's post-mortem.
    if ((parsed as { version?: number })?.version === 2) {
      const v2 = parsed as ReportV2;
      if (c.req.query('format') !== 'pdf')
        return c.json({ id: row.id, title: row.title, created_at: row.created_at, ...v2 });
      const pdf = await renderPostMortemPdf(row.id, row.created_at, v2);
      return new Response(pdf.buffer as ArrayBuffer, {
        headers: {
          'content-type': 'application/pdf',
          'content-disposition': `attachment; filename="report-${row.id}.pdf"`,
        },
      });
    }
    // Current envelope {address, chain, report}; legacy rows stored the
    // report object directly (address/chain then unknown).
    const env = (parsed ?? {}) as { address?: string; chain?: string; report?: IntelReport };
    const report: IntelReport = env.report ?? (parsed as IntelReport);
    if (!report || !Array.isArray(report.findings)) {
      return c.json({ error: 'stored report has no findings array' }, 502);
    }
    const address = typeof env.address === 'string' ? env.address : null;
    const chain = typeof env.chain === 'string' ? env.chain : null;

    let riskLevel = 'unknown';
    let exact: { listRef: string; via: string | null }[] = [];
    let inferred: { listRef: string; via: string | null }[] = [];
    let pathsOut: string[][] = [];
    let pathsIn: string[][] = [];
    let edgeCount = 0;
    let nodes: { address: string; depth: number }[] = [];
    let edges: { from: string; to: string }[] = [];
    let traceNote: string | null =
      'address/chain not stored with this report; showing report only.';
    if (address && chain) {
      const assessment = await assessRisk(c.env, client, chain, address);
      riskLevel = assessment.level;
      for (const m of assessment.matches) {
        const entry = { listRef: `${m.list_name}/${m.role}`, via: m.via };
        (m.match_type === 'exact' ? exact : inferred).push(entry);
      }
      const traced = await traceFunds(c.env, client, chain, address, {
        direction: 'both',
        depth: 2,
      });
      pathsOut = traced.result.pathsOut;
      pathsIn = traced.result.pathsIn;
      edgeCount = traced.result.edges.length;
      nodes = traced.result.nodes;
      edges = traced.result.edges;
      traceNote = traced.empty ? 'no cached transfers and no live RPC: nothing to trace.' : null;
    }

    if (c.req.query('format') !== 'pdf') {
      return c.json({
        id: row.id,
        title: row.title,
        created_at: row.created_at,
        address,
        chain,
        report,
      });
    }

    const pdf = await renderIntelPdf({
      reportId: row.id,
      address: address ?? '(unknown)',
      chain: chain ?? '(unknown)',
      createdAt: nowIso(),
      riskLevel,
      exact,
      inferred,
      pathsOut,
      pathsIn,
      edgeCount,
      traceNote,
      nodes,
      edges,
      report,
    });
    return new Response(pdf.buffer as ArrayBuffer, {
      headers: {
        'content-type': 'application/pdf',
        'content-disposition': `attachment; filename="intel-report-${row.id}.pdf"`,
      },
    });
  });

  // The analyst marks a report sentence as wrong: facts learned from it are
  // retracted and the correction is remembered.
  routes.post('/v1/reports/:id/feedback', async (c) => {
    const id = Number(c.req.param('id'));
    if (!Number.isInteger(id) || id <= 0) return c.json({ error: 'invalid report id' }, 400);
    const body = (await c.req.json().catch(() => null)) as { sentence?: unknown } | null;
    const sentence = typeof body?.sentence === 'string' ? body.sentence.trim() : '';
    if (!sentence || sentence.length > 2000)
      return c.json({ error: 'sentence (1-2000 chars) is required' }, 400);
    const row = await c.env.DB.prepare('SELECT id FROM reports WHERE id = ?').bind(id).first();
    if (!row) return c.json({ error: 'report not found' }, 404);
    return c.json(await retractFromReport(c.env, id, sentence));
  });

  return routes;
}
