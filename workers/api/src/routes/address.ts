// Address intelligence routes. Injected alchemy client keeps tests offline.
import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';
import { z } from 'zod';
import { alchemyClient } from '@/alchemy';
import { chainBase } from '@/constants/chains';
import { cachedTransfers, nowIso, storeTransfers } from '@/stores/transfers';
import { recordRiskHit, riskLabels } from '@/stores/risk';
import type { AlchemyClient, Env } from '@/types';

const addressParam = z.object({
  chain: z.string(),
  address: z.string().regex(/^0x[0-9a-fA-F]{40}$/),
});

const transfersQuery = z.object({
  direction: z.enum(['in', 'out', 'both']).optional().default('both'),
  pageKey: z.string().optional(),
});

export function createAddressRoutes(client: AlchemyClient = alchemyClient) {
  const routes = new Hono<{ Bindings: Env }>();

  routes.get('/v1/address/:chain/:address', zValidator('param', addressParam), async (c) => {
    const { chain, address } = c.req.valid('param');
    if (!chainBase(chain)) return c.json({ error: `unsupported chain: ${chain}` }, 400);
    const labels = await riskLabels(c.env, address);
    const live = Boolean(c.env.ALCHEMY_API_KEY);
    let balances: { native: string; tokens: unknown[] } | null = null;
    if (live) {
      try {
        const [native, tokens] = await Promise.all([
          client.getNativeBalance(c.env, chain, address),
          client.getTokenBalances(c.env, chain, address),
        ]);
        balances = { native, tokens };
      } catch {
        // Live failed: fall through to cached-only response.
      }
    }
    for (const l of labels) {
      await recordRiskHit(c.env, address, l.list_name, l.version, 'exact').catch(() => undefined);
    }
    return c.json({
      address: address.toLowerCase(),
      chain,
      live,
      cached: !live || balances === null,
      fetched_at: nowIso(),
      labels,
      balances,
    });
  });

  routes.get(
    '/v1/address/:chain/:address/transfers',
    zValidator('param', addressParam),
    zValidator('query', transfersQuery),
    async (c) => {
      const { chain, address } = c.req.valid('param');
      const { direction, pageKey } = c.req.valid('query');
      if (!chainBase(chain)) return c.json({ error: `unsupported chain: ${chain}` }, 400);
      const cache = await cachedTransfers(c.env, chain, address, direction);
      if (cache.fresh && !pageKey) {
        return c.json({
          address: address.toLowerCase(),
          chain,
          live: false,
          cached: true,
          fetched_at: nowIso(),
          transfers: cache.rows,
        });
      }
      if (!c.env.ALCHEMY_API_KEY) {
        return c.json({
          address: address.toLowerCase(),
          chain,
          live: false,
          cached: cache.rows.length > 0,
          stale: true,
          fetched_at: nowIso(),
          transfers: cache.rows,
          note: 'no ALCHEMY_API_KEY: D1 cache only',
        });
      }
      try {
        const { transfers, pageKey: next } = await client.getTransfers(
          c.env,
          chain,
          address,
          direction,
          pageKey,
        );
        await storeTransfers(c.env, chain, transfers);
        return c.json({
          address: address.toLowerCase(),
          chain,
          live: true,
          cached: false,
          fetched_at: nowIso(),
          transfers,
          pageKey: next,
        });
      } catch (err) {
        const liveFailed = cache.rows.length > 0;
        return c.json(
          {
            address: address.toLowerCase(),
            chain,
            live: false,
            cached: liveFailed,
            stale: true,
            fetched_at: nowIso(),
            transfers: cache.rows,
            note: `live fetch failed (${err instanceof Error ? err.message : 'unknown'}); serving cache`,
          },
          liveFailed ? 200 : 502,
        );
      }
    },
  );

  return routes;
}
