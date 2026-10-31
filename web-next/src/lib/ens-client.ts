// Static viem imports (tree-shaken), loaded lazily by ens.ts.
import { createPublicClient, http } from "viem";
import { mainnet } from "viem/chains";
import { normalize } from "viem/ens";

export async function getEnsAddress(
  rpc: string,
  name: string,
): Promise<string | null> {
  const client = createPublicClient({
    chain: mainnet,
    transport: http(rpc, { timeout: 30_000 }),
  });
  return client.getEnsAddress({ name: normalize(name) });
}
