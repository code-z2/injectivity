// Reports. GET /v1/reports/:id (legacy one-shot investigations; ?format=pdf
// renders a four-section PDF: snapshot, paths, risk split, findings+sources).
// Agent post-mortems live under /v1/r/:key (see below).
// Trace and risk context are re-derived cache-first at export time so the
// stored row stays a plain report body.
import { Hono } from 'hono';
import { alchemyClient } from '@/alchemy';
import type { ReportV2 } from '@/agent/report';
import { retractFromReport } from '@/agent/memory/store';
import { OWNER_TOKEN, REPORT_KEY, sameHex, sha256Hex } from '@/agent/reportKeys';
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
    // Agent reports (v2) are only served by their unguessable key.
    if ((parsed as { version?: number })?.version === 2) {
      return c.json({ error: 'report not found' }, 404);
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

  // Agent reports by key. The page data needs the owner token (sent by
  // the browser that generated the report); the PDF needs only the key,
  // so its link can be shared.
  const keyed = async (env: Env, key: string) => {
    if (!REPORT_KEY.test(key)) return null;
    const row = await env.DB.prepare(
      'SELECT id, title, body, created_at, owner_hash FROM reports WHERE key = ?',
    )
      .bind(key)
      .first<StoredReport & { owner_hash: string | null }>();
    if (!row) return null;
    try {
      const body = JSON.parse(row.body) as ReportV2;
      return body?.version === 2 ? { row, body } : null;
    } catch {
      return null;
    }
  };
  const isOwner = async (token: string | undefined, hash: string | null) =>
    Boolean(token && hash && OWNER_TOKEN.test(token) && sameHex(await sha256Hex(token), hash));

  routes.get('/v1/r/:key', async (c) => {
    const found = await keyed(c.env, c.req.param('key'));
    if (!found) return c.json({ error: 'report not found' }, 404);
    if (!(await isOwner(c.req.header('x-report-owner'), found.row.owner_hash)))
      return c.json({ error: 'this report can only be opened where it was generated' }, 403);
    return c.json({ title: found.row.title, created_at: found.row.created_at, ...found.body });
  });

  routes.get('/v1/r/:key/pdf', async (c) => {
    const found = await keyed(c.env, c.req.param('key'));
    if (!found) return c.json({ error: 'report not found' }, 404);
    const pdf = await renderPostMortemPdf(found.row.created_at, found.body);
    const slug =
      found.row.title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')
        .slice(0, 60) || 'report';
    return new Response(pdf.buffer as ArrayBuffer, {
      headers: {
        'content-type': 'application/pdf',
        'content-disposition': `inline; filename="${slug}.pdf"`,
      },
    });
  });

  // The owner marks a report sentence as wrong: facts learned from it are
  // retracted and the correction is remembered.
  routes.post('/v1/r/:key/feedback', async (c) => {
    const found = await keyed(c.env, c.req.param('key'));
    if (!found) return c.json({ error: 'report not found' }, 404);
    if (!(await isOwner(c.req.header('x-report-owner'), found.row.owner_hash)))
      return c.json({ error: 'not allowed' }, 403);
    const body = (await c.req.json().catch(() => null)) as { sentence?: unknown } | null;
    const sentence = typeof body?.sentence === 'string' ? body.sentence.trim() : '';
    if (!sentence || sentence.length > 2000)
      return c.json({ error: 'sentence (1-2000 chars) is required' }, 400);
    return c.json(await retractFromReport(c.env, found.row.id, sentence));
  });

  return routes;
}
