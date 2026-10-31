// Fund-flow tracing route (API-2). Thin: parse -> trace -> respond.
import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';
import { z } from 'zod';
import { alchemyClient } from '@/alchemy';
import { chainBase } from '@/constants/chains';
import { nowIso } from '@/stores/transfers';
import { traceFunds } from '@/stores/trace';
import type { AlchemyClient, Env } from '@/types';

const traceParam = z.object({
  chain: z.string(),
  address: z.string().regex(/^0x[0-9a-fA-F]{40}$/),
});

const traceQuery = z.object({
  direction: z.enum(['in', 'out', 'both']).optional().default('both'),
  depth: z.coerce.number().int().min(1).max(2).optional().default(2),
  fanout: z.coerce.number().int().min(1).max(100).optional().default(25),
  minValue: z.coerce.number().nonnegative().optional(),
  asset: z.string().max(16).optional(),
});

export function createTraceRoutes(client: AlchemyClient = alchemyClient) {
  const routes = new Hono<{ Bindings: Env }>();

  routes.get(
    '/v1/trace/:chain/:address',
    zValidator('param', traceParam),
    zValidator('query', traceQuery),
    async (c) => {
      const { chain, address } = c.req.valid('param');
      const query = c.req.valid('query');
      if (!chainBase(chain)) return c.json({ error: `unsupported chain: ${chain}` }, 400);
      const { result, liveUsed, stale, empty } = await traceFunds(
        c.env,
        client,
        chain,
        address,
        query,
      );
      if (empty && !c.env.ALCHEMY_API_KEY) {
        return c.json(
          {
            address: address.toLowerCase(),
            chain,
            live: false,
            cached: false,
            fetched_at: nowIso(),
            note: 'no cached transfers and no ALCHEMY_API_KEY: nothing to trace',
          },
          502,
        );
      }
      return c.json({
        address: address.toLowerCase(),
        chain,
        direction: query.direction,
        depth: query.depth,
        live: liveUsed,
        cached: !liveUsed || result.stats.cacheHits > 0,
        stale,
        fetched_at: nowIso(),
        ...result,
      });
    },
  );

  return routes;
}
