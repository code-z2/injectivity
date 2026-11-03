import { Check, ChevronDown } from "lucide-react";
import { DropdownMenu } from "radix-ui";
import { CHAINS, type Chain } from "@/lib/api";
import { CHAIN_META } from "@/lib/chains";
import { cn } from "@/lib/utils";

export function ChainDot({
  chain,
  className,
}: {
  chain: Chain;
  className?: string;
}) {
  return (
    <span
      className={cn("inline-block size-2 shrink-0 rounded-full", className)}
      style={{ backgroundColor: CHAIN_META[chain].dot }}
    />
  );
}

// Origin-aware dropdown (transitions.dev menu-dropdown timing): grows from
// its trigger at 250ms smooth-out, closes faster at 150ms.
export function ChainPicker({
  value,
  onChange,
  compact = false,
}: {
  value: Chain;
  onChange: (c: Chain) => void;
  compact?: boolean;
}) {
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger
        className={cn(
          "group flex shrink-0 items-center gap-2 rounded-full bg-subtle text-[13px] font-medium text-ink-soft",
          "transition-colors duration-150 hover:bg-line/70 data-[state=open]:bg-line/70",
          compact ? "h-8 px-2.5 sm:px-3" : "h-9 px-3 sm:px-3.5",
        )}
        aria-label={`Chain: ${CHAIN_META[value].label}`}
      >
        <ChainDot chain={value} />
        <span className="hidden sm:inline">{CHAIN_META[value].label}</span>
        <ChevronDown className="size-3.5 text-faint transition-transform duration-250 ease-smooth-out group-data-[state=open]:rotate-180" />
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="start"
          sideOffset={10}
          className={cn(
            "z-50 min-w-52 origin-(--radix-dropdown-menu-content-transform-origin) rounded-2xl bg-surface p-1.5 shadow-float",
            "data-[state=open]:animate-[menu-in_250ms_var(--ease-smooth-out)]",
            "data-[state=closed]:animate-[menu-out_150ms_var(--ease-smooth-out)]",
          )}
        >
          <DropdownMenu.Label className="px-2.5 pt-1.5 pb-1 text-[11px] font-medium tracking-wide text-faint uppercase">
            Network
          </DropdownMenu.Label>
          {CHAINS.map((c) => (
            <DropdownMenu.Item
              key={c}
              onSelect={() => onChange(c)}
              className="flex cursor-pointer items-center gap-2.5 rounded-xl px-2.5 py-2 text-[14px] text-ink-soft outline-none data-highlighted:bg-subtle data-highlighted:text-ink"
            >
              <ChainDot chain={c} />
              <span className="flex-1">{CHAIN_META[c].label}</span>
              {c === value && <Check className="size-4 text-ion-600" />}
            </DropdownMenu.Item>
          ))}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
