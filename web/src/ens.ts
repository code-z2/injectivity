import { createPublicClient, http } from "viem";
import { mainnet } from "viem/chains";
import { normalize } from "viem/ens";
import { loadSettings } from "./settings";

// ENS resolves on mainnet regardless of the investigated chain.
// cloudflare-eth.com is deprecated (resolver reverts); publicnode is the
// default. The Settings-menu custom RPC wins over the build-time
// VITE_ENS_RPC_URL, which wins over publicnode. Generous timeout:
// resolution fans out to several calls and slow networks otherwise trip
// viem's default.
function rpcUrl(): string {
  const custom = loadSettings().ensRpcUrl.trim();
  if (custom) return custom;
  return import.meta.env.VITE_ENS_RPC_URL ?? "https://ethereum.publicnode.com";
}

function client() {
  return createPublicClient({
    chain: mainnet,
    transport: http(rpcUrl(), { timeout: 30_000 }),
  });
}

export function looksLikeEns(input: string): boolean {
  const v = input.trim();
  return !/^0x[0-9a-fA-F]{40}$/.test(v) && v.includes(".");
}

export async function resolveEns(name: string): Promise<string> {
  const addr = await client().getEnsAddress({ name: normalize(name.trim()) });
  if (!addr) throw new Error("ens-unresolved");
  return addr;
}
