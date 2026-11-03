// Gemini generateContent adapter. Effort maps to a thinking budget. Built-in
// search is Google Search grounding, which Gemini won't combine with
// function calling: a turn with tools gets no search.
import {
  callId,
  type Citation,
  type ModelAdapter,
  type ModelConfig,
  type ModelRequest,
  type Msg,
  postJson,
  type ToolCall,
} from './types';

type Part = Record<string, unknown>;

const THINKING_BUDGET = { low: 1024, medium: 8192, high: 24576 } as const;

function toContents(messages: Msg[]): { role: string; parts: Part[] }[] {
  const out: { role: string; parts: Part[] }[] = [];
  for (const m of messages) {
    if (m.role === 'user') out.push({ role: 'user', parts: [{ text: m.text }] });
    else if (m.role === 'tool') {
      const part = { functionResponse: { name: m.name, response: { result: m.result } } };
      const last = out[out.length - 1];
      if (last?.role === 'user' && last.parts.every((p) => 'functionResponse' in p))
        last.parts.push(part);
      else out.push({ role: 'user', parts: [part] });
    } else if (Array.isArray(m.raw)) out.push({ role: 'model', parts: m.raw as Part[] });
    else
      out.push({
        role: 'model',
        parts: [
          ...(m.text ? [{ text: m.text }] : []),
          ...m.toolCalls.map((c) => ({ functionCall: { name: c.name, args: c.args } })),
        ],
      });
  }
  return out;
}

export function geminiAdapter(fetchImpl: typeof fetch = fetch): ModelAdapter {
  return {
    kind: 'gemini',
    async run(cfg: ModelConfig, req: ModelRequest) {
      const tools: Part[] = [];
      if (req.tools?.length)
        tools.push({
          functionDeclarations: req.tools.map((t) => ({
            name: t.name,
            description: t.description,
            parameters: t.parameters,
          })),
        });
      else if (req.search) tools.push({ googleSearch: {} });
      const generationConfig: Part = { maxOutputTokens: req.maxTokens ?? 16000 };
      if (cfg.effort)
        generationConfig.thinkingConfig = { thinkingBudget: THINKING_BUDGET[cfg.effort] };
      if (req.schema) {
        generationConfig.responseMimeType = 'application/json';
        generationConfig.responseJsonSchema = req.schema.schema;
      }
      const body: Part = {
        systemInstruction: { parts: [{ text: req.system }] },
        contents: toContents(req.messages),
        generationConfig,
      };
      if (tools.length) body.tools = tools;
      const wire = (await postJson(
        fetchImpl,
        `${cfg.baseUrl.replace(/\/$/, '')}/models/${encodeURIComponent(cfg.model)}:generateContent`,
        { 'x-goog-api-key': cfg.key },
        body,
        req.signal,
      )) as {
        candidates?: {
          content?: { parts?: Part[] };
          groundingMetadata?: { groundingChunks?: { web?: { uri?: string; title?: string } }[] };
        }[];
        usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
      };
      const cand = wire.candidates?.[0];
      const parts = cand?.content?.parts ?? [];
      let text = '';
      const toolCalls: ToolCall[] = [];
      for (const p of parts) {
        if (typeof p.text === 'string' && !p.thought) text += p.text;
        const fc = p.functionCall as { name?: string; args?: Record<string, unknown> } | undefined;
        if (fc?.name) toolCalls.push({ id: callId(), name: fc.name, args: fc.args ?? {} });
      }
      const citations: Citation[] = (cand?.groundingMetadata?.groundingChunks ?? [])
        .filter((c) => typeof c.web?.uri === 'string')
        .map((c) => ({ url: c.web!.uri!, title: c.web!.title ?? c.web!.uri! }));
      return {
        text,
        toolCalls,
        citations,
        usage: {
          input: wire.usageMetadata?.promptTokenCount ?? 0,
          output: wire.usageMetadata?.candidatesTokenCount ?? 0,
        },
        message: { role: 'assistant', text, toolCalls, raw: parts },
      };
    },
  };
}
