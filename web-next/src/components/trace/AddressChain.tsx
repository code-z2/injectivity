import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { AddressBadge } from "./AddressBadge";
import { AddressCard } from "./AddressCard";
import { LinkMenu } from "./LinkMenu";
import { Rope, ROPE_DRAW, type Point } from "./Rope";
import type { ChainLink } from "./types";

// The address chain, top-left: the starting badge, then one badge per
// address the user has followed, each hung from the one above by a rope.
// Every link sits on the left edge, so the ropes drop straight down the
// role-dot column; a new link pays its rope out from the link above, then
// drops into place with a small swing. Detaching runs that backwards from
// the bottom: each cut badge fades, then its rope retracts upward. Positions come from layout
// (offsetTop/Left), so entry transforms never move the anchors. No
// background: it sits straight on the canvas.

const ANCHOR_X = 16; // eyelet distance from an item's left edge (dot column)
const GAP = 32;
const CUT_STEP = 0.14; // s between links when several are detached

export interface Flash {
  address: string;
  n: number;
}

export function AddressChain({
  links,
  chain,
  flash,
  onCopy,
  onDetach,
}: {
  links: ChainLink[];
  chain: string;
  /** Pulses an existing link (when it is followed again). */
  flash?: Flash;
  onCopy: (address: string) => void;
  /** Removes the link at this index and every link after it. */
  onDetach: (index: number) => void;
}) {
  const listRef = useRef<HTMLOListElement>(null);
  const itemRefs = useRef<(HTMLLIElement | null)[]>([]);
  const [anchors, setAnchors] = useState<{ top: Point; bottom: Point }[]>([]);
  const [size, setSize] = useState({ w: 0, h: 0 });
  // Links present on first render hang without animating.
  const seen = useRef(new Set(links.map((l) => l.address)));
  const reduce = useReducedMotion();

  useLayoutEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const measure = () => {
      setSize({ w: list.scrollWidth, h: list.scrollHeight });
      setAnchors(
        itemRefs.current.slice(0, links.length).map((el) => {
          const x = (el?.offsetLeft ?? 0) + ANCHOR_X;
          const y = el?.offsetTop ?? 0;
          return {
            top: { x, y },
            bottom: { x, y: y + (el?.offsetHeight ?? 0) },
          };
        }),
      );
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(list);
    return () => ro.disconnect();
  }, [links]);

  // Follow the newest link down a long chain.
  useEffect(() => {
    const last = itemRefs.current[links.length - 1];
    last?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [links.length]);

  useEffect(() => {
    if (!flash) return;
    const i = links.findIndex((l) => l.address === flash.address);
    itemRefs.current[i]?.scrollIntoView({
      block: "nearest",
      behavior: "smooth",
    });
  }, [flash]); // eslint-disable-line react-hooks/exhaustive-deps

  // A detached address that comes back later (undo, or followed again)
  // hangs in fresh, so "seen" tracks only the links currently present.
  const isNew = (l: ChainLink) => !seen.current.has(l.address);
  useEffect(() => {
    seen.current = new Set(links.map((l) => l.address));
  });
  // Bottom-first order for a cut, from this render's (pre-cut) length.
  const cutDelay = (i: number) => (links.length - 1 - i) * CUT_STEP;

  return (
    <ol
      ref={listRef}
      aria-label="Address chain"
      className="relative flex flex-col items-start pb-10"
      style={{ gap: GAP }}
    >
      <svg
        aria-hidden
        className="pointer-events-none absolute top-0 left-0 z-10 overflow-visible"
        width={size.w}
        height={size.h}
      >
        <AnimatePresence>
          {links.slice(1).map((l, k) => {
            const a = anchors[k]?.bottom;
            const b = anchors[k + 1]?.top;
            if (!a || !b) return null;
            return (
              <Rope
                key={l.address}
                from={a}
                to={b}
                animate={isNew(l)}
                exitDelay={cutDelay(k + 1) + 0.1}
              />
            );
          })}
        </AnimatePresence>
      </svg>

      <AnimatePresence>
        {links.map((l, i) => {
          const fresh = isNew(l) && !reduce;
          return (
            <li
              key={l.address}
              ref={(el) => {
                itemRefs.current[i] = el;
              }}
              className="group relative flex items-center gap-1"
            >
              <motion.div
                className="relative"
                style={{ transformOrigin: `${ANCHOR_X}px 0px` }}
                initial={fresh ? { opacity: 0, y: -14, rotate: -7 } : false}
                animate={{ opacity: 1, y: 0, rotate: 0 }}
                exit={{
                  opacity: 0,
                  y: 6,
                  scale: 0.96,
                  transition: {
                    duration: reduce ? 0 : 0.18,
                    delay: reduce ? 0 : cutDelay(i),
                  },
                }}
                transition={{
                  opacity: { duration: 0.2, delay: ROPE_DRAW * 0.7 },
                  y: {
                    type: "spring",
                    stiffness: 320,
                    damping: 18,
                    delay: ROPE_DRAW * 0.7,
                  },
                  rotate: {
                    type: "spring",
                    stiffness: 140,
                    damping: 7,
                    delay: ROPE_DRAW * 0.7,
                  },
                }}
              >
                {i === 0 ? <AddressCard link={l} /> : <AddressBadge link={l} />}
                {flash?.address === l.address && (
                  <motion.span
                    key={flash.n}
                    aria-hidden
                    className="pointer-events-none absolute inset-0 rounded-full ring-2 ring-ink/30"
                    initial={{ opacity: 1, scale: 1 }}
                    animate={{ opacity: 0, scale: 1.15 }}
                    transition={{ duration: 0.6, ease: "easeOut" }}
                  />
                )}
              </motion.div>
              <LinkMenu
                link={l}
                chain={chain}
                removes={i === 0 ? 0 : links.length - i}
                onCopy={() => onCopy(l.address)}
                onDetach={() => onDetach(i)}
              />
            </li>
          );
        })}
      </AnimatePresence>
    </ol>
  );
}
