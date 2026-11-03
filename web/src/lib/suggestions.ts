import type { Chain } from "./api";

// Starting points on the landing: attacker wallets from known exploits,
// picked by loss from data/seeds/exploits.json (ids noted). Kept as a
// short static list so the landing doesn't ship the whole dataset.
export interface Suggestion {
  label: string;
  address: string;
  chain: Chain;
  seedId: string;
}

export const SUGGESTIONS: Suggestion[] = [
  {
    label: "Bybit exploiter",
    address: "0xa4b2fd68593b6f34e51cb9edb66e71c1b4ab449e",
    chain: "ethereum",
    seedId: "Bybit 2025-02-21",
  },
  {
    label: "WazirX exploiter",
    address: "0x6eedf92fb92dd68a270c3205e96dccc527728066",
    chain: "ethereum",
    seedId: "WazirX 2024-07-18",
  },
  {
    label: "Balancer V2 exploiter",
    address: "0x506d1f9efe24f0d47853adca907eb8d89ae03207",
    chain: "ethereum",
    seedId: "Balancer V2 2025-11-03",
  },
  {
    label: "GMX V1 exploiter",
    address: "0xdf3340a436c27655ba62f8281565c9925c3a5221",
    chain: "arbitrum",
    seedId: "GMX V1 EVM 2025-07-09",
  },
  {
    label: "Wasabi Perps exploiter",
    address: "0x02228b0afcdbEdf8180D96Fc181Da3AF5DD1d1ab",
    chain: "base",
    seedId: "Wasabi Perps 2026-04-30",
  },
];
