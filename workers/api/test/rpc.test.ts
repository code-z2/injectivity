// Bring-your-own RPC: the x-rpc-url header routes this request's live calls
// through the client's endpoint; /health/rpc/:chain reports what lookups
// will actually hit.
import { afterEach, describe, expect, test } from 'bun:test';
import { makeTestEnv } from './harness';

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

function stubRpc(reply: (url: string) => Response) {
  const seen: string[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input instanceof Request ? input.url : input);
    seen.push(url);
    return reply(url);
  }) as typeof fetch;
  return seen;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function probe(env: any, app: ReturnType<typeof makeTestEnv>['app'], rpc?: string) {
  const res = await app.fetch(
    new Request('http://test/health/rpc/ethereum', {
      headers: rpc ? { 'x-rpc-url': rpc } : {},
    }),
    env,
  );
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
}

describe('custom rpc', () => {
  test('rejects a non-https x-rpc-url', async () => {
    const { app, env } = makeTestEnv();
    const r = await probe(env, app, 'http://insecure.example');
    expect(r.status).toBe(400);
  });

  test('probe goes to the custom rpc and reports ok', async () => {
    const { app, env } = makeTestEnv();
    const seen = stubRpc(() => Response.json({ jsonrpc: '2.0', id: 1, result: { transfers: [] } }));
    const r = await probe(env, app, 'https://my-rpc.example/v2/k');
    expect(r.body.health).toBe('ok');
    expect(r.body.custom).toBe(true);
    expect(seen).toEqual(['https://my-rpc.example/v2/k']);
  });

  test('probe reports a throttled rpc as rate-limited', async () => {
    const { app, env } = makeTestEnv();
    stubRpc(() => new Response('slow down', { status: 429 }));
    const r = await probe(env, app, 'https://my-rpc.example');
    expect(r.body.health).toBe('rate-limited');
  });

  test('probe reports an rpc without the transfers method as unsupported', async () => {
    const { app, env } = makeTestEnv();
    stubRpc(() =>
      Response.json({
        jsonrpc: '2.0',
        id: 1,
        error: { code: -32601, message: 'Method not found' },
      }),
    );
    const r = await probe(env, app, 'https://plain-node.example');
    expect(r.body.health).toBe('unsupported');
  });

  test('no key and no custom rpc is unavailable', async () => {
    const { app, env } = makeTestEnv();
    const r = await probe({ ...(env as object), ALCHEMY_API_KEY: undefined }, app);
    expect(r.body.health).toBe('unavailable');
  });
});
