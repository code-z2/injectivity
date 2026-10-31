// Hono application factory. Route groups mount here; options bag lets
// tests inject fakes (e.g. a stub alchemy client) without touching bindings.
// A bare createApp() call produces the production app, default-exported
// for the Worker fetch handler.
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { createAddressRoutes } from '@/routes/address';
import { createInvestigateRoutes } from '@/routes/investigate';
import { createTraceRoutes } from '@/routes/trace';
import type { CreateAppOptions, Env } from '@/types';

export function createApp(options: CreateAppOptions = {}) {
  const app = new Hono<{ Bindings: Env }>();

  app.use('/v1/*', cors());

  app.get('/', (c) => c.json({ ok: true, service: 'intel-terminal-api', version: 1 }));
  app.get('/health', (c) => c.json({ ok: true }));

  app.route('/', createAddressRoutes(options.alchemy));
  app.route('/', createTraceRoutes(options.alchemy));
  app.route(
    '/',
    createInvestigateRoutes({ client: options.alchemy, modelFetch: options.modelFetch }),
  );

  app.notFound((c) =>
    c.json({ error: 'not found. try GET /v1/address/:chain/:address[/transfers]' }, 404),
  );

  return app;
}
