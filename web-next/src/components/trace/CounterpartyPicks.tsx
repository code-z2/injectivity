import { motion } from "motion/react";
import type { KnownLabel } from "@/lib/api";
import { cn, short } from "@/lib/utils";
import { RoleDot } from "./AddressCard";
import { nameFromLabel, roleFromLabel } from "./types";
import type { Counterparty } from "./useLedger";

// Stand-in for the globe until it exists: the active address's unique
// counterparties as small chips, most active first. Clicking one follows
// it (adds it to the chain). Hovering a ledger row lights its chip, the
// same link the globe will make with its dots.

const SHOW = 24;

export function CounterpartyPicks({
  counterparties,
  labels,
  lit,
  detaches,
  onFollow,
}: {
  counterparties: Counterparty[];
  labels: Record<string, KnownLabel>;
  lit: string | null;
  /** Links a follow from the selected one would detach. */
  detaches: number;
  onFollow: (address: string) => void;
}) {
  if (counterparties.length === 0) return null;
  const rest = counterparties.length - SHOW;
  return (
    <section aria-label="Counterparties" className="max-w-[720px]">
      <p className="mb-2.5 text-[11.5px] text-faint">
        Counterparties · follow one to go deeper
        {detaches > 0 && (
          <span className="text-ink-soft">
            {" "}
            · following from here detaches {detaches} later{" "}
            {detaches === 1 ? "address" : "addresses"}
          </span>
        )}
      </p>
      <ul className="flex flex-wrap gap-1.5">
        {counterparties.slice(0, SHOW).map((c, i) => {
          const l = labels[c.address];
          const name = nameFromLabel(l);
          return (
            <motion.li
              key={c.address}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: Math.min(i, 12) * 0.02 }}
            >
              <button
                onClick={() => onFollow(c.address)}
                title={`${c.address}${name ? ` · ${name}` : ""}`}
                className={cn(
                  "flex h-7 items-center gap-1.5 rounded-full border border-white bg-surface/80 pr-2.5 pl-2 font-mono text-[11.5px] text-ink-soft shadow-hairline transition-[box-shadow,color] duration-150 hover:text-ink hover:shadow-card",
                  lit === c.address && "text-ink ring-2 ring-ink/15",
                )}
              >
                <RoleDot role={roleFromLabel(l)} className="size-1.5" />
                {short(c.address, 4, 4)}
                <span className="font-sans text-[10.5px] text-faint tabular-nums">
                  {c.inCount + c.outCount}
                </span>
              </button>
            </motion.li>
          );
        })}
        {rest > 0 && (
          <li className="flex h-7 items-center px-2 text-[11.5px] text-faint">
            +{rest} more
          </li>
        )}
      </ul>
    </section>
  );
}
