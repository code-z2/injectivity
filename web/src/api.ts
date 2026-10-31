// Typed client for the intel-terminal API. Shapes mirror the Worker
// responses; every field the UI reads is required (no null/undefined leaks).
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
  return get<TraceResult>(`/v1/trace/${chain}/${address}?${q}`);
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

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`);
  if (!res.ok) throw new Error(`api-${res.status}`);
  return (await res.json()) as T;
}

export function fetchIntel(chain: string, address: string): Promise<Intel> {
  return get<Intel>(`/v1/address/${chain}/${address}`);
}

export function fetchTransfers(
  chain: string,
  address: string,
  pageKey?: string,
): Promise<TransfersPage> {
  const q = pageKey ? `?pageKey=${encodeURIComponent(pageKey)}` : "";
  return get<TransfersPage>(`/v1/address/${chain}/${address}/transfers${q}`);
}

export async function runInvestigation(
  chain: string,
  address: string,
  modelKey: string,
): Promise<ReportSummary> {
  const res = await fetch(`${BASE}/v1/investigate`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-model-key": modelKey },
    body: JSON.stringify({
      chain,
      address,
      direction: "both",
      depth: 2,
      fanout: 25,
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
