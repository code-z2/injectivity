// Typed client for the intel-terminal API. Shapes mirror the Worker
// responses; every field the UI reads is required (no null/undefined leaks).
import { healthFromNote, reportRpc, type RpcHealth } from "./rpcSignal";
import { customRpc } from "./settings";

const BASE: string = import.meta.env.VITE_API_BASE ?? "http://127.0.0.1:8787";

export type Chain =
  "ethereum" | "base" | "bsc" | "polygon" | "arbitrum" | "optimism";
export const CHAINS: Chain[] = [
  "ethereum",
  "base",
  "bsc",
  "polygon",
  "arbitrum",
  "optimism",
];

export interface Label {
  list_name: string;
  role: string;
  label: string;
  version: string;
}

export interface RiskMatch extends Label {
  match_type: "exact" | "inferred:R1";
  rule: string | null;
  via: string | null;
}

export interface Risk {
  level: "verified" | "inferred" | "none";
  matches: RiskMatch[];
  screened: number;
  source: "cache" | "live" | "none";
  note?: string;
}

export interface Balances {
  native: string;
  tokens: { contractAddress: string; tokenBalance: string }[];
}

export interface Intel {
  address: string;
  chain: string;
  live: boolean;
  cached: boolean;
  fetched_at: string;
  labels: Label[];
  risk: Risk;
  balances: Balances | null;
}

export interface Transfer {
  hash: string;
  from: string;
  to: string;
  asset: string;
  value: string;
  blockNum: string;
}

export interface TransfersPage {
  transfers: Transfer[];
  pageKey?: string;
  live: boolean;
  cached: boolean;
}

export interface TraceNode {
  address: string;
  depth: number;
  labels: Label[];
}

export interface TraceEdge {
  from: string;
  to: string;
  hash: string;
  asset: string;
  value: string;
  blockNumber: number;
  hop: number;
  dir: "out" | "in";
}

export interface SharedCounterparty {
  address: string;
  labels: Label[];
  via: string[];
}

export interface TraceResult {
  nodes: TraceNode[];
  edges: TraceEdge[];
  pathsOut: string[][];
  pathsIn: string[][];
  shared: SharedCounterparty[];
  pathsTruncated: boolean;
  stats: { expansions: number; liveCalls: number; cacheHits: number };
  live: boolean;
  cached: boolean;
}

export type TraceDirection = "in" | "out" | "both";

export function fetchTrace(
  chain: string,
  address: string,
  direction: TraceDirection,
  depth: 1 | 2,
  fanout: number,
): Promise<TraceResult> {
  const q = `direction=${direction}&depth=${depth}&fanout=${fanout}`;
  return get<TraceResult>(`/v1/trace/${chain}/${address}?${q}`, chain);
}

export interface Finding {
  claim: string;
  verdict: "verified" | "inferred";
  evidence: { txHashes: string[]; listRefs: string[] };
  confidence: "high" | "medium" | "low";
}

export interface IntelReport {
  summary: string;
  findings: Finding[];
  uncertainty: string[];
  nextChecks: string[];
}

export interface StoredReport {
  id: number;
  title: string;
  created_at: string;
  address: string | null;
  chain: string | null;
  report: IntelReport;
}

export function fetchReport(id: number): Promise<StoredReport> {
  return get<StoredReport>(`/v1/reports/${id}`);
}

export function reportPdfUrl(id: number): string {
  return `${BASE}/v1/reports/${id}?format=pdf`;
}

export interface ReportSummary {
  summary: string;
  verdictCounts: Record<"verified" | "inferred", number>;
  findingCount: number;
  uncertaintyCount: number;
  nextCheckCount: number;
  stripped: number;
  reportId: number | null;
  liveTrace: boolean;
}

// Requests for a chain carry that chain's custom RPC (Settings), so the
// API's live calls go through it. Live-fetch failures the API reports in
// its note feed the RPC status straight away.
function rpcHeaders(chain?: string): Record<string, string> {
  const url = chain ? customRpc(chain as Chain) : "";
  return url ? { "x-rpc-url": url } : {};
}

async function get<T>(path: string, chain?: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`, { headers: rpcHeaders(chain) });
  const body = (await res.json().catch(() => null)) as
    (T & { note?: string }) | null;
  if (chain) {
    const h = healthFromNote(body?.note);
    if (h) reportRpc(chain, h);
    else if (res.ok && (body as { live?: boolean } | null)?.live)
      reportRpc(chain, "ok");
  }
  if (!res.ok || !body) throw new Error(`api-${res.status}`);
  return body;
}

// The RPC that lookups for a chain actually use, probed by the API.
export async function fetchRpcHealth(
  chain: string,
  signal?: AbortSignal,
): Promise<{ health: RpcHealth; ms: number | null; custom: boolean }> {
  const res = await fetch(`${BASE}/health/rpc/${chain}`, {
    headers: rpcHeaders(chain),
    signal,
  });
  if (!res.ok) throw new Error(`api-${res.status}`);
  return (await res.json()) as {
    health: RpcHealth;
    ms: number | null;
    custom: boolean;
  };
}

export function fetchIntel(chain: string, address: string): Promise<Intel> {
  return get<Intel>(`/v1/address/${chain}/${address}`, chain);
}

export function fetchTransfers(
  chain: string,
  address: string,
  pageKey?: string,
): Promise<TransfersPage> {
  const q = pageKey ? `?pageKey=${encodeURIComponent(pageKey)}` : "";
  return get<TransfersPage>(
    `/v1/address/${chain}/${address}/transfers${q}`,
    chain,
  );
}

export async function runInvestigation(
  chain: string,
  address: string,
  modelKey: string,
  opts: { model?: string; effort?: "low" | "medium" | "high" } = {},
): Promise<ReportSummary> {
  // BYO key is optional: sent only when provided, otherwise the API falls
  // back to its configured key (401 only when neither exists).
  const headers: Record<string, string> = {
    "content-type": "application/json",
    ...rpcHeaders(chain),
  };
  if (modelKey.trim()) headers["x-model-key"] = modelKey.trim();
  const res = await fetch(`${BASE}/v1/investigate`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      chain,
      address,
      direction: "both",
      depth: 2,
      fanout: 25,
      ...(opts.model ? { model: opts.model } : {}),
      ...(opts.effort ? { reasoningEffort: opts.effort } : {}),
    }),
  });
  if (res.status === 401) throw new Error("missing-model-key");
  if (!res.ok) throw new Error(`api-${res.status}`);
  const b = (await res.json()) as {
    report: {
      summary: string;
      findings: { verdict: "verified" | "inferred" }[];
      uncertainty: unknown[];
      nextChecks: unknown[];
    };
    stripped: number;
    reportId: number | null;
    meta: { liveTrace: boolean };
  };
  const verdictCounts: Record<"verified" | "inferred", number> = {
    verified: 0,
    inferred: 0,
  };
  for (const f of b.report.findings) verdictCounts[f.verdict]++;
  return {
    summary: b.report.summary,
    verdictCounts,
    findingCount: b.report.findings.length,
    uncertaintyCount: b.report.uncertainty.length,
    nextCheckCount: b.report.nextChecks.length,
    stripped: b.stripped,
    reportId: b.reportId,
    liveTrace: b.meta.liveTrace,
  };
}

// Liveness of the investigation API (the AI agent service). Says the
// service answers, not that the upstream model provider is healthy.
export async function fetchHealth(signal?: AbortSignal): Promise<boolean> {
  const res = await fetch(`${BASE}/health`, { signal });
  if (!res.ok) return false;
  const body = (await res.json()) as { ok?: boolean };
  return body.ok === true;
}
