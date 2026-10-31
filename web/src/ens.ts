import { createPublicClient, http } from "viem";
import { mainnet } from "viem/chains";
import { normalize } from "viem/ens";

// ENS resolves on mainnet regardless of the investigated chain.
// cloudflare-eth.com is deprecated (resolver reverts); publicnode is the
// default, override with VITE_ENS_RPC_URL. Generous timeout: resolution
// fans out to several calls and slow networks otherwise trip viem's default.
const ENS_RPC_URL =
  import.meta.env.VITE_ENS_RPC_URL ?? "https://ethereum.publicnode.com";

const client = createPublicClient({
  chain: mainnet,
  transport: http(ENS_RPC_URL, { timeout: 30_000 }),
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
