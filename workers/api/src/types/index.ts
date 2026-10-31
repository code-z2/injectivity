export interface Env {
  DB: D1Database;
  ALCHEMY_API_KEY?: string;
  DEFAULT_CHAIN?: string;
  CACHE_TTL_SECONDS?: string;
}

export interface AlchemyClient {
  getTransfers(
    env: Env,
    chain: string,
    address: string,
    direction: 'in' | 'out' | 'both',
    pageKey?: string,
    maxCount?: number,
  ): Promise<{ transfers: import('../alchemy').Transfer[]; pageKey?: string }>;
  getNativeBalance(env: Env, chain: string, address: string): Promise<string>;
  getTokenBalances(
    env: Env,
    chain: string,
    address: string,
  ): Promise<Array<{ contractAddress: string; tokenBalance: string }>>;
}

export interface CreateAppOptions {
  alchemy?: AlchemyClient;
}
