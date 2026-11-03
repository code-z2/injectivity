import { Copy, MoreHorizontal, Unlink } from "lucide-react";
import { DropdownMenu } from "radix-ui";
import { addressUrl } from "@/lib/explorer";
import { cn } from "@/lib/utils";
import { RoleDot } from "./AddressCard";
import { EtherscanLogo } from "./EtherscanLogo";
import { ROLE_TAG, type ChainLink } from "./types";

// A link's details and actions, behind a "⋯" that appears beside the
// badge on hover (the badge itself never changes size). Top: who it is
// (role dot, label or ENS, role, full address). Below: copy the address,
// open it in Etherscan, and detach it with everything below it. The first
// link has no detach.
export function LinkMenu({
  link,
  chain,
  removes,
  onCopy,
  onDetach,
}: {
  link: ChainLink;
  chain: string;
  /** How many links a detach would remove (0 = not detachable). */
  removes: number;
  onCopy: () => void;
  onDetach: () => void;
}) {
  return (
    <DropdownMenu.Root modal={false}>
      <DropdownMenu.Trigger
        aria-label="Link actions"
        className={cn(
          "flex size-7 items-center justify-center rounded-full text-faint outline-none",
          "opacity-0 transition-[opacity,background-color,color] duration-150 group-hover:opacity-100 hover:bg-ink/5 hover:text-ink focus-visible:opacity-100 data-[state=open]:bg-ink/5 data-[state=open]:text-ink data-[state=open]:opacity-100",
        )}
      >
        <MoreHorizontal className="size-4" />
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          side="right"
          align="start"
          sideOffset={6}
          className={cn(
            "z-50 w-64 origin-(--radix-dropdown-menu-content-transform-origin) rounded-2xl bg-surface p-1.5 shadow-float",
            "data-[state=open]:animate-[menu-in_250ms_var(--ease-smooth-out)]",
            "data-[state=closed]:animate-[menu-out_150ms_var(--ease-smooth-out)]",
          )}
        >
          <div className="px-2.5 pt-2 pb-2.5">
            <div className="flex items-center gap-2">
              <RoleDot role={link.role} />
              <span className="truncate text-[13.5px] font-medium text-ink">
                {link.ens ?? link.label ?? "Unlabelled address"}
              </span>
            </div>
            {ROLE_TAG[link.role] && (
              <div className="mt-0.5 pl-4 text-[12px] text-muted">
                {ROLE_TAG[link.role]}
              </div>
            )}
            <div className="mt-1.5 pl-4 font-mono text-[11px] leading-relaxed break-all text-faint">
              {link.address}
            </div>
          </div>
          <DropdownMenu.Separator className="mx-2 mb-1 h-px bg-line" />
          <Item onSelect={onCopy}>
            <Copy className="size-4 text-faint" />
            Copy address
          </Item>
          <Item asChild>
            <a
              href={addressUrl(chain, link.address)}
              target="_blank"
              rel="noreferrer"
            >
              <EtherscanLogo className="size-4" />
              Open in Etherscan
            </a>
          </Item>
          {removes > 0 && (
            <>
              <DropdownMenu.Separator className="mx-2 my-1 h-px bg-line" />
              <Item onSelect={onDetach}>
                <Unlink className="size-4 text-faint" />
                <span className="flex-1">Detach from here</span>
                <span className="text-[12px] text-faint">
                  {removes === 1 ? "1 address" : `${removes} addresses`}
                </span>
              </Item>
            </>
          )}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

function Item({
  children,
  ...props
}: React.ComponentProps<typeof DropdownMenu.Item>) {
  return (
    <DropdownMenu.Item
      {...props}
      className="flex cursor-pointer items-center gap-2.5 rounded-xl px-2.5 py-2 text-[13.5px] text-ink-soft outline-none data-highlighted:bg-subtle data-highlighted:text-ink"
    >
      {children}
    </DropdownMenu.Item>
  );
}
