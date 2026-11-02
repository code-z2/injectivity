// Client for agent post-mortems. A report is addressed by an unguessable
// key; its page data needs the owner token, kept only in the browser that
// generated it. The PDF needs just the key, so its link can be shared.
import { BASE } from "./api";
import type { SourceKind } from "./agent";

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
  kind: SourceKind;
  title: string;
  excerpt: string;
  ref: string;
  chain?: string;
  url?: string;
  page?: number;
}

export interface Report {
  title: string;
  created_at: string;
  version: 2;
  chain: string;
  addresses: string[];
  postMortem: PostMortem;
  sources: ReportSource[];
  meta: { model: string; removed: number; generatedAt: string };
}

const TOKENS = "intel-terminal:report-tokens";

function tokens(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(TOKENS) ?? "{}");
  } catch {
    return {};
  }
}

export function rememberReport(key: string, token: string) {
  try {
    localStorage.setItem(TOKENS, JSON.stringify({ ...tokens(), [key]: token }));
  } catch {
    // Not remembered: the page won't open on reload, the PDF still will.
  }
}

export const reportToken = (key: string): string | null =>
  tokens()[key] ?? null;

export const reportPdfUrl = (key: string) => `${BASE}/v1/r/${key}/pdf`;

export class ReportError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export async function fetchReport(key: string): Promise<Report> {
  const token = reportToken(key);
  if (!token) throw new ReportError(403, "not-owner");
  const res = await fetch(`${BASE}/v1/r/${key}`, {
    headers: { "x-report-owner": token },
  });
  const body = (await res.json().catch(() => null)) as
    (Report & { error?: string }) | null;
  if (!res.ok || !body)
    throw new ReportError(res.status, body?.error ?? "failed");
  return body;
}

/** Mark a sentence wrong: facts learned from it leave memory. */
export async function markWrong(key: string, sentence: string): Promise<void> {
  const token = reportToken(key);
  if (!token) throw new ReportError(403, "not-owner");
  const res = await fetch(`${BASE}/v1/r/${key}/feedback`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-report-owner": token },
    body: JSON.stringify({ sentence }),
  });
  if (!res.ok) throw new ReportError(res.status, "feedback failed");
}

const MARKS = (key: string) => `intel-terminal:report-marks:${key}`;

export function loadMarks(key: string): string[] {
  try {
    return JSON.parse(localStorage.getItem(MARKS(key)) ?? "[]");
  } catch {
    return [];
  }
}

export function saveMarks(key: string, marks: string[]) {
  try {
    localStorage.setItem(MARKS(key), JSON.stringify(marks));
  } catch {
    // Marks shown this visit only.
  }
}
