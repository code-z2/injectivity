// POST /v1/models/probe: capabilities of the visitor's custom model
// (x-llm-* headers), or of the server research model when none is set.
// Never echoes a key or which vendor API was picked.
import { Hono } from 'hono';
import { ConfigError, customModel, serverModel } from '@/llm/config';
import { probeModel } from '@/llm/probe';
import type { Env } from '@/types';

export function createModelsRoutes(modelFetch?: typeof fetch) {
  const routes = new Hono<{ Bindings: Env }>();

  routes.post('/v1/models/probe', async (c) => {
    let cfg;
    try {
      cfg = customModel((n) => c.req.header(n)) ?? serverModel(c.env, 'research');
    } catch (err) {
      if (err instanceof ConfigError) return c.json({ error: err.message }, 400);
      throw err;
    }
    if (!cfg) return c.json({ error: 'no model configured on the server' }, 503);
    const caps = await probeModel(cfg, modelFetch);
    // Which wire format was picked stays internal.
    const { adapter: _adapter, ...visible } = caps;
    return c.json({ model: cfg.model, ...visible });
  });

  return routes;
}
