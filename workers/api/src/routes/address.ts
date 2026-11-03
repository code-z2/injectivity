// Address intelligence routes. Injected alchemy client keeps tests offline.
import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';
import { z } from 'zod';
import { alchemyClient, getTokenLogo, hasLiveRpc } from '@/alchemy';
import { chainBase } from '@/constants/chains';
import { cachedTransfers, nowIso, storeTransfers } from '@/stores/transfers';
import { assessRisk } from '@/stores/risk';
import type { AlchemyClient, Env } from '@/types';

const addressParam = z.object({
  chain: z.string(),
  address: z.string().regex(/^0x[0-9a-fA-F]{40}$/),
});

const transfersQuery = z.object({
  direction: z.enum(['in', 'out', 'both']).optional().default('both'),
  pageKey: z.string().optional(),
  // live=1 skips the fresh-cache shortcut so the response carries a
  // pageKey (the ledger pages on); the cache still backs a failed fetch.
  live: z.enum(['0', '1']).optional(),
});

const tokenParam = z.object({
  chain: z.string(),
  contract: z.string().regex(/^0x[0-9a-fA-F]{40}$/),
});

const labelsBody = z.object({
  addresses: z
    .array(z.string().regex(/^0x[0-9a-fA-F]{40}$/))
    .min(1)
    .max(500),
});

export function createAddressRoutes(client: AlchemyClient = alchemyClient) {
  const routes = new Hono<{ Bindings: Env }>();

  routes.get('/v1/address/:chain/:address', zValidator('param', addressParam), async (c) => {
    const { chain, address } = c.req.valid('param');
    if (!chainBase(chain)) return c.json({ error: `unsupported chain: ${chain}` }, 400);
    const assessment = await assessRisk(c.env, client, chain, address);
    const live = hasLiveRpc(c.env, chain);
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
    return c.json({
      address: address.toLowerCase(),
      chain,
      live,
      cached: !live || balances === null,
      fetched_at: nowIso(),
      labels: assessment.matches
        .filter((m) => m.match_type === 'exact')
        .map(({ list_name, role, label, version }) => ({ list_name, role, label, version })),
      risk: assessment,
      balances,
    });
  });

  routes.get(
    '/v1/address/:chain/:address/transfers',
    zValidator('param', addressParam),
    zValidator('query', transfersQuery),
    async (c) => {
      const { chain, address } = c.req.valid('param');
      const { direction, pageKey, live: wantLive } = c.req.valid('query');
      if (!chainBase(chain)) return c.json({ error: `unsupported chain: ${chain}` }, 400);
      const cache = await cachedTransfers(c.env, chain, address, direction);
      if (cache.fresh && !pageKey && wantLive !== '1') {
        return c.json({
          address: address.toLowerCase(),
          chain,
          live: false,
          cached: true,
          fetched_at: nowIso(),
          transfers: cache.rows,
        });
      }
      if (!hasLiveRpc(c.env, chain)) {
        return c.json({
          address: address.toLowerCase(),
          chain,
          live: false,
          cached: cache.rows.length > 0,
          stale: true,
          fetched_at: nowIso(),
          transfers: cache.rows,
          note: 'no live RPC: D1 cache only',
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
        if (err instanceof Error && err.message === 'bad-page-key') {
          return c.json({ error: 'invalid pageKey' }, 400);
        }
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

  // Token logo from Alchemy, for icons DefiLlama and Trust Wallet lack.
  // Redirects to the image so it works as an <img> src; 404 when there is
  // none. Both cached a day at the edge and in browsers.
  routes.get('/v1/token-logo/:chain/:contract', zValidator('param', tokenParam), async (c) => {
    const { chain, contract } = c.req.valid('param');
    if (!chainBase(chain)) return c.json({ error: `unsupported chain: ${chain}` }, 400);
    const cache = { 'cache-control': 'public, max-age=86400' };
    try {
      const logo = await getTokenLogo(c.env, chain, contract);
      if (!logo) return c.json({ logo: null }, 404, cache);
      return c.body(null, 302, { ...cache, location: logo });
    } catch {
      return c.json({ logo: null }, 502);
    }
  });

  // Known labels for many addresses at once (exploit attackers/victims,
  // OFAC), for counterparty role dots and filters. Unlisted addresses are
  // simply absent from the map.
  routes.post('/v1/labels/:chain', zValidator('json', labelsBody), async (c) => {
    const chain = c.req.param('chain');
    if (!chainBase(chain)) return c.json({ error: `unsupported chain: ${chain}` }, 400);
    const wanted = [...new Set(c.req.valid('json').addresses.map((a) => a.toLowerCase()))];
    const labels: Record<string, { role: string; label: string; list: string; chains: string[] }> =
      {};
    for (let i = 0; i < wanted.length; i += 90) {
      const chunk = wanted.slice(i, i + 90);
      const rows = await c.env.DB.prepare(
        `SELECT address, list_name, role, label, chains FROM risk_lists
         WHERE address IN (${chunk.map(() => '?').join(',')})`,
      )
        .bind(...chunk)
        .all<{ address: string; list_name: string; role: string; label: string; chains: string }>();
      for (const r of rows.results ?? []) {
        let chains: string[] = [];
        try {
          chains = JSON.parse(r.chains) as string[];
        } catch {
          // Malformed chains column: keep the label without it.
        }
        const prev = labels[r.address];
        // Prefer the row for this chain, then attacker over victim over sanctioned.
        const rank = (x: { role: string; chains: string[] }) =>
          (x.chains.includes(chain) ? 0 : 10) +
          (x.role === 'attacker' ? 0 : x.role === 'victim' ? 1 : 2);
        const next = { role: r.role, label: r.label, list: r.list_name, chains };
        if (!prev || rank(next) < rank(prev)) labels[r.address] = next;
      }
    }
    return c.json({ chain, labels });
  });

  return routes;
}
