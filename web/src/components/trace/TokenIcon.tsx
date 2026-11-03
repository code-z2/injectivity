import { ArrowDownLeft, ArrowUpRight } from "lucide-react";
import { useState } from "react";
import { getAddress } from "viem";
import { tokenLogoUrl } from "@/lib/api";
import { cn } from "@/lib/utils";

// A transfer's token icon, tried in order: DefiLlama (any address case,
// resized for us), Trust Wallet assets (needs the checksummed address),
// then Alchemy's metadata logo via our API (a redirect, so it is just an
// image URL). If none has it, the direction arrow stands in. The native
// coin uses each source's chain icon. Resolved results are remembered for
// the session, so each token walks the fallbacks once.

const CHAIN_ID: Record<string, number> = {
  ethereum: 1,
  optimism: 10,
  bsc: 56,
  polygon: 137,
  base: 8453,
  arbitrum: 42161,
};
const TW_CHAIN: Record<string, string> = {
  ethereum: "ethereum",
  optimism: "optimism",
  bsc: "smartchain",
  polygon: "polygon",
  base: "base",
  arbitrum: "arbitrum",
};
const ZERO = "0x0000000000000000000000000000000000000000";
const TW = "https://cdn.jsdelivr.net/gh/trustwallet/assets@master/blockchains";

function candidates(chain: string, contract: string | null): string[] {
  const id = CHAIN_ID[chain] ?? 1;
  const tw = TW_CHAIN[chain] ?? "ethereum";
  if (!contract) {
    return [
      `https://token-icons.llamao.fi/icons/tokens/${id}/${ZERO}?w=48&h=48`,
      `${TW}/${tw}/info/logo.png`,
    ];
  }
  let checksum = contract;
  try {
    checksum = getAddress(contract);
  } catch {
    // Not a valid address: DefiLlama and Alchemy still get a try.
  }
  return [
    `https://token-icons.llamao.fi/icons/tokens/${id}/${contract.toLowerCase()}?w=48&h=48`,
    `${TW}/${tw}/assets/${checksum}/logo.png`,
    tokenLogoUrl(chain, contract.toLowerCase()),
  ];
}

// chain:contract → index of the source that worked, or -1 for none.
const resolved = new Map<string, number>();

export function TokenIcon({
  chain,
  contract,
  direction,
  className,
}: {
  chain: string;
  contract: string | null | undefined;
  direction: "in" | "out";
  className?: string;
}) {
  const key = `${chain}:${contract ?? "native"}`;
  const urls = candidates(chain, contract ?? null);
  const [i, setI] = useState(() => resolved.get(key) ?? 0);

  if (i < 0 || i >= urls.length) {
    const Arrow = direction === "in" ? ArrowDownLeft : ArrowUpRight;
    return (
      <span
        className={cn(
          "flex items-center justify-center rounded-full bg-subtle text-ink-soft",
          className,
        )}
      >
        <Arrow className="size-3.5" />
      </span>
    );
  }
  return (
    <img
      src={urls[i]}
      alt=""
      loading="lazy"
      decoding="async"
      className={cn("rounded-full bg-subtle object-cover", className)}
      onLoad={() => resolved.set(key, i)}
      onError={() => {
        const next = i + 1 < urls.length ? i + 1 : -1;
        if (next < 0) resolved.set(key, -1);
        setI(next);
      }}
    />
  );
}
