import { ArrowDownLeft, ArrowUpRight } from "lucide-react";
import { cn, short } from "@/lib/utils";
import { RoleDot } from "./AddressCard";
import type { DummyFlow } from "./dummy";
import type { ChainLink } from "./types";

// Test scaffolding: the fund-flow table for the chain's newest address.
// Clicking a counterparty adds it to the chain. Replaced by the real table.
export function DummyFlowTable({
  of,
  flows,
  onFollow,
}: {
  of: ChainLink;
  flows: DummyFlow[];
  onFollow: (flow: DummyFlow) => void;
}) {
  return (
    <section className="w-full max-w-[640px]">
      <h2 className="mb-3 text-[12px] font-medium tracking-wide text-faint uppercase">
        Fund flow · {of.ens ?? of.label ?? short(of.address)}{" "}
        <span className="normal-case">(dummy)</span>
      </h2>
      <ul className="divide-y divide-line overflow-hidden rounded-2xl bg-surface shadow-card">
        {flows.map((f) => (
          <li key={f.address}>
            <button
              onClick={() => onFollow(f)}
              className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-subtle"
            >
              <span
                className={cn(
                  "flex size-6 items-center justify-center rounded-full",
                  f.direction === "in"
                    ? "bg-subtle text-ink-soft"
                    : "bg-ink/5 text-ink",
                )}
                aria-label={f.direction === "in" ? "Incoming" : "Outgoing"}
              >
                {f.direction === "in" ? (
                  <ArrowDownLeft className="size-3.5" />
                ) : (
                  <ArrowUpRight className="size-3.5" />
                )}
              </span>
              <RoleDot role={f.role} />
              <span className="font-mono text-[12.5px] text-ink">
                {short(f.address)}
              </span>
              <span className="min-w-0 flex-1 truncate text-[12.5px] text-muted">
                {f.ens ?? f.label ?? ""}
              </span>
              <span className="font-mono text-[12.5px] text-ink tabular-nums">
                {f.amount} {f.asset}
              </span>
              <span className="w-14 text-right text-[11.5px] text-faint">
                {f.ago}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
