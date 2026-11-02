// Anthropic Messages adapter. Effort maps to an extended-thinking budget;
// thinking and tool blocks are replayed verbatim (the API requires it).
// Built-in search is the server-side web_search tool. No strict schema
// mode: structured replies are validated by the caller.
import {
  type Citation,
  type ModelAdapter,
  type ModelConfig,
  type ModelRequest,
  type Msg,
  postJson,
  type ToolCall,
} from './types';

type Block = Record<string, unknown>;

const THINKING_BUDGET = { low: 2048, medium: 8000, high: 16000 } as const;

function toMessages(messages: Msg[]): { role: string; content: unknown }[] {
  const out: { role: string; content: unknown }[] = [];
  for (const m of messages) {
    if (m.role === 'user') out.push({ role: 'user', content: m.text });
    else if (m.role === 'tool') {
      const block = { type: 'tool_result', tool_use_id: m.callId, content: m.result };
      const last = out[out.length - 1];
      // Consecutive tool results belong in one user message.
      if (last?.role === 'user' && Array.isArray(last.content))
        (last.content as Block[]).push(block);
      else out.push({ role: 'user', content: [block] });
    } else if (Array.isArray(m.raw)) out.push({ role: 'assistant', content: m.raw });
    else
      out.push({
        role: 'assistant',
        content: [
          ...(m.text ? [{ type: 'text', text: m.text }] : []),
          ...m.toolCalls.map((c) => ({ type: 'tool_use', id: c.id, name: c.name, input: c.args })),
        ],
      });
  }
  return out;
}

export function anthropicAdapter(fetchImpl: typeof fetch = fetch): ModelAdapter {
  return {
    kind: 'anthropic',
    async run(cfg: ModelConfig, req: ModelRequest) {
      const budget = cfg.effort ? THINKING_BUDGET[cfg.effort] : 0;
      const system = req.schema
        ? `${req.system}\n\nReply with exactly one JSON object matching this schema (${req.schema.name}), no prose:\n${JSON.stringify(req.schema.schema)}`
        : req.system;
      const tools: Block[] = (req.tools ?? []).map((t) => ({
        name: t.name,
        description: t.description,
        input_schema: t.parameters,
      }));
      if (req.search) tools.push({ type: 'web_search_20250305', name: 'web_search', max_uses: 5 });
      const body: Block = {
        model: cfg.model,
        system,
        messages: toMessages(req.messages),
        max_tokens: (req.maxTokens ?? 16000) + budget,
      };
      if (tools.length) body.tools = tools;
      if (budget) body.thinking = { type: 'enabled', budget_tokens: budget };
      const wire = (await postJson(
        fetchImpl,
        `${cfg.baseUrl.replace(/\/$/, '')}/messages`,
        { 'x-api-key': cfg.key, 'anthropic-version': '2023-06-01' },
        body,
        req.signal,
      )) as { content?: Block[]; usage?: { input_tokens?: number; output_tokens?: number } };
      const content = wire.content ?? [];
      let text = '';
      const toolCalls: ToolCall[] = [];
      const citations: Citation[] = [];
      for (const b of content) {
        if (b.type === 'text') {
          text += String(b.text ?? '');
          for (const c of (b.citations as Block[]) ?? []) {
            if (typeof c.url === 'string')
              citations.push({
                url: c.url,
                title: String(c.title ?? c.url),
                quote: typeof c.cited_text === 'string' ? c.cited_text : undefined,
              });
          }
        } else if (b.type === 'tool_use') {
          toolCalls.push({
            id: String(b.id),
            name: String(b.name),
            args: (b.input as Record<string, unknown>) ?? {},
          });
        }
      }
      return {
        text,
        toolCalls,
        citations,
        usage: { input: wire.usage?.input_tokens ?? 0, output: wire.usage?.output_tokens ?? 0 },
        message: { role: 'assistant', text, toolCalls, raw: content },
      };
    },
  };
}
