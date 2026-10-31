// Chain -> Alchemy HTTPS base. Chains not listed here are rejected (400).
export const CHAIN_BASE: Record<string, string> = {
  ethereum: 'https://eth-mainnet.g.alchemy.com',
  bsc: 'https://bnb-mainnet.g.alchemy.com',
  arbitrum: 'https://arb-mainnet.g.alchemy.com',
  base: 'https://base-mainnet.g.alchemy.com',
  polygon: 'https://polygon-mainnet.g.alchemy.com',
  optimism: 'https://opt-mainnet.g.alchemy.com',
};

export function chainBase(chain: string): string | null {
  return CHAIN_BASE[chain] ?? null;
}
