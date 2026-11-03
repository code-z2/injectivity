// Chat Completions adapter: the fallback for every OpenAI-compatible host
// (OpenRouter, Groq, Together, DeepSeek, vLLM, …). Built-in search only on
// OpenRouter (its web plugin); elsewhere search is reported unavailable.
import {
  type Citation,
  type ModelAdapter,
  type ModelConfig,
  type ModelRequest,
  type Msg,
  parseArgs,
  postJson,
  type ToolCall,
} from './types';

type Obj = Record<string, unknown>;

export const chatHasSearch = (baseUrl: string) => /(^|\.)openrouter\.ai$/.test(hostOf(baseUrl));

function hostOf(url: string) {
  try {
    return new URL(url).hostname;
  } catch {
    return '';
  }
}

function toMessages(system: string, messages: Msg[]): Obj[] {
  const out: Obj[] = [{ role: 'system', content: system }];
  for (const m of messages) {
    if (m.role === 'user') out.push({ role: 'user', content: m.text });
    else if (m.role === 'tool')
      out.push({ role: 'tool', tool_call_id: m.callId, content: m.result });
    else
      out.push({
        role: 'assistant',
        content: m.text || null,
        ...(m.toolCalls.length
          ? {
              tool_calls: m.toolCalls.map((c) => ({
                id: c.id,
                type: 'function',
                function: { name: c.name, arguments: JSON.stringify(c.args) },
              })),
            }
          : {}),
      });
  }
  return out;
}

export function chatAdapter(fetchImpl: typeof fetch = fetch): ModelAdapter {
  return {
    kind: 'chat',
    async run(cfg: ModelConfig, req: ModelRequest) {
      const body: Obj = {
        model: cfg.model,
        messages: toMessages(req.system, req.messages),
        max_tokens: req.maxTokens ?? 16000,
      };
      if (req.tools?.length)
        body.tools = req.tools.map((t) => ({
          type: 'function',
          function: { name: t.name, description: t.description, parameters: t.parameters },
        }));
      if (cfg.effort) body.reasoning_effort = cfg.effort;
      if (req.search && chatHasSearch(cfg.baseUrl)) body.plugins = [{ id: 'web' }];
      if (req.schema)
        body.response_format = {
          type: 'json_schema',
          json_schema: { name: req.schema.name, strict: true, schema: req.schema.schema },
        };
      const wire = (await postJson(
        fetchImpl,
        `${cfg.baseUrl.replace(/\/$/, '')}/chat/completions`,
        { authorization: `Bearer ${cfg.key}` },
        body,
        req.signal,
      )) as {
        choices?: { message?: Obj }[];
        usage?: { prompt_tokens?: number; completion_tokens?: number };
      };
      const msg = wire.choices?.[0]?.message ?? {};
      const text = typeof msg.content === 'string' ? msg.content : '';
      const toolCalls: ToolCall[] = ((msg.tool_calls as Obj[]) ?? []).map((c) => {
        const fn = (c.function as Obj) ?? {};
        return { id: String(c.id), name: String(fn.name), args: parseArgs(fn.arguments) };
      });
      const citations: Citation[] = [];
      for (const a of (msg.annotations as Obj[]) ?? []) {
        const u = (a.url_citation as Obj) ?? {};
        if (a.type === 'url_citation' && typeof u.url === 'string')
          citations.push({
            url: u.url,
            title: String(u.title ?? u.url),
            quote: typeof u.content === 'string' ? u.content : undefined,
          });
      }
      return {
        text,
        toolCalls,
        citations,
        usage: {
          input: wire.usage?.prompt_tokens ?? 0,
          output: wire.usage?.completion_tokens ?? 0,
        },
        message: { role: 'assistant', text, toolCalls },
      };
    },
  };
}
