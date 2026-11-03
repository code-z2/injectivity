import { AnimatePresence, motion } from "motion/react";
import { type ReactNode, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useAgentWidth } from "@/lib/agentDock";

// The side card: one floating card just left of the agent dock, above
// everything else, lined up with whatever is being hovered in the dock (a
// citation chip, the summary strip). Everything read on hover shows here,
// so the view stays consistent.

export interface Reveal {
  /** Changes when the content does, so the card cross-fades. */
  key: string;
  content: ReactNode;
  /** The hovered element; the card lines up with its top. */
  anchor: DOMRect;
}

const INSET = 12;
const GAP = 12;
const WIDTH = 320;
const EASE = [0.23, 1, 0.32, 1] as const;

export function SideCard({
  reveal,
  left,
}: {
  reveal: Reveal | null;
  /** Place the card at this x instead of left of the agent dock. */
  left?: number;
}) {
  const dockW = useAgentWidth();
  const card = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState(0);
  useLayoutEffect(() => {
    if (card.current) setHeight(card.current.offsetHeight);
  });

  const top = reveal
    ? Math.max(
        INSET,
        Math.min(reveal.anchor.top - 8, innerHeight - height - INSET),
      )
    : 0;

  return createPortal(
    <AnimatePresence>
      {reveal && (
        <motion.div
          animate={{ opacity: 1, x: 0, top }}
          className="pointer-events-none fixed z-[5000]"
          exit={{ opacity: 0, x: 6, transition: { duration: 0.12 } }}
          initial={{ opacity: 0, x: 6, top }}
          style={
            left === undefined
              ? { right: INSET + dockW + GAP, width: WIDTH }
              : { left, width: WIDTH }
          }
          transition={{
            opacity: { duration: 0.16, ease: EASE },
            x: { duration: 0.2, ease: EASE },
            top: { duration: 0.22, ease: EASE },
          }}
        >
          <div
            className="max-h-[calc(100svh-24px)] overflow-hidden rounded-2xl border border-glass-edge bg-glass/90 p-1 shadow-console backdrop-blur-xl"
            ref={card}
          >
            <AnimatePresence initial={false} mode="popLayout">
              <motion.div
                animate={{ opacity: 1, filter: "blur(0px)" }}
                exit={{ opacity: 0, filter: "blur(2px)" }}
                initial={{ opacity: 0, filter: "blur(2px)" }}
                key={reveal.key}
                transition={{ duration: 0.16, ease: EASE }}
              >
                {reveal.content}
              </motion.div>
            </AnimatePresence>
          </div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
