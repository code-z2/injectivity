// Agent sessions: scope gate, research turn, stored history and follow-ups,
// against an in-memory store and a scripted OpenAI-compatible model.
import { describe, expect, test } from 'bun:test';
import type { Source } from '@/agent/ledger';
import {
  type Entry,
  type Meta,
  SessionCore,
  type SessionEvent,
  type SessionState,
  type SessionStore,
} from '@/agent/session';
import type { Workspace } from '@/agent/tools/types';
import type { Msg } from '@/llm/adapters';

class MemoryStore implements SessionStore {
  s: SessionState = { meta: null, messages: [], sources: [], transcript: [], workspace: null };
  async load() {
    return structuredClone(this.s);
  }
  async setMeta(m: Meta) {
    this.s.meta = m;
  }
  async setWorkspace(w: Workspace) {
    this.s.workspace = w;
  }
  async append(a: { messages?: Msg[]; sources?: Source[]; transcript?: Entry[] }) {
    this.s.messages.push(...(a.messages ?? []));
    this.s.sources.push(...(a.sources ?? []));
    this.s.transcript.push(...(a.transcript ?? []));
  }
}

const ROOT = '0xa4b2fd68593b6f34e51cb9edb66e71c1b4ab449e';

/** Scripted model: gate, probe and research replies decided by the request. */
function fakeModel() {
  const research: unknown[] = [];
  const fn = (async (_url: string, init: RequestInit) => {
    const body = JSON.parse(String(init.body));
    const reply = (message: unknown) =>
      new Response(JSON.stringify({ choices: [{ message }] }), { status: 200 });
    if (body.response_format?.json_schema?.name === 'scope') {
      const latest = String(body.messages.at(-1).content);
      return reply({ content: JSON.stringify({ inScope: !latest.includes('poem'), reason: '' }) });
    }
    if (body.tools?.some((t: any) => t.function.name === 'ping'))
      return reply({ tool_calls: [{ id: 'p', function: { name: 'ping', arguments: '{}' } }] });
    research.push(body);
    const sawTool = body.messages.some((m: any) => m.role === 'tool');
    if (!sawTool)
      return reply({
        tool_calls: [{ id: 'w1', function: { name: 'workspace', arguments: '{}' } }],
      });
    return reply({ content: 'The analyst is tracing one address. It moved 5,000 USDC.' });
  }) as unknown as typeof fetch;
  return { fn, research };
}

function core() {
  const store = new MemoryStore();
  const model = fakeModel();
  const env = {
    MODEL_API_KEY: 'k',
    MODEL_API_BASE_URL: 'https://llm.test/v1',
    MODEL_API_MODEL: `m-${Math.random()}`,
  } as never;
  return { store, model, session: new SessionCore(store, env, {} as never, model.fn) };
}

async function ask(session: SessionCore, text: string) {
  const events: SessionEvent[] = [];
  await session.ask(text, { onEvent: (e) => events.push(e) });
  return events;
}

describe('agent session', () => {
  test('init seeds the workspace; out-of-scope messages get the fixed decline', async () => {
    const { session, store, model } = core();
    await session.init('ethereum', ROOT);
    expect(store.s.workspace?.links).toEqual([{ address: ROOT, role: 'normal' }]);
    const ev = await ask(session, 'write me a poem');
    expect(ev.map((e) => e.type)).toEqual(['status', 'declined']);
    expect(store.s.transcript.map((e) => e.role)).toEqual(['user', 'assistant']);
    expect(store.s.transcript[1]!.declined).toBe(true);
    expect(model.research.length).toBe(0);
  });

  test('research turn: verified answer stored with history; follow-up sees it', async () => {
    const { session, store, model } = core();
    await session.init('ethereum', ROOT);
    const ev = await ask(session, 'What is being traced?');
    const answer = ev.find((e) => e.type === 'answer') as Extract<SessionEvent, { type: 'answer' }>;
    // The uncited figure is removed by the verifier.
    expect(answer.entry.text).toBe('The analyst is tracing one address.');
    expect(answer.removed.length).toBe(1);
    expect(ev.some((e) => e.type === 'step' && e.step.type === 'tool')).toBe(true);
    expect(store.s.messages.map((m) => m.role)).toEqual(['user', 'assistant', 'tool', 'assistant']);

    await ask(session, 'And the follow-up?');
    const last = model.research.at(-1) as { messages: { role: string }[] };
    // System + first turn (4) + new question.
    expect(last.messages.slice(0, 6).map((m) => m.role)).toEqual([
      'system',
      'user',
      'assistant',
      'tool',
      'assistant',
      'user',
    ]);
    expect(store.s.transcript.length).toBe(4);
  });

  test('custom model must be complete and https', async () => {
    const { session } = core();
    await session.init('ethereum', ROOT);
    const events: SessionEvent[] = [];
    await session.ask('trace it', {
      model: { baseUrl: 'http://insecure.test', model: 'x', key: 'k' },
      onEvent: (e) => events.push(e),
    });
    expect(events.at(-1)).toEqual({
      type: 'error',
      error: 'x-llm-base-url must be a valid https URL',
    });
  });
});
