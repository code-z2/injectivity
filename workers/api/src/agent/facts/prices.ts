// Mirror of web-next/src/lib/prices.ts without the React hook (keep the
// token lists in sync): values flows over a short list of liquid tokens
// priced from DefiLlama; anything uncounted makes the figure a lower bound.

const NATIVE_PRICE: Record<string, string> = {
  ethereum: 'coingecko:ethereum',
  arbitrum: 'coingecko:ethereum',
  base: 'coingecko:ethereum',
  optimism: 'coingecko:ethereum',
  bsc: 'coingecko:binancecoin',
  polygon: 'coingecko:polygon-ecosystem-token',
};
const NATIVE_SYMBOL: Record<string, string> = {
  ethereum: 'ETH',
  arbitrum: 'ETH',
  base: 'ETH',
  optimism: 'ETH',
  bsc: 'BNB',
  polygon: 'POL',
};

// Counted tokens per chain (lowercase contract → symbol). Stablecoins are
// flagged so the fallback can still count them without prices.
const COUNTED: Record<string, Record<string, { symbol: string; stable?: true }>> = {
  ethereum: {
    '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2': { symbol: 'WETH' },
    '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48': {
      symbol: 'USDC',
      stable: true,
    },
    '0xdac17f958d2ee523a2206206994597c13d831ec7': {
      symbol: 'USDT',
      stable: true,
    },
    '0x6b175474e89094c44da98b954eedeac495271d0f': { symbol: 'DAI' },
    '0x2260fac5e5542a773aa44fbcfedf7c193bc2c599': { symbol: 'WBTC' },
    '0xae7ab96520de3a18e5e111b5eaab095312d7fe84': { symbol: 'stETH' },
  },
  arbitrum: {
    '0xaf88d065e77c8cc2239327c5edb3a432268e5831': {
      symbol: 'USDC',
      stable: true,
    },
    '0xfd086bc7cd5c481dcc9c85ebe478a1c0b69fcbb9': {
      symbol: 'USDT',
      stable: true,
    },
    '0x82af49447d8a07e3bd95bd0d56f35241523fbab1': { symbol: 'WETH' },
  },
  base: {
    '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913': {
      symbol: 'USDC',
      stable: true,
    },
    '0x4200000000000000000000000000000000000006': { symbol: 'WETH' },
  },
  optimism: {
    '0x0b2c639c533813f4aa9d7837caf62653d097ff85': {
      symbol: 'USDC',
      stable: true,
    },
    '0x94b008aa00579c1307b0ef2c499ad98a8ce58e58': {
      symbol: 'USDT',
      stable: true,
    },
    '0x4200000000000000000000000000000000000006': { symbol: 'WETH' },
  },
  polygon: {
    '0x3c499c542cef5e3811e1192ce70d8cc03d5c3359': {
      symbol: 'USDC',
      stable: true,
    },
    '0xc2132d05d31c914a87c6611c10748aeb04b58e8f': {
      symbol: 'USDT',
      stable: true,
    },
    '0x7ceb23fd6bc0add59e62ac25578270cff1b9f619': { symbol: 'WETH' },
  },
  bsc: {
    '0x55d398326f99059ff775485246999027b3197955': {
      symbol: 'USDT',
      stable: true,
    },
    '0x8ac76a51cc950d9822d68b83fe1ad97b32cd580d': {
      symbol: 'USDC',
      stable: true,
    },
    '0xbb4cdb9cbd36b01bd1cbaebf2de08d9173bc095c': { symbol: 'WBNB' },
  },
};

/** Token key → USD price; "native" for the chain's coin. null = fallback. */
export type Prices = Record<string, number> | null;

const cache = new Map<string, Promise<Prices>>();

export function loadPrices(chain: string, fetchImpl: typeof fetch = fetch): Promise<Prices> {
  const hit = cache.get(chain);
  if (hit) return hit;
  const tokens = Object.keys(COUNTED[chain] ?? {});
  const ids = [NATIVE_PRICE[chain] ?? 'coingecko:ethereum', ...tokens.map((t) => `${chain}:${t}`)];
  const p = fetchImpl(`https://coins.llama.fi/prices/current/${ids.join(',')}`)
    .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`prices-${r.status}`))))
    .then((raw) => {
      const body = raw as { coins: Record<string, { price: number }> };
      const out: Record<string, number> = {};
      const native = body.coins[ids[0]!]?.price;
      if (native) out.native = native;
      for (const t of tokens) {
        const price = body.coins[`${chain}:${t}`]?.price;
        if (price) out[t] = price;
      }
      return out;
    })
    .catch(() => {
      cache.delete(chain); // try again next time
      return null;
    });
  cache.set(chain, p);
  return p;
}

export interface TokenFlow {
  contract: string | null;
  asset: string;
  amount: number | null;
  category: string;
}

export interface Value {
  usd: number;
  /** Some flows weren't counted: usd is a lower bound. */
  partial: boolean;
}

export function valueOf(chain: string, flows: TokenFlow[], prices: Prices): Value {
  const counted = COUNTED[chain] ?? {};
  let usd = 0;
  let partial = false;
  for (const f of flows) {
    if (f.amount === null) {
      partial = true;
      continue;
    }
    const native =
      !f.contract &&
      (f.category === 'external' || f.category === 'internal') &&
      f.asset === (NATIVE_SYMBOL[chain] ?? 'ETH');
    const key = native ? 'native' : (f.contract?.toLowerCase() ?? '');
    const token = native ? undefined : counted[key];
    let price: number | undefined;
    if (prices) price = native || token ? prices[key] : undefined;
    else if (token?.stable) price = 1; // fallback: stablecoins at $1
    if (price === undefined) {
      partial = true;
      continue;
    }
    usd += f.amount * price;
  }
  return { usd, partial: partial || !prices };
}

const compact = new Intl.NumberFormat('en-US', {
  notation: 'compact',
  maximumFractionDigits: 1,
});

/** "$1.2M", or ">$1.2M" for a lower bound ("$0" / ">$0" when nothing counted). */
export function fmtValue(v: Value): string {
  if (v.usd < 1) return v.partial ? '>$0' : '$0';
  const s = v.usd < 1000 ? `$${Math.round(v.usd)}` : `$${compact.format(v.usd)}`;
  return v.partial ? `>${s}` : s;
}
