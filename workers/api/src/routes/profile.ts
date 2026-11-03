// GET  /v1/address/:chain/:address/profile  value-ranked profile over the
//      first 5,000 transfers (stores/profile.ts), cached 10 minutes.
// POST /v1/balances/:chain { addresses }     current holdings in USD, contract
//      flag and verified name, up to 12 addresses per call.
import { Hono } from 'hono';
import { chainBase } from '@/constants/chains';
import { balancesOf } from '@/stores/balances';
import { buildProfile } from '@/stores/profile';
import type { Env } from '@/types';

const ADDRESS = /^0x[0-9a-fA-F]{40}$/;

export function createProfileRoutes(fetchImpl?: typeof fetch) {
  const routes = new Hono<{ Bindings: Env }>();

  routes.get('/v1/address/:chain/:address/profile', async (c) => {
    const { chain, address } = c.req.param();
    if (!chainBase(chain)) return c.json({ error: `unsupported chain: ${chain}` }, 400);
    if (!ADDRESS.test(address)) return c.json({ error: 'invalid address' }, 400);
    try {
      return c.json(await buildProfile(c.env, chain, address, fetchImpl));
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : 'profile failed' }, 502);
    }
  });

  routes.post('/v1/balances/:chain', async (c) => {
    const chain = c.req.param('chain');
    if (!chainBase(chain)) return c.json({ error: `unsupported chain: ${chain}` }, 400);
    const body = (await c.req.json().catch(() => null)) as { addresses?: unknown } | null;
    const addresses = (Array.isArray(body?.addresses) ? body.addresses : [])
      .filter((a): a is string => typeof a === 'string' && ADDRESS.test(a))
      .map((a) => a.toLowerCase())
      .slice(0, 12);
    if (!addresses.length) return c.json({ error: 'addresses (1-12) required' }, 400);
    try {
      return c.json({ chain, balances: await balancesOf(c.env, chain, addresses, fetchImpl) });
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : 'balances failed' }, 502);
    }
  });

  return routes;
}
