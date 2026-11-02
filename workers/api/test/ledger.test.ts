// The trace page's ledger: richer transfers (token contract, time), paging
// both directions with one cursor, and batch labels for counterparties.
import { afterEach, describe, expect, test } from 'bun:test';
import { getTransfers } from '../src/alchemy';
import { FIX, get, lo, makeTestEnv } from './harness';

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

const ADDR = '0x00000000000000000000000000000000000000aa';
function raw(side: 'in' | 'out', n: number, block: number) {
  return {
    hash: `0x${side === 'in' ? 'a' : 'b'}${String(n).padStart(63, '0')}`,
    from: side === 'in' ? '0x' + '1'.repeat(40) : ADDR,
    to: side === 'in' ? ADDR : '0x' + '2'.repeat(40),
    asset: 'USDC',
    value: 12.5,
    blockNum: `0x${block.toString(16)}`,
    category: 'erc20',
    uniqueId: `u-${side}-${n}`,
    rawContract: { address: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48' },
    metadata: { blockTimestamp: '2026-10-01T00:00:00.000Z' },
  };
}

// A fake Alchemy that pages each side: inflows have 2 pages, outflows 1.
function stubAlchemy() {
  const calls: Array<{ side: string; pageKey?: string }> = [];
  globalThis.fetch = (async (_url: RequestInfo | URL, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body)) as { params: [Record<string, string>] };
    const p = body.params[0];
    const side = p.toAddress ? 'in' : 'out';
    calls.push({ side, pageKey: p.pageKey });
    let result;
    if (side === 'in' && !p.pageKey) result = { transfers: [raw('in', 1, 300)], pageKey: 'in-2' };
    else if (side === 'in') result = { transfers: [raw('in', 2, 100)] };
    else result = { transfers: [raw('out', 1, 200)] };
    return Response.json({ jsonrpc: '2.0', id: 1, result });
  }) as typeof fetch;
  return calls;
}

describe('ledger transfers', () => {
  const env = { RPC_URLS: JSON.stringify({ ethereum: 'https://rpc.example' }) } as never;

  test('both directions page with one cursor until each side is done', async () => {
    const calls = stubAlchemy();
    const first = await getTransfers(env, 'ethereum', ADDR, 'both');
    expect(first.transfers.map((t) => t.uniqueId)).toEqual(['u-in-1', 'u-out-1']);
    expect(first.pageKey).toBeDefined();

    const second = await getTransfers(env, 'ethereum', ADDR, 'both', first.pageKey);
    expect(second.transfers.map((t) => t.uniqueId)).toEqual(['u-in-2']);
    expect(second.pageKey).toBeUndefined();
    // The finished outflow side is not asked again.
    expect(calls.slice(2)).toEqual([{ side: 'in', pageKey: 'in-2' }]);
  });

  test('transfers carry token contract, time and category', async () => {
    stubAlchemy();
    const { transfers } = await getTransfers(env, 'ethereum', ADDR, 'out');
    expect(transfers[0]).toMatchObject({
      contract: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
      timestamp: '2026-10-01T00:00:00.000Z',
      category: 'erc20',
      value: '12.5',
    });
  });

  test('a garbled both-directions cursor is rejected', async () => {
    stubAlchemy();
    await expect(getTransfers(env, 'ethereum', ADDR, 'both', '%%%')).rejects.toThrow(
      'bad-page-key',
    );
  });

  test('cached rows keep the stored contract and time', async () => {
    const { app, env: testEnv, db } = makeTestEnv();
    db.prepare(
      `INSERT INTO transfers (uid, tx_hash, chain, from_addr, to_addr, asset, amount, block_number, raw, fetched_at)
       VALUES (?1,?1,?2,?3,?4,?5,?6,?7,?8,?9)`,
    ).run(
      `0x${'e'.repeat(64)}`,
      'ethereum',
      lo(FIX.sanctioned.address),
      lo(FIX.mid.address),
      'USDC',
      '3',
      21000000,
      JSON.stringify({ ...raw('out', 9, 21000000), hash: `0x${'e'.repeat(64)}` }),
      new Date().toISOString(),
    );
    const r = await get(app, testEnv, `/v1/address/ethereum/${FIX.sanctioned.address}/transfers`);
    const t = (r.body.transfers as Array<Record<string, unknown>>)[0]!;
    expect(t.contract).toBe('0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48');
    expect(t.timestamp).toBe('2026-10-01T00:00:00.000Z');
  });
});

describe('batch labels', () => {
  test('returns known roles and omits unlisted addresses', async () => {
    const { app, env } = makeTestEnv();
    const res = await app.fetch(
      new Request('http://test/v1/labels/ethereum', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          addresses: [FIX.exploit.address, FIX.sanctioned.address, FIX.clean.address],
        }),
      }),
      env,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { labels: Record<string, { role: string }> };
    expect(body.labels[lo(FIX.exploit.address)]?.role).toBe('attacker');
    expect(body.labels[lo(FIX.sanctioned.address)]?.role).toBe('sanctioned');
    expect(body.labels[lo(FIX.clean.address)]).toBeUndefined();
  });
});
