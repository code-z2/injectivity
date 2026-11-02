// Client for the agent backend: investigation sessions over a WebSocket and
// node summaries over SSE. Shapes mirror workers/api/src/agent.
import { BASE, type Chain } from "./api";
import { customRpc } from "./settings";

export type SourceKind =
  | "tx"
  | "chain_state"
  | "contract"
  | "dataset"
  | "computed"
  | "memory"
  | "document"
  | "web";

export interface Source {
  id: string;
  kind: SourceKind;
  ref: string;
  chain?: string;
  title: string;
  excerpt: string;
  url?: string;
  page?: number;
}

export interface Entry {
  role: "user" | "assistant";
  text: string;
  at: string;
  sources?: string[];
  removed?: number;
  declined?: boolean;
  reportId?: number;
}

export interface Workspace {
  chain: Chain;
  links: { address: string; role: string; label?: string }[];
  active: string;
  inspected?: string | null;
}

export type Step =
  | { type: "thinking" }
  | { type: "tool"; name: string; args: Record<string, unknown> }
  | { type: "tool_done"; name: string; ok: boolean; sources: number }
  | {
      type: "search";
      results: number;
      sources: { url: string; title: string }[];
    };

export type Stage =
  "gate" | "research" | "verify" | "sweep" | "write" | "save" | "memory";

export type ServerFrame =
  | {
      type: "state";
      transcript: Entry[];
      sources: Source[];
      workspace: Workspace | null;
    }
  | { type: "ok" }
  | { type: "status"; stage: Stage }
  | { type: "step"; step: Step }
  | { type: "answer"; entry: Entry; sources: Source[]; removed: unknown[] }
  | { type: "declined"; entry: Entry }
  | {
      type: "report";
      entry: Entry;
      reportId: number;
      title: string;
      removed: number;
    }
  | {
      type: "memory";
      added: number;
      merged: number;
      conflicts: number;
      refused: number;
    }
  | { type: "error"; error: string };

const sessionKey = (chain: string, root: string) =>
  `intel-terminal:agent:${chain}:${root.toLowerCase()}`;

/** The investigation's session id, reused across reloads of the same trace. */
export async function sessionFor(chain: Chain, root: string): Promise<string> {
  const key = sessionKey(chain, root);
  try {
    const known = sessionStorage.getItem(key);
    if (known) return known;
  } catch {
    // No storage: a fresh session each load.
  }
  const res = await fetch(`${BASE}/v1/agent/sessions`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ chain, root }),
  });
  const body = (await res.json().catch(() => null)) as {
    id?: string;
    error?: string;
  } | null;
  if (!res.ok || !body?.id)
    throw new Error(body?.error ?? `agent-${res.status}`);
  try {
    sessionStorage.setItem(key, body.id);
  } catch {
    // Not remembered; fine.
  }
  return body.id;
}

export function forgetSession(chain: Chain, root: string) {
  try {
    sessionStorage.removeItem(sessionKey(chain, root));
  } catch {
    // Nothing to forget.
  }
}

export interface AgentSocket {
  send(frame: Record<string, unknown>): boolean;
  close(): void;
}

/**
 * Opens the session socket. Reconnects with backoff while open; each
 * (re)connection says hello, so the transcript comes back as a state frame.
 */
export function connectSession(
  id: string,
  handlers: {
    onFrame: (f: ServerFrame) => void;
    onStatus: (open: boolean) => void;
  },
): AgentSocket {
  let ws: WebSocket | null = null;
  let closed = false;
  let attempt = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const url = `${BASE.replace(/^http/, "ws")}/v1/agent/sessions/${id}`;

  const open = () => {
    ws = new WebSocket(url);
    ws.onopen = () => {
      attempt = 0;
      handlers.onStatus(true);
      ws?.send(JSON.stringify({ type: "hello" }));
    };
    ws.onmessage = (ev) => {
      try {
        handlers.onFrame(JSON.parse(String(ev.data)) as ServerFrame);
      } catch {
        // Not a frame we understand.
      }
    };
    ws.onclose = () => {
      handlers.onStatus(false);
      if (closed) return;
      timer = setTimeout(open, Math.min(8000, 500 * 2 ** attempt++));
    };
  };
  open();

  return {
    send(frame) {
      if (ws?.readyState !== WebSocket.OPEN) return false;
      ws.send(JSON.stringify(frame));
      return true;
    },
    close() {
      closed = true;
      clearTimeout(timer);
      ws?.close();
    },
  };
}

/** Extras every ask/report carries: the chain's custom RPC. */
export function askExtras(chain: Chain): Record<string, unknown> {
  const rpcUrl = customRpc(chain);
  return rpcUrl ? { rpcUrl } : {};
}

export interface Fact {
  id: string;
  text: string;
}

export interface NodeSummary {
  chain: string;
  address: string;
  facts: Fact[];
  text: string;
  sources: Source[];
  coverage: { transfers: number; live: boolean; more: boolean };
  model: string | null;
  cached: boolean;
}

/** Streams a node summary: facts first, then the verified sentences. */
export async function streamSummary(
  chain: Chain,
  address: string,
  on: {
    facts: (facts: Fact[], coverage: NodeSummary["coverage"]) => void;
    summary: (s: NodeSummary) => void;
  },
  signal: AbortSignal,
): Promise<void> {
  const rpc = customRpc(chain);
  const res = await fetch(`${BASE}/v1/agent/summary`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(rpc ? { "x-rpc-url": rpc } : {}),
    },
    body: JSON.stringify({ chain, address }),
    signal,
  });
  if (!res.ok || !res.body) throw new Error(`summary-${res.status}`);
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let i: number;
    while ((i = buf.indexOf("\n\n")) >= 0) {
      const chunk = buf.slice(0, i);
      buf = buf.slice(i + 2);
      const event = /^event: (.*)$/m.exec(chunk)?.[1];
      const data = /^data: (.*)$/m.exec(chunk)?.[1];
      if (!event || !data) continue;
      const body = JSON.parse(data);
      if (event === "facts") on.facts(body.facts, body.coverage);
      else if (event === "summary") on.summary(body as NodeSummary);
      else if (event === "error")
        throw new Error(body.error ?? "summary failed");
    }
  }
}

export const reportPdf = (id: number) => `${BASE}/v1/reports/${id}?format=pdf`;
