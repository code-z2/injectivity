import { cn, short } from "@/lib/utils";
import { ROLE_TAG, type ChainLink } from "./types";

// The chain's first address, as a badge in the landing chips' style: the
// address and one role item (its label in the role colour, e.g. "Binance
// exploiter" in black). Nothing else; actions live in the link menu.
export function AddressCard({ link }: { link: ChainLink }) {
  const name = link.ens ?? link.label ?? ROLE_TAG[link.role];
  return (
    <div
      className={cn(
        "inline-flex h-9 items-center gap-2 rounded-full border border-glass-edge bg-surface/80 pl-3.5 shadow-hairline backdrop-blur-md",
        name ? "pr-1.5" : "pr-3.5",
      )}
    >
      <span
        className="font-mono text-[12.5px] text-ink-soft"
        title={link.address}
      >
        {short(link.address)}
      </span>
      {name && (
        <span
          className={cn(
            "inline-flex h-6 max-w-[180px] items-center truncate rounded-full px-2.5 text-[12px] font-medium",
            link.role === "attacker" && "bg-attacker text-on-ink",
            link.role === "victim" && "bg-victim text-victim-ink",
            link.role === "normal" && "bg-subtle text-ink-soft",
          )}
        >
          <span className="truncate">{name}</span>
        </span>
      )}
    </div>
  );
}

export function RoleDot({
  role,
  className,
}: {
  role: ChainLink["role"];
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={cn(
        "size-2 shrink-0 rounded-full",
        role === "attacker" && "bg-attacker",
        role === "victim" && "bg-victim",
        role === "normal" && "bg-normal",
        className,
      )}
    />
  );
}
