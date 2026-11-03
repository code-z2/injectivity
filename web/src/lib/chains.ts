import type { Chain } from "./api";

// Display metadata per supported chain. `dot` is the chain's own identity
// color, used only as a small marker next to its name.
export const CHAIN_META: Record<Chain, { label: string; dot: string }> = {
  ethereum: { label: "Ethereum", dot: "#627eea" },
  base: { label: "Base", dot: "#0052ff" },
  bsc: { label: "BNB Chain", dot: "#f0b90b" },
  polygon: { label: "Polygon", dot: "#8247e5" },
  arbitrum: { label: "Arbitrum", dot: "#28a0f0" },
  optimism: { label: "Optimism", dot: "#ff0420" },
};
