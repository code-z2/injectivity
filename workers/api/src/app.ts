// Hono application factory. Route groups mount here; options bag lets
// tests inject fakes (e.g. a stub alchemy client) without touching bindings.
// A bare createApp() call produces the production app, default-exported
// for the Worker fetch handler.
import { Hono, type MiddlewareHandler } from 'hono';
import { cors } from 'hono/cors';
import { probeRpc } from '@/alchemy';
import { CHAIN_BASE, chainBase } from '@/constants/chains';
import { createAddressRoutes } from '@/routes/address';
import { createInvestigateRoutes } from '@/routes/investigate';
import { createReportsRoutes } from '@/routes/reports';
import { createTraceRoutes } from '@/routes/trace';
import type { CreateAppOptions, Env } from '@/types';

export function createApp(options: CreateAppOptions = {}) {
  const app = new Hono<{ Bindings: Env }>();

  app.use('/v1/*', cors());
  // Browser status indicator on the landing page reads /health.
  app.use('/health', cors());
  app.use('/health/*', cors());
  app.use('/v1/*', withRequestRpc);
  app.use('/health/*', withRequestRpc);

  app.get('/', (c) => c.json({ ok: true, service: 'intel-terminal-api', version: 1 }));
  app.get('/health', (c) => c.json({ ok: true }));
  // The RPC lookups actually use (the client's custom one, or the built-in).
  app.get('/health/rpc/:chain', async (c) => {
    const chain = c.req.param('chain');
    if (!chainBase(chain)) return c.json({ error: `unsupported chain: ${chain}` }, 400);
    const probe = await probeRpc(c.env, chain);
    return c.json({ chain, ...probe });
  });

  app.route('/', createAddressRoutes(options.alchemy));
  app.route('/', createTraceRoutes(options.alchemy));
  app.route(
    '/',
    createInvestigateRoutes({ client: options.alchemy, modelFetch: options.modelFetch }),
  );
  app.route('/', createReportsRoutes(options.alchemy));

  app.notFound((c) =>
    c.json({ error: 'not found. try GET /v1/address/:chain/:address[/transfers]' }, 404),
  );

  return app;
}

// Bring-your-own RPC per request: a valid https x-rpc-url header becomes
// this request's RPC_URLS for every chain (each request names one chain).
// A fresh env object, so one visitor's RPC never leaks into another's.
const withRequestRpc: MiddlewareHandler<{ Bindings: Env }> = async (c, next) => {
  const raw = c.req.header('x-rpc-url')?.trim();
  if (raw) {
    let url: URL;
    try {
      url = new URL(raw);
    } catch {
      return c.json({ error: 'x-rpc-url must be a valid https URL' }, 400);
    }
    if (url.protocol !== 'https:') {
      return c.json({ error: 'x-rpc-url must be a valid https URL' }, 400);
    }
    const all = Object.fromEntries(Object.keys(CHAIN_BASE).map((k) => [k, url.href]));
    c.env = { ...c.env, RPC_URLS: JSON.stringify(all) };
  }
  await next();
};
