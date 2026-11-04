// Model adapters: request shape per vendor and normalised replies, against
// recorded-shape fixtures (no network).
import { describe, expect, test } from 'bun:test';
import { adapterFor, adapterKind, type ModelConfig, type Msg } from '@/llm/adapters';
import { customModel, modelFor, MUSE_MODEL, serverModel } from '@/llm/config';
import { probeModel } from '@/llm/probe';

function fakeFetch(reply: unknown, status = 200) {
  const calls: { url: string; headers: Record<string, string>; body: any }[] = [];
  const fn = (async (url: string, init: RequestInit) => {
    calls.push({
      url,
      headers: init.headers as Record<string, string>,
      body: JSON.parse(String(init.body)),
    });
    return new Response(JSON.stringify(reply), { status });
  }) as unknown as typeof fetch;
  return { fn, calls };
}

const TOOL = {
  name: 'get_transfers',
  description: 'Ledger page',
  parameters: { type: 'object', properties: { address: { type: 'string' } } },
};
const history: Msg[] = [
  { role: 'user', text: 'Trace 0xabc' },
  {
    role: 'assistant',
    text: '',
    toolCalls: [{ id: 'c1', name: 'get_transfers', args: { address: '0xabc' } }],
  },
  { role: 'tool', callId: 'c1', name: 'get_transfers', result: '{"rows":[]}' },
];
const cfg = (baseUrl: string): ModelConfig => ({ baseUrl, model: 'm', key: 'k', effort: 'high' });

describe('adapter selection', () => {
  test('picks by host', () => {
    expect(adapterKind('https://api.meta.ai/v1')).toBe('responses');
    expect(adapterKind('https://api.openai.com/v1')).toBe('responses');
    expect(adapterKind('https://api.anthropic.com/v1')).toBe('anthropic');
    expect(adapterKind('https://generativelanguage.googleapis.com/v1beta')).toBe('gemini');
    expect(adapterKind('https://openrouter.ai/api/v1')).toBe('chat');
  });
});

describe('responses adapter', () => {
  test('maps tools, search, effort and history; reads calls and citations', async () => {
    const { fn, calls } = fakeFetch({
      status: 'completed',
      output: [
        {
          type: 'function_call',
          call_id: 'c2',
          name: 'get_transfers',
          arguments: '{"address":"0xdef"}',
        },
        {
          type: 'message',
          content: [
            {
              type: 'output_text',
              text: 'Bybit was drained.',
              annotations: [
                {
                  type: 'url_citation',
                  url: 'https://x.test/a',
                  title: 'A',
                  start_index: 0,
                  end_index: 5,
                },
              ],
            },
          ],
        },
      ],
      usage: { input_tokens: 10, output_tokens: 4 },
    });
    const t = await adapterFor('https://api.meta.ai/v1', fn).run(cfg('https://api.meta.ai/v1'), {
      system: 'sys',
      messages: history,
      tools: [TOOL],
      search: true,
    });
    const b = calls[0]!.body;
    expect(calls[0]!.url).toBe('https://api.meta.ai/v1/responses');
    expect(b.instructions).toBe('sys');
    expect(b.reasoning).toEqual({ effort: 'high' });
    expect(b.tools.map((x: any) => x.type)).toEqual(['function', 'web_search']);
    expect(b.input.map((x: any) => x.type ?? x.role)).toEqual([
      'user',
      'function_call',
      'function_call_output',
    ]);
    expect(t.toolCalls).toEqual([{ id: 'c2', name: 'get_transfers', args: { address: '0xdef' } }]);
    expect(t.text).toBe('Bybit was drained.');
    expect(t.citations).toEqual([{ url: 'https://x.test/a', title: 'A', quote: 'Bybit' }]);
    expect(t.usage).toEqual({ input: 10, output: 4 });
  });
});

describe('responses adapter streaming + retry', () => {
  test('consumes SSE and reads the completed response', async () => {
    const completed = {
      status: 'completed',
      output: [{ type: 'message', content: [{ type: 'output_text', text: 'Streamed answer.' }] }],
      usage: { input_tokens: 7, output_tokens: 3 },
    };
    const sse =
      `event: response.output_text.delta\ndata: ${JSON.stringify({ type: 'response.output_text.delta', delta: 'Streamed ' })}\n\n` +
      `event: response.completed\ndata: ${JSON.stringify({ type: 'response.completed', response: completed })}\n\n`;
    const calls: { body: any }[] = [];
    const fn = (async (_url: string, init: RequestInit) => {
      calls.push({ body: JSON.parse(String(init.body)) });
      return new Response(sse, { headers: { 'content-type': 'text/event-stream' } });
    }) as unknown as typeof fetch;
    const t = await adapterFor('https://api.meta.ai/v1', fn).run(cfg('https://api.meta.ai/v1'), {
      system: 'sys',
      messages: history,
    });
    expect(calls[0]!.body.stream).toBe(true);
    expect(t.text).toBe('Streamed answer.');
    expect(t.usage).toEqual({ input: 7, output: 3 });
  });

  test('a 524 is retried once and the retry can succeed', async () => {
    let n = 0;
    const fn = (async () => {
      n++;
      if (n === 1) return new Response('origin timeout', { status: 524 });
      return new Response(
        JSON.stringify({
          status: 'completed',
          output: [{ type: 'message', content: [{ type: 'output_text', text: 'recovered' }] }],
          usage: { input_tokens: 1, output_tokens: 1 },
        }),
        { headers: { 'content-type': 'application/json' } },
      );
    }) as unknown as typeof fetch;
    const t = await adapterFor('https://api.meta.ai/v1', fn).run(cfg('https://api.meta.ai/v1'), {
      system: 'sys',
      messages: history,
    });
    expect(n).toBe(2);
    expect(t.text).toBe('recovered');
  });
});

describe('chat adapter', () => {
  test('OpenAI-compatible shape; search only on OpenRouter', async () => {
    const reply = {
      choices: [
        {
          message: {
            content: null,
            tool_calls: [
              { id: 'c9', type: 'function', function: { name: 'get_transfers', arguments: '{}' } },
            ],
          },
        },
      ],
    };
    const a = fakeFetch(reply);
    const t = await adapterFor('https://api.groq.com/openai/v1', a.fn).run(
      cfg('https://api.groq.com/openai/v1'),
      { system: 'sys', messages: history, tools: [TOOL], search: true },
    );
    const b = a.calls[0]!.body;
    expect(a.calls[0]!.url).toBe('https://api.groq.com/openai/v1/chat/completions');
    expect(b.messages.map((m: any) => m.role)).toEqual(['system', 'user', 'assistant', 'tool']);
    expect(b.plugins).toBeUndefined();
    expect(b.reasoning_effort).toBe('high');
    expect(t.toolCalls[0]!.id).toBe('c9');

    const o = fakeFetch(reply);
    await adapterFor('https://openrouter.ai/api/v1', o.fn).run(
      cfg('https://openrouter.ai/api/v1'),
      {
        system: 'sys',
        messages: history,
        search: true,
      },
    );
    expect(o.calls[0]!.body.plugins).toEqual([{ id: 'web' }]);
  });
});

describe('anthropic adapter', () => {
  test('thinking budget, merged tool results, raw replay, citations', async () => {
    const { fn, calls } = fakeFetch({
      content: [
        { type: 'thinking', thinking: '…', signature: 's' },
        {
          type: 'text',
          text: 'Funds moved to a mixer.',
          citations: [
            {
              type: 'web_search_result_location',
              url: 'https://y.test',
              title: 'Y',
              cited_text: 'mixer',
            },
          ],
        },
        { type: 'tool_use', id: 'tu1', name: 'get_transfers', input: { address: '0x1' } },
      ],
      usage: { input_tokens: 3, output_tokens: 2 },
    });
    const t = await adapterFor('https://api.anthropic.com/v1', fn).run(
      cfg('https://api.anthropic.com/v1'),
      { system: 'sys', messages: history, tools: [TOOL], search: true },
    );
    const b = calls[0]!.body;
    expect(calls[0]!.headers['x-api-key']).toBe('k');
    expect(b.thinking).toEqual({ type: 'enabled', budget_tokens: 16000 });
    expect(b.tools[1].type).toBe('web_search_20250305');
    expect(b.messages[2]).toEqual({
      role: 'user',
      content: [{ type: 'tool_result', tool_use_id: 'c1', content: '{"rows":[]}' }],
    });
    expect(t.text).toBe('Funds moved to a mixer.');
    expect(t.citations[0]).toEqual({ url: 'https://y.test', title: 'Y', quote: 'mixer' });
    expect(t.toolCalls[0]).toEqual({ id: 'tu1', name: 'get_transfers', args: { address: '0x1' } });
    expect(Array.isArray(t.message.raw)).toBe(true);
  });
});

describe('gemini adapter', () => {
  test('function declarations without search; grounding chunks as citations', async () => {
    const { fn, calls } = fakeFetch({
      candidates: [
        {
          content: {
            parts: [{ text: 'ok' }, { functionCall: { name: 'get_transfers', args: {} } }],
          },
          groundingMetadata: { groundingChunks: [{ web: { uri: 'https://z.test', title: 'Z' } }] },
        },
      ],
    });
    const base = 'https://generativelanguage.googleapis.com/v1beta';
    const t = await adapterFor(base, fn).run(cfg(base), {
      system: 'sys',
      messages: history,
      tools: [TOOL],
      search: true,
    });
    const b = calls[0]!.body;
    expect(calls[0]!.url).toBe(`${base}/models/m:generateContent`);
    expect(b.tools).toEqual([
      {
        functionDeclarations: [
          { name: TOOL.name, description: TOOL.description, parameters: TOOL.parameters },
        ],
      },
    ]);
    expect(b.contents.map((c: any) => c.role)).toEqual(['user', 'model', 'user']);
    expect(t.toolCalls[0]!.name).toBe('get_transfers');
    expect(t.citations).toEqual([{ url: 'https://z.test', title: 'Z' }]);
  });
});

describe('model config', () => {
  test('server roles default to Muse; the gate never uses the custom model', () => {
    const env = { MODEL_API_KEY: 'srv' } as any;
    expect(serverModel(env, 'research')).toMatchObject({ model: MUSE_MODEL, effort: 'high' });
    expect(serverModel(env, 'gate')).toMatchObject({ effort: 'low' });
    expect(serverModel({ ...env, MODEL_WRITER_MODEL: 'w' }, 'writer')!.model).toBe('w');
    expect(serverModel({} as any, 'research')).toBeNull();
    const custom = customModel(
      (n) =>
        ({
          'x-llm-base-url': 'https://openrouter.ai/api/v1/',
          'x-llm-model': 'x/y',
          'x-llm-key': 'k',
          'x-llm-effort': 'medium',
        })[n],
    )!;
    expect(custom).toEqual({
      baseUrl: 'https://openrouter.ai/api/v1',
      model: 'x/y',
      key: 'k',
      effort: 'medium',
    });
    expect(modelFor(env, 'research', custom)).toBe(custom);
    expect(modelFor(env, 'gate', custom)!.key).toBe('srv');
    expect(() => customModel((n) => (n === 'x-llm-model' ? 'm' : undefined))).toThrow();
    expect(() =>
      customModel(
        (n) => ({ 'x-llm-base-url': 'http://a.test', 'x-llm-model': 'm', 'x-llm-key': 'k' })[n],
      ),
    ).toThrow();
  });
});

describe('probe', () => {
  test('tools and search accepted', async () => {
    const { fn } = fakeFetch({
      status: 'completed',
      output: [{ type: 'function_call', call_id: 'p', name: 'ping', arguments: '{"value":"ok"}' }],
    });
    const caps = await probeModel({ ...cfg('https://api.openai.com/v1'), model: 'probe-a' }, fn);
    expect(caps).toEqual({ adapter: 'responses', tools: true, search: true, effort: true });
  });

  test('plain chat host: no search without trying', async () => {
    const { fn, calls } = fakeFetch({
      choices: [
        { message: { tool_calls: [{ id: 'p', function: { name: 'ping', arguments: '{}' } }] } },
      ],
    });
    const caps = await probeModel(
      { ...cfg('https://api.groq.com/openai/v1'), model: 'probe-b' },
      fn,
    );
    expect(caps).toMatchObject({ adapter: 'chat', tools: true, search: false });
    expect(calls.length).toBe(1);
  });

  test('bad key reports an error', async () => {
    const { fn } = fakeFetch({ error: 'nope' }, 401);
    const caps = await probeModel({ ...cfg('https://api.anthropic.com/v1'), model: 'probe-c' }, fn);
    expect(caps.tools).toBe(false);
    expect(caps.error).toContain('401');
  });
});
