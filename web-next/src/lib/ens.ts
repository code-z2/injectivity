import { loadSettings } from "./settings";
import { ADDRESS_RE } from "./utils";

// ENS resolves on mainnet regardless of the investigated chain.
// cloudflare-eth.com is deprecated (resolver reverts); publicnode is the
// default. The Settings custom RPC wins over the build-time
// VITE_ENS_RPC_URL, which wins over publicnode. Generous timeout:
// resolution fans out to several calls and slow networks otherwise trip
// viem's default. viem loads on first resolution only, keeping it out of
// the landing bundle.
function rpcUrl(): string {
  const custom = loadSettings().ensRpcUrl.trim();
  if (custom) return custom;
  return import.meta.env.VITE_ENS_RPC_URL ?? "https://ethereum.publicnode.com";
}

export function looksLikeEns(input: string): boolean {
  const v = input.trim();
  return !ADDRESS_RE.test(v) && v.includes(".");
}

export async function resolveEns(name: string): Promise<string> {
  const { getEnsAddress } = await import("./ens-client");
  const addr = await getEnsAddress(rpcUrl(), name.trim());
  if (!addr) throw new Error("ens-unresolved");
  return addr;
}
