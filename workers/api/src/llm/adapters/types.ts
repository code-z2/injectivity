// Vendor-neutral model turn. Every adapter maps its wire format to and from
// these shapes, so the agent never sees a vendor's API.

export type Effort = 'low' | 'medium' | 'high';

export interface ModelConfig {
  baseUrl: string;
  model: string;
  key: string;
  effort?: Effort;
}

export interface ToolSpec {
  name: string;
  description: string;
  /** JSON schema for the arguments object. */
  parameters: Record<string, unknown>;
}

export interface ToolCall {
  id: string;
  name: string;
  args: Record<string, unknown>;
}

export interface Citation {
  url: string;
  title: string;
  quote?: string;
}

export type Msg =
  | { role: 'user'; text: string }
  /** raw: the vendor's own output items, replayed verbatim to the same adapter. */
  | { role: 'assistant'; text: string; toolCalls: ToolCall[]; raw?: unknown }
  | { role: 'tool'; callId: string; name: string; result: string };

export interface ModelRequest {
  system: string;
  messages: Msg[];
  tools?: ToolSpec[];
  /** Turn on the vendor's built-in web search, if it has one. */
  search?: boolean;
  /** Structured output: the reply text must be JSON matching this schema. */
  schema?: { name: string; schema: Record<string, unknown> };
  maxTokens?: number;
  signal?: AbortSignal;
}

export interface ModelTurn {
  text: string;
  toolCalls: ToolCall[];
  citations: Citation[];
  usage: { input: number; output: number };
  /** Assistant message to append to the history for the next turn. */
  message: Extract<Msg, { role: 'assistant' }>;
}

export interface ModelAdapter {
  readonly kind: 'responses' | 'chat' | 'anthropic' | 'gemini';
  run(cfg: ModelConfig, req: ModelRequest): Promise<ModelTurn>;
}

export class ModelError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

/** POST JSON and parse the reply, mapping transport and HTTP failures to ModelError. */
export async function postJson(
  fetchImpl: typeof fetch,
  url: string,
  headers: Record<string, string>,
  body: unknown,
  signal?: AbortSignal,
): Promise<unknown> {
  let res: Response;
  try {
    res = await fetchImpl(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body: JSON.stringify(body),
      signal: signal ?? AbortSignal.timeout(180_000),
    });
  } catch (err) {
    throw new ModelError(
      502,
      `model call failed (${err instanceof Error ? err.message : 'unknown'})`,
    );
  }
  if (!res.ok) {
    let detail = '';
    try {
      detail = (await res.text()).slice(0, 300);
    } catch {
      // No body.
    }
    throw new ModelError(
      res.status,
      `model API error: http-${res.status}${detail ? ` ${detail}` : ''}`,
    );
  }
  try {
    return await res.json();
  } catch {
    throw new ModelError(502, 'model response was not readable JSON');
  }
}

export function parseArgs(raw: unknown): Record<string, unknown> {
  if (raw && typeof raw === 'object') return raw as Record<string, unknown>;
  if (typeof raw !== 'string' || !raw.trim()) return {};
  try {
    const v = JSON.parse(raw);
    return v && typeof v === 'object' ? (v as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

let seq = 0;
export const callId = () => `call_${Date.now().toString(36)}_${(seq++).toString(36)}`;
