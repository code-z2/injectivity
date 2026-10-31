import { createPublicClient, http } from "viem";
import { mainnet } from "viem/chains";
import { normalize } from "viem/ens";

// ENS resolves on mainnet regardless of the investigated chain.
const client = createPublicClient({
  chain: mainnet,
  transport: http("https://cloudflare-eth.com"),
});

export function looksLikeEns(input: string): boolean {
  const v = input.trim();
  return !/^0x[0-9a-fA-F]{40}$/.test(v) && v.includes(".");
}

export async function resolveEns(name: string): Promise<string> {
  const addr = await client.getEnsAddress({ name: normalize(name.trim()) });
  if (!addr) throw new Error("ens-unresolved");
  return addr;
}
