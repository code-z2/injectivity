// LLM-1 route: POST /v1/investigate. BYO Muse key via X-Model-Key header
// (env MODEL_API_KEY as fallback). stream=true sends SSE status events
// while the pipeline runs, then the validated report; otherwise plain JSON.
// Token-level streaming is deliberately not exposed: only validated output
// leaves the server, so ungrounded draft text can never reach the client.
import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';
import { z } from 'zod';
import { alchemyClient } from '@/alchemy';
import { chainBase } from '@/constants/chains';
import { InvestigationError, investigate } from '@/llm/investigate';
import { nowIso } from '@/stores/transfers';
import type { AlchemyClient, Env } from '@/types';

const investigateBody = z.object({
  chain: z.string(),
  address: z.string().regex(/^0x[0-9a-fA-F]{40}$/),
  direction: z.enum(['in', 'out', 'both']).optional().default('both'),
  depth: z.number().int().min(1).max(2).optional().default(2),
  fanout: z.number().int().min(1).max(100).optional().default(25),
  model: z.string().max(64).optional(),
  reasoningEffort: z.enum(['low', 'medium', 'high']).optional(),
  webSearch: z.boolean().optional(),
  stream: z.boolean().optional().default(false),
});

interface InvestigateRouteOptions {
  client?: AlchemyClient;
  modelFetch?: typeof fetch;
}

export function createInvestigateRoutes(options: InvestigateRouteOptions = {}) {
  const client = options.client ?? alchemyClient;
  const routes = new Hono<{ Bindings: Env }>();

  routes.post('/v1/investigate', zValidator('json', investigateBody), async (c) => {
    const params = c.req.valid('json');
    if (!chainBase(params.chain))
      return c.json({ error: `unsupported chain: ${params.chain}` }, 400);
    const apiKey = c.req.header('x-model-key') || c.env.MODEL_API_KEY;
    if (!apiKey) {
      return c.json({ error: 'BYO model key required: X-Model-Key header' }, 401);
    }
    const base = {
      ...params,
      apiKey,
      baseUrl: c.env.MODEL_API_BASE_URL || undefined,
    };

    if (!params.stream) {
      try {
        const result = await investigate(c.env, client, base, options.modelFetch);
        return c.json({
          address: params.address.toLowerCase(),
          chain: params.chain,
          fetched_at: nowIso(),
          ...result,
        });
      } catch (err) {
        if (err instanceof InvestigationError) {
          return c.json(
            { error: err.message, problems: err.problems, fetched_at: nowIso() },
            err.status as 502,
          );
        }
        throw err;
      }
    }

    const enc = new TextEncoder();
    const stream = new ReadableStream({
      start(controller) {
        const send = (event: string, data: unknown) => {
          controller.enqueue(enc.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
        };
        investigate(c.env, client, base, options.modelFetch, (stage) => send('status', { stage }))
          .then((result) =>
            send('report', {
              address: params.address.toLowerCase(),
              chain: params.chain,
              fetched_at: nowIso(),
              ...result,
            }),
          )
          .catch((err) =>
            send('error', {
              error: err instanceof Error ? err.message : 'unknown',
              problems: err instanceof InvestigationError ? err.problems : [],
            }),
          )
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
