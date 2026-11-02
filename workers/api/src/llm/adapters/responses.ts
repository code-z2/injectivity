// Responses API adapter (Muse at api.meta.ai, OpenAI). Built-in search is
// the `web_search` tool; citations arrive as url_citation annotations.
import {
  type Citation,
  type ModelAdapter,
  type ModelConfig,
  type ModelRequest,
  ModelError,
  type Msg,
  parseArgs,
  postJson,
  type ToolCall,
} from './types';

type Item = Record<string, unknown>;

function toInput(messages: Msg[]): Item[] {
  const out: Item[] = [];
  for (const m of messages) {
    if (m.role === 'user') out.push({ role: 'user', content: m.text });
    else if (m.role === 'tool')
      out.push({ type: 'function_call_output', call_id: m.callId, output: m.result });
    else if (Array.isArray(m.raw))
      // Replay our own output items; with store:false a reasoning item only
      // replays when it carries its encrypted content.
      out.push(
        ...(m.raw as Item[]).filter((i) => i.type !== 'reasoning' || Boolean(i.encrypted_content)),
      );
    else {
      if (m.text) out.push({ role: 'assistant', content: m.text });
      for (const c of m.toolCalls)
        out.push({
          type: 'function_call',
          call_id: c.id,
          name: c.name,
          arguments: JSON.stringify(c.args),
        });
    }
  }
  return out;
}

export function responsesAdapter(fetchImpl: typeof fetch = fetch): ModelAdapter {
  return {
    kind: 'responses',
    async run(cfg: ModelConfig, req: ModelRequest) {
      const tools: Item[] = (req.tools ?? []).map((t) => ({
        type: 'function',
        name: t.name,
        description: t.description,
        parameters: t.parameters,
      }));
      if (req.search) tools.push({ type: 'web_search' });
      const body: Item = {
        model: cfg.model,
        instructions: req.system,
        input: toInput(req.messages),
        max_output_tokens: req.maxTokens ?? 16000,
        store: false,
      };
      // Muse leaves annotations empty and lists what it read on the search call.
      if (req.search) body.include = ['web_search_call.action.sources'];
      if (tools.length) body.tools = tools;
      if (cfg.effort) body.reasoning = { effort: cfg.effort };
      if (req.schema)
        body.text = {
          format: {
            type: 'json_schema',
            name: req.schema.name,
            strict: true,
            schema: req.schema.schema,
          },
        };
      const wire = (await postJson(
        fetchImpl,
        `${cfg.baseUrl.replace(/\/$/, '')}/responses`,
        { authorization: `Bearer ${cfg.key}` },
        body,
        req.signal,
      )) as {
        status?: string;
        incomplete_details?: { reason?: string };
        output?: Item[];
        usage?: { input_tokens?: number; output_tokens?: number };
      };
      if (wire.status && wire.status !== 'completed') {
        const reason = wire.incomplete_details?.reason;
        throw new ModelError(502, `model response ${wire.status}${reason ? `: ${reason}` : ''}`);
      }
      const output = wire.output ?? [];
      let text = '';
      const toolCalls: ToolCall[] = [];
      const citations: Citation[] = [];
      for (const item of output) {
        if (item.type === 'function_call') {
          toolCalls.push({
            id: String(item.call_id ?? item.id),
            name: String(item.name),
            args: parseArgs(item.arguments),
          });
        } else if (item.type === 'web_search_call') {
          const action = (item.action as Item) ?? {};
          for (const s of (action.sources as Item[]) ?? []) {
            if (typeof s.url === 'string' && !citations.some((c) => c.url === s.url))
              citations.push({ url: s.url, title: String(s.title ?? s.url) });
          }
        } else if (item.type === 'message' && item.phase !== 'commentary') {
          // Commentary is the "I'll search…" preamble, not the answer.
          for (const part of (item.content as Item[]) ?? []) {
            if (part.type !== 'output_text' && part.type !== 'text') continue;
            const t = String(part.text ?? '');
            text += t;
            for (const a of (part.annotations as Item[]) ?? []) {
              if (a.type !== 'url_citation' || typeof a.url !== 'string') continue;
              const s = typeof a.start_index === 'number' ? a.start_index : undefined;
              const e = typeof a.end_index === 'number' ? a.end_index : undefined;
              citations.push({
                url: a.url,
                title: String(a.title ?? a.url),
                quote: s !== undefined && e !== undefined ? t.slice(s, e) : undefined,
              });
            }
          }
        }
      }
      return {
        text,
        toolCalls,
        citations,
        usage: { input: wire.usage?.input_tokens ?? 0, output: wire.usage?.output_tokens ?? 0 },
        message: { role: 'assistant', text, toolCalls, raw: output },
      };
    },
  };
}
