import { Check, ChevronDown } from "lucide-react";
import { Popover } from "radix-ui";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

// A filter at a glance: a landing-style chip showing the filter and its
// current value; it opens a small popover with the options. Active chips
// read in ink, idle ones muted.
export function FilterChip({
  label,
  value,
  active,
  children,
}: {
  label: string;
  value?: string;
  active: boolean;
  children: ReactNode;
}) {
  return (
    <Popover.Root>
      <Popover.Trigger
        className={cn(
          "flex h-7 shrink-0 items-center gap-1 rounded-full border px-2.5 text-[12px] transition-colors duration-150",
          active
            ? "border-ink/10 bg-ink/[0.04] text-ink"
            : "border-white bg-surface/70 text-muted shadow-hairline hover:text-ink-soft",
          "data-[state=open]:border-ink/15 data-[state=open]:text-ink",
        )}
      >
        {label}
        {value && (
          <span className="max-w-[12ch] truncate font-medium">{value}</span>
        )}
        <ChevronDown className="size-3 text-faint" />
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          side="top"
          align="start"
          sideOffset={8}
          className={cn(
            "z-50 max-h-[320px] min-w-48 origin-(--radix-popover-content-transform-origin) overflow-y-auto rounded-2xl bg-surface p-1.5 shadow-float outline-none",
            "data-[state=open]:animate-[menu-in_250ms_var(--ease-smooth-out)]",
            "data-[state=closed]:animate-[menu-out_150ms_var(--ease-smooth-out)]",
          )}
        >
          {children}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

export function Option({
  selected,
  onSelect,
  children,
}: {
  selected: boolean;
  onSelect: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className="flex w-full items-center gap-2.5 rounded-xl px-2.5 py-1.5 text-left text-[13px] text-ink-soft outline-none hover:bg-subtle hover:text-ink focus-visible:bg-subtle"
    >
      <span className="flex min-w-0 flex-1 items-center gap-2">{children}</span>
      <Check
        className={cn(
          "size-3.5 text-ink",
          selected ? "opacity-100" : "opacity-0",
        )}
      />
    </button>
  );
}
