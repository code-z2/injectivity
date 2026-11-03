// Chain tools over the configured RPC (Alchemy or the visitor's own).
import { hasLiveRpc, type Transfer } from '@/alchemy';
import { chainBase } from '@/constants/chains';
import { cachedTransfers, storeTransfers } from '@/stores/transfers';
import { traceFunds } from '@/stores/trace';
import { addr, short, str, type Tool, type ToolContext, ToolError, type ToolItem } from './types';

const ROWS_SHOWN = 50;
const TRANSFER_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';

const CHAIN_ID: Record<string, number> = {
  ethereum: 1,
  bsc: 56,
  arbitrum: 42161,
  base: 8453,
  polygon: 137,
  optimism: 10,
};

function chainArg(ctx: ToolContext, v: unknown): string {
  const chain = typeof v === 'string' && v ? v.toLowerCase() : (ctx.workspace?.chain ?? 'ethereum');
  if (!chainBase(chain)) throw new ToolError(`unsupported chain: ${chain}`);
  return chain;
}

async function rpc(ctx: ToolContext, chain: string, method: string, params: unknown[]) {
  if (!ctx.client.call || !hasLiveRpc(ctx.env, chain))
    throw new ToolError('no live RPC for this chain');
  return ctx.client.call(ctx.env, chain, method, params);
}

const CHAIN_PARAM = {
  type: 'string',
  description: 'ethereum | bsc | arbitrum | base | polygon | optimism (default: the trace chain)',
};

export const getTransfers: Tool = {
  spec: {
    name: 'get_transfers',
    description:
      "An address's transfers, newest first: native, ERC-20 and NFT, both directions unless narrowed. Includes per-token totals computed over the returned page.",
    parameters: {
      type: 'object',
      properties: {
        address: { type: 'string' },
        chain: CHAIN_PARAM,
        direction: { type: 'string', enum: ['in', 'out', 'both'] },
        cursor: { type: 'string', description: 'Next-page cursor from a previous call' },
      },
      required: ['address'],
    },
  },
  async run(ctx, args) {
    const address = addr(args.address);
    const chain = chainArg(ctx, args.chain);
    const direction = (['in', 'out', 'both'] as const).find((d) => d === args.direction) ?? 'both';
    let rows: Transfer[];
    let next: string | undefined;
    let live = false;
    if (hasLiveRpc(ctx.env, chain)) {
      const page = await ctx.client.getTransfers(
        ctx.env,
        chain,
        address,
        direction,
        typeof args.cursor === 'string' ? args.cursor : undefined,
      );
      rows = page.transfers;
      next = page.pageKey;
      live = true;
      void storeTransfers(ctx.env, chain, rows).catch(() => undefined);
    } else {
      rows = (await cachedTransfers(ctx.env, chain, address, direction)).rows;
    }
    const items: ToolItem[] = [];
    const totals = new Map<string, { asset: string; in: number; out: number; n: number }>();
    for (const t of rows) {
      const dir = t.from.toLowerCase() === address ? 'out' : 'in';
      const counterparty = (dir === 'out' ? t.to : t.from).toLowerCase();
      const token = t.contract ?? t.asset ?? '';
      const tot = totals.get(token) ?? { asset: t.asset || '?', in: 0, out: 0, n: 0 };
      const v = Number(t.value) || 0;
      if (dir === 'in') tot.in += v;
      else tot.out += v;
      tot.n++;
      totals.set(token, tot);
      if (items.length >= ROWS_SHOWN) continue;
      const line = `${t.timestamp ?? `block ${parseInt(t.blockNum, 16)}`}: ${dir === 'out' ? 'sent' : 'received'} ${t.value || '?'} ${t.asset || '?'}${t.contract ? ` (${t.contract})` : ''} ${dir === 'out' ? 'to' : 'from'} ${counterparty}, tx ${t.hash}`;
      items.push({
        src: {
          kind: 'tx',
          ref: t.uniqueId ?? t.hash,
          chain,
          title: `Transfer ${short(t.hash)}`,
          excerpt: line,
          url: explorerTx(chain, t.hash),
        },
        data: {
          hash: t.hash,
          time: t.timestamp,
          dir,
          counterparty,
          asset: t.asset,
          contract: t.contract ?? null,
          value: t.value,
        },
      });
    }
    const totalLines = [...totals.values()].map(
      (x) => `${x.asset}: in ${round(x.in)}, out ${round(x.out)} (${x.n} transfers)`,
    );
    if (rows.length)
      items.push({
        src: {
          kind: 'computed',
          ref: `totals:${chain}:${address}:${direction}:${rows[0]!.hash}:${rows.length}`,
          chain,
          title: `Totals over ${rows.length} transfers of ${short(address)}`,
          excerpt: `Over ${rows.length} transfers (${direction}) of ${address}: ${totalLines.join('; ')}`,
        },
        data: { transfers: rows.length, perToken: totalLines },
      });
    return {
      items,
      note: [
        live ? 'live' : 'from cache (no live RPC)',
        rows.length > ROWS_SHOWN ? `rows shown: ${ROWS_SHOWN} of ${rows.length}` : '',
        next ? `more pages: pass cursor "${next}"` : 'no more pages',
      ]
        .filter(Boolean)
        .join('; '),
    };
  },
};

export const getTransaction: Tool = {
  spec: {
    name: 'get_transaction',
    description:
      'One transaction: sender, recipient, value, method selector, status, block time, and every ERC-20 transfer it emitted.',
    parameters: {
      type: 'object',
      properties: { hash: { type: 'string' }, chain: CHAIN_PARAM },
      required: ['hash'],
    },
  },
  async run(ctx, args) {
    const hash = str(args.hash, 'hash').toLowerCase();
    if (!/^0x[0-9a-f]{64}$/.test(hash)) throw new ToolError('hash must be a 0x tx hash');
    const chain = chainArg(ctx, args.chain);
    const [tx, receipt] = (await Promise.all([
      rpc(ctx, chain, 'eth_getTransactionByHash', [hash]),
      rpc(ctx, chain, 'eth_getTransactionReceipt', [hash]),
    ])) as [
      Record<string, string> | null,
      { status?: string; logs?: Log[]; gasUsed?: string } | null,
    ];
    if (!tx) throw new ToolError('transaction not found');
    const block = (await rpc(ctx, chain, 'eth_getBlockByNumber', [tx.blockNumber, false])) as {
      timestamp?: string;
    } | null;
    const time = block?.timestamp
      ? new Date(parseInt(block.timestamp, 16) * 1000).toISOString()
      : undefined;
    const valueEth = Number(BigInt(tx.value ?? '0x0')) / 1e18;
    const selector = tx.input && tx.input.length >= 10 ? tx.input.slice(0, 10) : null;
    const status = receipt?.status === '0x1' ? 'success' : receipt?.status ? 'reverted' : 'pending';
    const head = `Tx ${hash} on ${chain}${time ? ` at ${time}` : ''}: from ${tx.from} to ${tx.to ?? '(contract creation)'}, value ${valueEth} native, ${selector ? `method ${selector}, ` : ''}${status}`;
    const items: ToolItem[] = [
      {
        src: {
          kind: 'tx',
          ref: hash,
          chain,
          title: `Transaction ${short(hash)}`,
          excerpt: head,
          url: explorerTx(chain, hash),
        },
        data: { hash, time, from: tx.from, to: tx.to, valueNative: valueEth, selector, status },
      },
    ];
    const logs = (receipt?.logs ?? []).filter(
      (l) => l.topics?.[0] === TRANSFER_TOPIC && l.topics.length === 3,
    );
    const meta = await tokenMeta(
      ctx,
      chain,
      [...new Set(logs.map((l) => l.address.toLowerCase()))].slice(0, 8),
    );
    for (const [i, l] of logs.slice(0, 40).entries()) {
      const token = l.address.toLowerCase();
      const m = meta.get(token);
      const from = `0x${l.topics[1]!.slice(26)}`;
      const to = `0x${l.topics[2]!.slice(26)}`;
      const raw = BigInt(l.data && l.data !== '0x' ? l.data : '0x0');
      const amount = m?.decimals !== undefined ? Number(raw) / 10 ** m.decimals : null;
      const excerpt = `In tx ${hash}: ${amount ?? raw.toString()} ${m?.symbol ?? token} (${token}) from ${from} to ${to}`;
      items.push({
        src: {
          kind: 'tx',
          ref: `${hash}:log:${parseInt(l.logIndex ?? `0x${i.toString(16)}`, 16)}`,
          chain,
          title: `Token transfer in ${short(hash)}`,
          excerpt,
          url: explorerTx(chain, hash),
        },
        data: { token, symbol: m?.symbol ?? null, from, to, amount: amount ?? raw.toString() },
      });
    }
    return {
      items,
      note: logs.length > 40 ? `token transfers shown: 40 of ${logs.length}` : undefined,
    };
  },
};

interface Log {
  address: string;
  topics: string[];
  data: string;
  logIndex?: string;
}

async function tokenMeta(ctx: ToolContext, chain: string, tokens: string[]) {
  const out = new Map<string, { symbol?: string; decimals?: number; name?: string }>();
  await Promise.all(
    tokens.map(async (t) => {
      try {
        const m = (await rpc(ctx, chain, 'alchemy_getTokenMetadata', [t])) as {
          symbol?: string;
          decimals?: number | null;
          name?: string;
        };
        out.set(t, { symbol: m.symbol, decimals: m.decimals ?? undefined, name: m.name });
      } catch {
        // Unknown token: shown by contract.
      }
    }),
  );
  return out;
}

export const getBalances: Tool = {
  spec: {
    name: 'get_balances',
    description:
      "An address's current native and ERC-20 balances (largest 15 tokens with metadata).",
    parameters: {
      type: 'object',
      properties: { address: { type: 'string' }, chain: CHAIN_PARAM },
      required: ['address'],
    },
  },
  async run(ctx, args) {
    const address = addr(args.address);
    const chain = chainArg(ctx, args.chain);
    if (!hasLiveRpc(ctx.env, chain)) throw new ToolError('no live RPC for this chain');
    const [native, tokens] = await Promise.all([
      ctx.client.getNativeBalance(ctx.env, chain, address),
      ctx.client.getTokenBalances(ctx.env, chain, address),
    ]);
    const at = new Date().toISOString();
    const nativeAmt = Number(BigInt(native || '0x0')) / 1e18;
    const items: ToolItem[] = [
      {
        src: {
          kind: 'chain_state',
          ref: `balance:${address}`,
          chain,
          title: `Native balance of ${short(address)}`,
          excerpt: `${address} held ${nativeAmt} native at ${at}`,
        },
        data: { native: nativeAmt },
      },
    ];
    const top = tokens.slice(0, 15);
    const meta = await tokenMeta(
      ctx,
      chain,
      top.map((t) => t.contractAddress.toLowerCase()),
    );
    for (const t of top) {
      const c = t.contractAddress.toLowerCase();
      const m = meta.get(c);
      const raw = BigInt(t.tokenBalance);
      const amount = m?.decimals !== undefined ? Number(raw) / 10 ** m.decimals : raw.toString();
      items.push({
        src: {
          kind: 'chain_state',
          ref: `balance:${address}:${c}`,
          chain,
          title: `${m?.symbol ?? c} balance of ${short(address)}`,
          excerpt: `${address} held ${amount} ${m?.symbol ?? c} (${c}) at ${at}`,
        },
        data: { token: c, symbol: m?.symbol ?? null, amount },
      });
    }
    return { items, note: tokens.length > 15 ? `tokens shown: 15 of ${tokens.length}` : undefined };
  },
};

export const getContract: Tool = {
  spec: {
    name: 'get_contract',
    description:
      'Whether an address is a contract, and if verified on Sourcify: its name, compiler and function names.',
    parameters: {
      type: 'object',
      properties: { address: { type: 'string' }, chain: CHAIN_PARAM },
      required: ['address'],
    },
  },
  async run(ctx, args) {
    const address = addr(args.address);
    const chain = chainArg(ctx, args.chain);
    const code = (await rpc(ctx, chain, 'eth_getCode', [address, 'latest'])) as string;
    const bytes = code && code !== '0x' ? (code.length - 2) / 2 : 0;
    const items: ToolItem[] = [
      {
        src: {
          kind: 'chain_state',
          ref: `code:${address}`,
          chain,
          title: `Code at ${short(address)}`,
          excerpt: bytes
            ? `${address} is a contract (${bytes} bytes of code)`
            : `${address} has no code (an externally owned account, or a self-destructed contract)`,
        },
        data: { isContract: bytes > 0, codeBytes: bytes },
      },
    ];
    if (bytes && CHAIN_ID[chain]) {
      try {
        const res = await ctx.fetch(
          `https://sourcify.dev/server/v2/contract/${CHAIN_ID[chain]}/${address}?fields=abi,compilation`,
          { signal: AbortSignal.timeout(10_000) },
        );
        if (res.ok) {
          const body = (await res.json()) as {
            match?: string;
            abi?: { type: string; name?: string }[];
            compilation?: { name?: string; compilerVersion?: string };
          };
          const fns = (body.abi ?? [])
            .filter((x) => x.type === 'function' && x.name)
            .map((x) => x.name!);
          const name = body.compilation?.name ?? 'unknown';
          items.push({
            src: {
              kind: 'contract',
              ref: `sourcify:${chain}:${address}`,
              chain,
              title: `${name} (verified)`,
              excerpt: `${address} is verified on Sourcify (${body.match ?? 'match'}) as ${name}, compiler ${body.compilation?.compilerVersion ?? '?'}; functions: ${fns.slice(0, 40).join(', ')}`,
              url: `https://sourcify.dev/#/lookup/${address}`,
            },
            data: { name, functions: fns.slice(0, 40), match: body.match },
          });
        }
      } catch {
        // Unverified or Sourcify unreachable: code facts only.
      }
    }
    return { items };
  },
};

export const traceFundsTool: Tool = {
  spec: {
    name: 'trace_funds',
    description:
      'Follow funds from an address up to 2 hops, keeping the largest transfers per address. Returns the edges and the paths found.',
    parameters: {
      type: 'object',
      properties: {
        address: { type: 'string' },
        chain: CHAIN_PARAM,
        direction: { type: 'string', enum: ['in', 'out', 'both'] },
        depth: { type: 'integer', minimum: 1, maximum: 2 },
      },
      required: ['address'],
    },
  },
  async run(ctx, args) {
    const address = addr(args.address);
    const chain = chainArg(ctx, args.chain);
    const direction = (['in', 'out', 'both'] as const).find((d) => d === args.direction) ?? 'out';
    const depth = args.depth === 1 ? 1 : 2;
    const traced = await traceFunds(ctx.env, ctx.client, chain, address, {
      direction,
      depth,
      fanout: 15,
    });
    const edges = [...traced.result.edges]
      .sort((a, b) => Number(b.value) - Number(a.value))
      .slice(0, 40);
    const items: ToolItem[] = edges.map((e) => ({
      src: {
        kind: 'tx',
        ref: e.hash,
        chain,
        title: `Hop ${e.hop} ${short(e.hash)}`,
        excerpt: `Hop ${e.hop}: ${e.value} ${e.asset} from ${e.from} to ${e.to}, tx ${e.hash} (block ${e.blockNumber})`,
        url: explorerTx(chain, e.hash),
      },
      data: { hop: e.hop, from: e.from, to: e.to, asset: e.asset, value: e.value, hash: e.hash },
    }));
    const paths = (direction === 'in' ? traced.result.pathsIn : traced.result.pathsOut).slice(
      0,
      15,
    );
    return {
      items: [...items, { src: null, data: { paths } }],
      note: [
        `${traced.result.edges.length} edges found, ${edges.length} largest shown`,
        traced.empty ? 'no data: no cache and no live RPC' : '',
        traced.result.truncatedNodes.length
          ? `${traced.result.truncatedNodes.length} addresses had more counterparties than followed`
          : '',
      ]
        .filter(Boolean)
        .join('; '),
    };
  },
};

const EXPLORER: Record<string, string> = {
  ethereum: 'https://etherscan.io',
  bsc: 'https://bscscan.com',
  arbitrum: 'https://arbiscan.io',
  base: 'https://basescan.org',
  polygon: 'https://polygonscan.com',
  optimism: 'https://optimistic.etherscan.io',
};
export const explorerTx = (chain: string, hash: string) =>
  `${EXPLORER[chain] ?? EXPLORER.ethereum}/tx/${hash}`;
export const explorerAddress = (chain: string, a: string) =>
  `${EXPLORER[chain] ?? EXPLORER.ethereum}/address/${a}`;

const round = (n: number) =>
  Math.abs(n) >= 1 ? Math.round(n * 100) / 100 : Number(n.toPrecision(4));
