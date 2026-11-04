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
  postModel,
  type ToolCall,
} from './types';

type Wire = {
  status?: string;
  incomplete_details?: { reason?: string };
  output?: Item[];
  usage?: { input_tokens?: number; output_tokens?: number };
};

/**
 * Consume a Responses SSE stream. The terminal `response.completed` event
 * carries the full response object; deltas are only a fallback. Streaming
 * keeps bytes flowing, which is what stops Cloudflare's 524 origin-timeout
 * from killing long generations.
 */
async function readStream(res: Response): Promise<Wire> {
  const reader = res.body?.getReader();
  if (!reader) throw new ModelError(502, 'model stream had no body');
  const decoder = new TextDecoder();
  let buffer = '';
  let completed: Wire | null = null;
  let deltaText = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let cut: number;
    while ((cut = buffer.indexOf('\n\n')) >= 0) {
      const block = buffer.slice(0, cut);
      buffer = buffer.slice(cut + 2);
      const data = block
        .split('\n')
        .filter((l) => l.startsWith('data:'))
        .map((l) => l.slice(5).trim())
        .join('');
      if (!data || data === '[DONE]') continue;
      let ev: { type?: string; response?: Wire; delta?: string };
      try {
        ev = JSON.parse(data);
      } catch {
        continue;
      }
      if (ev.type === 'response.completed' && ev.response) completed = ev.response;
      else if (ev.type === 'response.failed' || ev.type === 'response.incomplete')
        completed = ev.response ?? { status: 'failed' };
      else if (ev.type === 'response.output_text.delta' && typeof ev.delta === 'string')
        deltaText += ev.delta;
    }
  }
  if (!completed) throw new ModelError(502, 'model stream ended before completion');
  if (!completed.output && deltaText) {
    completed.output = [{ type: 'message', content: [{ type: 'output_text', text: deltaText }] }];
  }
  return completed;
}

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
      body.stream = true;
      const res = await postModel(
        fetchImpl,
        `${cfg.baseUrl.replace(/\/$/, '')}/responses`,
        { authorization: `Bearer ${cfg.key}` },
        body,
        req.signal,
      );
      const wire: Wire = (res.headers.get('content-type') ?? '').includes('text/event-stream')
        ? await readStream(res)
        : ((await res.json().catch(() => {
            throw new ModelError(502, 'model response was not readable JSON');
          })) as Wire);
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
