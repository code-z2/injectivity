// Chain -> block explorer link builders. One map, no per-component URLs.
const EXPLORERS: Record<string, string> = {
  ethereum: "https://etherscan.io",
  base: "https://basescan.org",
  bsc: "https://bscscan.com",
  polygon: "https://polygonscan.com",
  arbitrum: "https://arbiscan.io",
  optimism: "https://optimistic.etherscan.io",
};

export function explorerBase(chain: string): string {
  return EXPLORERS[chain] ?? EXPLORERS["ethereum"];
}

export function addressUrl(chain: string, address: string): string {
  return `${explorerBase(chain)}/address/${address}`;
}

export function txUrl(chain: string, hash: string): string {
  return `${explorerBase(chain)}/tx/${hash}`;
}
