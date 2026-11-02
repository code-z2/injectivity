// Node summaries: facts computed from a ledger page, model sentences
// verified against them, and the facts standing alone when the model fails.
import { describe, expect, test } from 'bun:test';
import { buildFacts, summarise } from '@/agent/summary';
import type { ModelAdapter } from '@/llm/adapters';
import { FIX, lo, makeTestEnv } from './harness';

const ME = lo(FIX.exploit.address);
const CP = '0x1111111111111111111111111111111111111111';
const SANCTIONED = lo(FIX.sanctioned.address);

function tx(
  i: number,
  from: string,
  to: string,
  asset: string,
  value: string,
  contract: string | null,
) {
  return {
    hash: `0x${i.toString(16).padStart(64, '0')}`,
    from,
    to,
    asset,
    value,
    contract,
    blockNum: `0x${(100 - i).toString(16)}`,
    timestamp: `2025-02-${String(10 + i).padStart(2, '0')}T00:00:00Z`,
    uniqueId: `u${i}`,
  };
}

const rows = [
  tx(1, CP, ME, 'USDC', '5000', '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48'),
  tx(2, ME, SANCTIONED, 'USDC', '4000', '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48'),
  tx(3, CP, ME, 'ЕТН', '900', '0xdead000000000000000000000000000000000000'),
];

function setup() {
  const { env } = makeTestEnv();
  env.ALCHEMY_API_KEY = 'test';
  const client = {
    getTransfers: async () => ({ transfers: rows }),
    getNativeBalance: async () => '0x0',
    getTokenBalances: async () => [],
  };
  const noPrices = (async () => new Response('', { status: 500 })) as unknown as typeof fetch;
  return { env, client, noPrices };
}

describe('node summary facts', () => {
  test('labels, coverage, value, counterparties, spoofs', async () => {
    const { env, client, noPrices } = setup();
    const b = await buildFacts(env, client, 'ethereum', ME, noPrices);
    const text = b.facts.map((f) => f.text).join('\n');
    expect(text).toContain(`${ME} is on the exploit attacker`);
    expect(text).toContain('Across its 3 transfers between 2025-02-11 and 2025-02-13');
    expect(text).toContain('received 2 and sent 1');
    // Without prices only stablecoins count, so the figure is a lower bound.
    expect(text).toContain('>$5K in and >$4K out');
    expect(text).toContain(`Counterparty ${SANCTIONED} (0 in, 1 out) is on the OFAC SDN`);
    expect(text).toContain('spoof token "ЕТН", which imitates ETH');
    expect(b.facts.map((f) => f.id)).toEqual(b.facts.map((_, i) => `S${i + 1}`));
  });
});

describe('summarise', () => {
  const model = (text: string | Error): { adapter: ModelAdapter; cfg: never } => ({
    adapter: {
      kind: 'chat',
      async run() {
        if (text instanceof Error) throw text;
        return {
          text,
          toolCalls: [],
          citations: [],
          usage: { input: 0, output: 0 },
          message: { role: 'assistant', text, toolCalls: [] },
        };
      },
    },
    cfg: { baseUrl: 'https://x.test', model: 'fake', key: 'k' } as never,
  });

  test('keeps verified sentences, drops the rest', async () => {
    const { env, client, noPrices } = setup();
    const s = await summarise({
      env,
      client,
      chain: 'ethereum',
      address: ME,
      fetch: noPrices,
      model: model('It received 2 and sent 1 across 3 transfers [S2]. It moved 9,999 USDC [S2].'),
    });
    expect(s.text).toBe('It received 2 and sent 1 across 3 transfers [S2].');
    expect(s.sources.map((x) => x.id)).toEqual(['S2']);
    expect(s.model).toBe('fake');
  });

  test('facts stand alone when the model fails', async () => {
    const { env, client, noPrices } = setup();
    let facts = 0;
    const s = await summarise({
      env,
      client,
      chain: 'ethereum',
      address: ME,
      fetch: noPrices,
      model: model(new Error('down')),
      onFacts: (f) => (facts = f.length),
    });
    expect(s.text).toBe('');
    expect(s.model).toBeNull();
    expect(s.facts.length).toBe(facts);
  });
});
