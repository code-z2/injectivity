import { short } from "@/lib/utils";
import { RoleDot } from "./AddressCard";
import type { ChainLink } from "./types";

// A later link in the chain, in the landing chips' style: just the role dot
// and the short address. Its label and actions live in the link menu.
export function AddressBadge({ link }: { link: ChainLink }) {
  return (
    <div
      className="inline-flex h-8 items-center gap-2 rounded-full border border-white bg-surface/80 pr-3.5 pl-3 font-mono text-[12px] text-ink-soft shadow-hairline backdrop-blur-md"
      title={link.address}
    >
      <RoleDot role={link.role} />
      {short(link.address)}
    </div>
  );
}
