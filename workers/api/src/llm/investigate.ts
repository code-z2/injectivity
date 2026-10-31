// LLM-1: grounded one-shot investigation over trace + risk output.
// The model proposes; this module disposes: every evidence ref is checked
// against the actual trace edges and risk matches before anything is kept.
import { SECURITY_INSTRUCTIONS } from '@/llm/instructions';
import { assessRisk } from '@/stores/risk';
import { traceFunds } from '@/stores/trace';
import type { AlchemyClient, Env } from '@/types';

// Balanced prompt maximums: highest-value edges first, both directions,
// with omission counts so the model can state coverage limits.
const MAX_PROMPT_EDGES = 40;
const MAX_PROMPT_PATHS = 20;
const MAX_PROMPT_SHARED = 10;

export const DEFAULT_MODEL = 'muse-spark-1.3-contributor';
export const DEFAULT_BASE_URL = 'https://api.meta.ai/v1';

export interface InvestigateParams {
  chain: string;
  address: string;
  direction?: 'in' | 'out' | 'both';
  depth?: number;
  fanout?: number;
  model?: string;
  reasoningEffort?: 'low' | 'medium' | 'high';
  webSearch?: boolean;
  apiKey: string;
  baseUrl?: string;
}

export interface Finding {
  claim: string;
  verdict: 'verified' | 'inferred';
  evidence: { txHashes: string[]; listRefs: string[] };
  confidence: 'high' | 'medium' | 'low';
}

export interface IntelReport {
  summary: string;
  findings: Finding[];
  uncertainty: string[];
  nextChecks: string[];
}

const REPORT_SCHEMA = {
  type: 'object',
  properties: {
    summary: { type: 'string' },
    findings: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          claim: { type: 'string' },
          verdict: { type: 'string', enum: ['verified', 'inferred'] },
          evidence: {
            type: 'object',
            properties: {
              txHashes: { type: 'array', items: { type: 'string' } },
              listRefs: { type: 'array', items: { type: 'string' } },
            },
            required: ['txHashes', 'listRefs'],
            additionalProperties: false,
          },
          confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
        },
        required: ['claim', 'verdict', 'evidence', 'confidence'],
        additionalProperties: false,
      },
    },
    uncertainty: { type: 'array', items: { type: 'string' } },
    nextChecks: { type: 'array', items: { type: 'string' } },
  },
  required: ['summary', 'findings', 'uncertainty', 'nextChecks'],
  additionalProperties: false,
};

function extractText(body: unknown): string | null {
  const out = (body as { output?: unknown[] })?.output ?? [];
  for (const item of out) {
    if ((item as { type?: string })?.type !== 'message') continue;
    const content = (item as { content?: unknown[] })?.content ?? [];
    for (const part of content) {
      const p = part as { type?: string; text?: string };
      if ((p.type === 'output_text' || p.type === 'text') && typeof p.text === 'string')
        return p.text;
    }
  }
  return null;
}

export function validateReport(
  obj: IntelReport,
  edgeHashes: Set<string>,
  matchRefs: Set<string>,
  inferredRefs: Set<string>,
): { report: IntelReport; stripped: number; problems: string[] } {
  const problems: string[] = [];
  let stripped = 0;
  const findings: Finding[] = [];
  for (const f of obj.findings ?? []) {
    const txs = (f.evidence?.txHashes ?? []).map((h) => String(h).toLowerCase());
    const refs = (f.evidence?.listRefs ?? []).map(String);
    const badTx = txs.filter((h) => !edgeHashes.has(h));
    const badRefs = refs.filter((r) => !matchRefs.has(r));
    const usesInferred = refs.some((r) => inferredRefs.has(r));
    if (badTx.length > 0 || badRefs.length > 0) {
      stripped++;
      problems.push(
        `finding removed (evidence outside the bundle): "${String(f.claim).slice(0, 120)}"`,
      );
      continue;
    }
    if (f.verdict === 'verified' && usesInferred) {
      stripped++;
      problems.push(
        `finding removed (claimed verified on inferred evidence): "${String(f.claim).slice(0, 120)}"`,
      );
      continue;
    }
    findings.push({
      claim: String(f.claim),
      verdict: f.verdict === 'verified' ? 'verified' : 'inferred',
      evidence: { txHashes: txs, listRefs: refs },
      confidence:
        f.confidence === 'high' || f.confidence === 'medium' || f.confidence === 'low'
          ? f.confidence
          : 'low',
    });
  }
  const uncertainty = [...(obj.uncertainty ?? []).map(String)];
  if (stripped > 0) {
    uncertainty.push(
      `${stripped} draft finding(s) were removed because they cited evidence outside the investigated bundle.`,
    );
  }
  return {
    report: {
      summary: String(obj.summary ?? ''),
      findings,
      uncertainty,
      nextChecks: [...(obj.nextChecks ?? []).map(String)],
    },
    stripped,
    problems,
  };
}

export class InvestigationError extends Error {
  status: number;
  problems: string[];
  constructor(status: number, message: string, problems: string[] = []) {
    super(message);
    this.status = status;
    this.problems = problems;
  }
}

export async function investigate(
  env: Env,
  client: AlchemyClient,
  params: InvestigateParams,
  modelFetch: typeof fetch = fetch,
  onStage?: (stage: string) => void,
): Promise<{
  report: IntelReport;
  stripped: number;
  problems: string[];
  reportId: number | null;
  meta: { model: string; liveTrace: boolean; staleTrace: boolean };
}> {
  const direction = params.direction ?? 'both';
  const depth = Math.min(Math.max(params.depth ?? 2, 1), 2);
  const fanout = Math.min(Math.max(params.fanout ?? 25, 1), 100);
  const model = params.model || env.MODEL_API_MODEL || DEFAULT_MODEL;
  const baseUrl = params.baseUrl || env.MODEL_API_BASE_URL || DEFAULT_BASE_URL;

  onStage?.('assess');
  const assessment = await assessRisk(env, client, params.chain, params.address);
  onStage?.('trace');
  const traced = await traceFunds(env, client, params.chain, params.address, {
    direction,
    depth,
    fanout,
  });
  const edges = traced.result.edges;
  const top = [...edges].sort(
    (a, b) => Number(b.value) - Number(a.value) || a.blockNumber - b.blockNumber,
  );
  const omittedEdges = Math.max(0, top.length - MAX_PROMPT_EDGES);
  onStage?.('generate');

  const bundle = {
    address: params.address.toLowerCase(),
    chain: params.chain,
    risk: {
      level: assessment.level,
      matches: assessment.matches.map((m) => ({
        listRef: `${m.list_name}/${m.role}`,
        match_type: m.match_type,
        rule: m.rule,
        via: m.via,
      })),
      counterpartySource: assessment.source,
    },
    trace: {
      direction,
      depth,
      edgeCount: edges.length,
      edges: top.slice(0, MAX_PROMPT_EDGES),
      omittedEdges,
      pathsOut: traced.result.pathsOut.slice(0, MAX_PROMPT_PATHS),
      pathsIn: traced.result.pathsIn.slice(0, MAX_PROMPT_PATHS),
      shared: traced.result.shared.slice(0, MAX_PROMPT_SHARED),
      truncatedNodes: traced.result.truncatedNodes,
      stale: traced.stale,
      stats: traced.result.stats,
    },
    evidenceRules: [
      'Cite transaction hashes only from trace.edges[].hash.',
      'Cite list references only from risk.matches[].listRef, using the exact "list/role" form.',
      'verdict "verified" only when every cited listRef has match_type "exact".',
    ],
  };

  const body = {
    model,
    instructions: SECURITY_INSTRUCTIONS,
    input: [
      {
        role: 'user',
        content: `Investigate this evidence bundle and return the intel report.\nCoverage: ${edges.length} trace edges (${omittedEdges} omitted from this prompt, lowest value first), risk level ${assessment.level}.\n\`\`\`json\n${JSON.stringify(bundle)}\n\`\`\``,
      },
    ],
    ...(params.webSearch === false ? {} : { tools: [{ type: 'web_search' }] }),
    reasoning: { effort: params.reasoningEffort ?? env.MODEL_REASONING_EFFORT ?? 'medium' },
    text: {
      format: { type: 'json_schema', name: 'intel_report', strict: true, schema: REPORT_SCHEMA },
    },
    temperature: 0.2,
    max_output_tokens: 24000,
    store: false,
  };

  let res: Response;
  try {
    res = await modelFetch(`${baseUrl}/responses`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${params.apiKey}` },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(180_000),
    });
  } catch (err) {
    throw new InvestigationError(
      502,
      `model call failed (${err instanceof Error ? err.message : 'unknown'})`,
    );
  }
  if (!res.ok) {
    throw new InvestigationError(502, `model API error: http-${res.status}`);
  }
  let wire: unknown;
  try {
    wire = await res.json();
  } catch {
    throw new InvestigationError(502, 'model response was not readable JSON');
  }
  const status = (wire as { status?: string })?.status;
  if (status && status !== 'completed') {
    const reason = (wire as { incomplete_details?: { reason?: string } })?.incomplete_details
      ?.reason;
    throw new InvestigationError(502, `model response ${status}${reason ? `: ${reason}` : ''}`);
  }
  const text = extractText(wire);
  if (!text) throw new InvestigationError(502, 'model returned no text output');
  let parsed: IntelReport;
  try {
    parsed = JSON.parse(text) as IntelReport;
  } catch {
    throw new InvestigationError(502, 'model output was not valid JSON');
  }

  const edgeHashes = new Set(edges.map((e) => e.hash.toLowerCase()));
  const matchRefs = new Set(assessment.matches.map((m) => `${m.list_name}/${m.role}`));
  const inferredRefs = new Set(
    assessment.matches
      .filter((m) => m.match_type !== 'exact')
      .map((m) => `${m.list_name}/${m.role}`),
  );
  const { report, stripped, problems } = validateReport(
    parsed,
    edgeHashes,
    matchRefs,
    inferredRefs,
  );

  onStage?.('persist');
  let reportId: number | null = null;
  try {
    const saved = (await env.DB.prepare(
      'INSERT INTO reports (title, body, created_at) VALUES (?,?,?)',
    )
      .bind(
        `Intel: ${params.address.toLowerCase()} (${params.chain})`,
        JSON.stringify({
          address: params.address.toLowerCase(),
          chain: params.chain,
          report,
        }),
        new Date().toISOString(),
      )
      .run()) as unknown as { success: boolean; meta?: { last_row_id?: number } };
    if (typeof saved?.meta?.last_row_id === 'number') reportId = saved.meta.last_row_id;
  } catch {
    // A report that cannot be stored is still returned; storage is best-effort here.
  }

  return {
    report,
    stripped,
    problems,
    reportId,
    meta: { model, liveTrace: traced.liveUsed, staleTrace: traced.stale },
  };
}
