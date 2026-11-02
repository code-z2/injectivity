// Agent core: ledger, verifier, tool registry and the research loop with a
// scripted model (no network).
import { describe, expect, test } from 'bun:test';
import { citedIds, Ledger } from '@/agent/ledger';
import { runResearch } from '@/agent/loop';
import { Registry } from '@/agent/tools/registry';
import type { Tool } from '@/agent/tools/types';
import { close, figuresIn, splitSentences, verifyText } from '@/agent/verify';
import type { ModelAdapter, ModelTurn } from '@/llm/adapters';

const A = '0xa4b2fd68593b6f34e51cb9edb66e71c1b4ab449e';
const H = '0x21d714ef63ce1197535edcafee9ab2281d1345225aa70e6a2fcb29f828fd3d10';

function ledger() {
  const l = new Ledger();
  l.add({
    kind: 'tx',
    ref: H,
    chain: 'ethereum',
    title: 'tx',
    excerpt: `sent 10000 stETH from ${A} to 0x6bb000067005450704003100632eb93ea00c0000, tx ${H}`,
  });
  l.add({
    kind: 'dataset',
    ref: 'exploits/bybit',
    title: 'Bybit',
    excerpt: 'Bybit was exploited on 2025-02-21; loss $1,400,000,000',
  });
  l.add({
    kind: 'web',
    ref: 'https://news.test/a',
    title: 'News',
    excerpt: 'News',
    url: 'https://news.test/a',
  });
  return l;
}

describe('ledger', () => {
  test('dedupes identical sources and parses citation markers', () => {
    const l = ledger();
    expect(
      l.add({
        kind: 'dataset',
        ref: 'exploits/bybit',
        title: 'Bybit',
        excerpt: 'Bybit was exploited on 2025-02-21; loss $1,400,000,000',
      }),
    ).toBe('S2');
    expect(l.size).toBe(3);
    expect(citedIds('a [S1] b [S2, S3] c [S1]')).toEqual(['S1', 'S2', 'S3', 'S1']);
  });
});

describe('figures', () => {
  test('reads amounts, skips years, dates, small numbers and ids', () => {
    expect(figuresIn('lost $1.4 billion in 2025 across 3 txs').map((f) => f.value)).toEqual([
      1.4e9,
    ]);
    expect(figuresIn('10,000 stETH on 2025-02-21 [S12]').map((f) => f.value)).toEqual([10000]);
    expect(figuresIn(`moved 9,980 ETH via ${A}`).map((f) => f.value)).toEqual([9980]);
    expect(
      figuresIn('on 21 February 2025 at 14:13 UTC, then Feb 22, 2025, it sent 401,000 ETH').map(
        (f) => f.value,
      ),
    ).toEqual([401000]);
  });
  test('rounding tolerance follows the precision written', () => {
    const [src] = figuresIn('$1,460,000,000');
    expect(close(figuresIn('$1.5 billion')[0]!, src!)).toBe(true);
    expect(close(figuresIn('$1.52 billion')[0]!, src!)).toBe(false);
    expect(close(figuresIn('$1.46 billion')[0]!, src!)).toBe(true);
  });
});

describe('verifier', () => {
  test('keeps cited, matching sentences', () => {
    const v = verifyText(
      `The exploiter sent 10,000 stETH to ParaSwap's executor in ${H} [S1]. Bybit lost $1.4 billion [S2].`,
      ledger(),
    );
    expect(v.removed).toEqual([]);
    expect(v.used.map((s) => s.id)).toEqual(['S1', 'S2']);
  });

  test('removes uncited figures, wrong figures, unknown ids and foreign addresses', () => {
    const v = verifyText(
      [
        'Bybit lost $2 billion [S2].',
        'It moved 5,000 ETH.',
        'See also [S9] for 4,000 ETH.',
        `Funds reached 0x${'1'.repeat(40)} [S1].`,
        'The attacker acted fast.',
      ].join(' '),
      ledger(),
    );
    expect(v.text).toBe('The attacker acted fast.');
    expect(v.removed.map((r) => r.reason)).toEqual([
      '$2 billion does not match the cited sources',
      'states figures or addresses without a source',
      'cites a source that does not exist',
      `0x11111111… is not in the cited sources`,
    ]);
  });

  test('rejects mistyped addresses even when a prefix matches', () => {
    const v = verifyText(`It came from ${A}2 [S1].`, ledger());
    expect(v.removed[0]!.reason).toBe('0xa4b2fd68… is not a valid address or hash');
  });

  test('resolves web URL citations to search results it actually received', () => {
    const l = ledger();
    const v = verifyText(
      'Coverage was widespread [https://news.test/a]. Others agreed [https://other.test/x].',
      l,
    );
    expect(v.text).toBe('Coverage was widespread [S3].');
    expect(v.removed[0]!.reason).toBe('cites a web page the search did not return');
  });

  test('keeps list markers and headings, checks short address forms', () => {
    const v = verifyText(
      `## Flow\n- 10,000 stETH left 0xa4b2…449e [S1].\n- 10,000 stETH left 0xdead…beef [S1].`,
      ledger(),
    );
    expect(v.text).toBe('## Flow\n- 10,000 stETH left 0xa4b2…449e [S1].');
  });

  test('citations on their own line attach to the sentence above', () => {
    const v = verifyText(
      'Bybit lost $1.4 billion.\n[S2]\nIt moved 10,000 stETH.\n[S1][S2]',
      ledger(),
    );
    expect(v.text).toBe('Bybit lost $1.4 billion. [S2]\nIt moved 10,000 stETH. [S1][S2]');
    expect(v.removed).toEqual([]);
  });

  test('sentence split respects abbreviations', () => {
    expect(splitSentences('Bridges, e.g. Stargate, were used. Then it stopped.')).toEqual([
      'Bridges, e.g. Stargate, were used.',
      'Then it stopped.',
    ]);
    expect(splitSentences('Tokens were ЕТН... (spoof) and USDC. Done.')).toEqual([
      'Tokens were ЕТН... (spoof) and USDC.',
      'Done.',
    ]);
  });
});

const echoTool: Tool = {
  spec: { name: 'echo', description: 'test', parameters: { type: 'object', properties: {} } },
  async run() {
    return {
      items: [
        {
          src: { kind: 'tx', ref: H, title: 'tx', excerpt: `sent 42,000 USDC, tx ${H}` },
          data: { v: 42000 },
        },
      ],
      note: 'one row',
    };
  },
};

describe('registry and loop', () => {
  test('registry tags items with source ids and reports errors as text', async () => {
    const l = new Ledger();
    const reg = new Registry([echoTool]);
    const ok = await reg.run({ id: 'c', name: 'echo', args: {} }, {} as never, l);
    expect(JSON.parse(ok.result)).toEqual({ items: [{ src: 'S1', v: 42000 }], note: 'one row' });
    const bad = await reg.run({ id: 'c', name: 'nope', args: {} }, {} as never, l);
    expect(bad.ok).toBe(false);
  });

  test('loop runs tools, then verifies the answer', async () => {
    const script: Partial<ModelTurn>[] = [
      { toolCalls: [{ id: 't1', name: 'echo', args: {} }] },
      {
        text: 'It sent 42,000 USDC [S1]. It also sent 99,000 DAI [S1].',
        citations: [{ url: 'https://w.test', title: 'W' }],
      },
    ];
    let n = 0;
    const adapter: ModelAdapter = {
      kind: 'chat',
      async run() {
        const s = script[n++]!;
        const turn = {
          text: '',
          toolCalls: [],
          citations: [],
          usage: { input: 1, output: 1 },
          ...s,
        };
        return {
          ...turn,
          message: { role: 'assistant', text: turn.text, toolCalls: turn.toolCalls },
        } as ModelTurn;
      },
    };
    const l = new Ledger();
    const events: string[] = [];
    const r = await runResearch({
      adapter,
      cfg: { baseUrl: 'https://x.test', model: 'm', key: 'k' },
      search: true,
      system: 's',
      messages: [{ role: 'user', text: 'q' }],
      registry: new Registry([echoTool]),
      ctx: {} as never,
      ledger: l,
      onEvent: (e) => events.push(e.type),
    });
    expect(r.text).toBe('It sent 42,000 USDC [S1].');
    expect(r.removed.length).toBe(1);
    expect(r.toolCalls).toBe(1);
    expect(l.all().map((s) => s.kind)).toEqual(['tx', 'web']);
    expect(events).toEqual(['thinking', 'tool', 'tool_done', 'thinking', 'search']);
    expect(r.messages.map((m) => m.role)).toEqual(['user', 'assistant', 'tool', 'assistant']);
  });

  test('budget exhaustion forces a final answer without tools', async () => {
    let calls = 0;
    const adapter: ModelAdapter = {
      kind: 'chat',
      async run(_cfg, req) {
        calls++;
        const toolCalls = req.tools ? [{ id: `t${calls}`, name: 'echo', args: {} }] : [];
        const text = req.tools ? '' : 'Partial answer.';
        return {
          text,
          toolCalls,
          citations: [],
          usage: { input: 0, output: 0 },
          message: { role: 'assistant', text, toolCalls },
        };
      },
    };
    const r = await runResearch({
      adapter,
      cfg: { baseUrl: 'https://x.test', model: 'm', key: 'k' },
      search: false,
      system: 's',
      messages: [{ role: 'user', text: 'q' }],
      registry: new Registry([echoTool]),
      ctx: {} as never,
      ledger: new Ledger(),
      budget: { toolCalls: 2, ms: 60_000 },
    });
    expect(r.budgetHit).toBe(true);
    expect(r.toolCalls).toBe(2);
    expect(r.text).toBe('Partial answer.');
  });
});
