// Agent routes.
//   POST /v1/agent/sessions { chain, root }  → { id }   (a new investigation)
//   GET  /v1/agent/sessions/:id              → WebSocket (frames in agent/durable.ts)
//   GET  /v1/agent/sessions/:id/state        → transcript, sources, workspace
// POST /v1/agent/summary streams a node summary as SSE:
// `facts` as soon as they're computed, then `summary` (verified sentences
// and their sources), then `done`. Uses the visitor's custom model
// (x-llm-* headers) when set, else the server's summary model.
import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';
import { z } from 'zod';
import { alchemyClient } from '@/alchemy';
import { summarise } from '@/agent/summary';
import { chainBase } from '@/constants/chains';
import { adapterFor } from '@/llm/adapters';
import { ConfigError, customModel, modelFor } from '@/llm/config';
import type { AlchemyClient, Env } from '@/types';

const sessionBody = z.object({
  chain: z.string(),
  root: z.string().regex(/^0x[0-9a-fA-F]{40}$/),
});

const SESSION_ID = /^[0-9a-f]{64}$/;

const summaryBody = z.object({
  chain: z.string(),
  address: z.string().regex(/^0x[0-9a-fA-F]{40}$/),
});

export function createAgentRoutes(
  options: { client?: AlchemyClient; modelFetch?: typeof fetch } = {},
) {
  const client = options.client ?? alchemyClient;
  const routes = new Hono<{ Bindings: Env }>();

  routes.post('/v1/agent/sessions', zValidator('json', sessionBody), async (c) => {
    const { chain, root } = c.req.valid('json');
    if (!chainBase(chain)) return c.json({ error: `unsupported chain: ${chain}` }, 400);
    const ns = c.env.AGENT_SESSIONS;
    if (!ns) return c.json({ error: 'agent sessions are not configured' }, 503);
    const id = ns.newUniqueId();
    const res = await ns
      .get(id)
      .fetch('https://session/init', { method: 'POST', body: JSON.stringify({ chain, root }) });
    if (!res.ok) return c.json({ error: 'could not start the session' }, 502);
    return c.json({ id: id.toString(), ...((await res.json()) as object) }, 201);
  });

  routes.get('/v1/agent/sessions/:id/state', async (c) => {
    const stub = sessionStub(c.env, c.req.param('id'));
    if (!stub) return c.json({ error: 'unknown session' }, 404);
    return stub.fetch('https://session/state');
  });

  routes.get('/v1/agent/sessions/:id', async (c) => {
    const stub = sessionStub(c.env, c.req.param('id'));
    if (!stub) return c.json({ error: 'unknown session' }, 404);
    if (c.req.header('upgrade') !== 'websocket')
      return c.json({ error: 'expected a websocket upgrade' }, 426);
    return stub.fetch(c.req.raw);
  });

  routes.post('/v1/agent/summary', zValidator('json', summaryBody), async (c) => {
    const { chain, address } = c.req.valid('json');
    if (!chainBase(chain)) return c.json({ error: `unsupported chain: ${chain}` }, 400);
    let cfg;
    try {
      cfg = modelFor(
        c.env,
        'summary',
        customModel((n) => c.req.header(n)),
      );
    } catch (err) {
      if (err instanceof ConfigError) return c.json({ error: err.message }, 400);
      throw err;
    }
    const model = cfg ? { adapter: adapterFor(cfg.baseUrl, options.modelFetch), cfg } : null;
    const enc = new TextEncoder();
    const signal = c.req.raw.signal;
    const stream = new ReadableStream({
      start(controller) {
        const send = (event: string, data: unknown) => {
          try {
            controller.enqueue(enc.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
          } catch {
            // Client went away.
          }
        };
        summarise({
          env: c.env,
          client,
          chain,
          address,
          model,
          fetch: options.modelFetch,
          signal,
          onFacts: (facts, coverage) => send('facts', { facts, coverage }),
        })
          .then((s) => send('summary', s))
          .catch((err) => send('error', { error: err instanceof Error ? err.message : 'unknown' }))
          .finally(() => {
            send('done', {});
            controller.close();
          });
      },
    });
    return new Response(stream, {
      headers: { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' },
    });
  });

  return routes;
}

function sessionStub(env: Env, id: string) {
  if (!env.AGENT_SESSIONS || !SESSION_ID.test(id)) return null;
  try {
    return env.AGENT_SESSIONS.get(env.AGENT_SESSIONS.idFromString(id));
  } catch {
    return null;
  }
}
