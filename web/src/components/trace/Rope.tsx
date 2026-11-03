import { motion, useReducedMotion } from "motion/react";

// A rope between two anchor points: an S curve that leaves the upper
// eyelet straight down and meets the lower one straight down, so a badge
// offset to the side looks hung from the one above. With `animate`, the
// rope pays out from the top and the lower eyelet appears as it lands;
// on exit it runs backwards, retracting into the upper eyelet.

export interface Point {
  x: number;
  y: number;
}

export const ROPE_DRAW = 0.55; // s

export function ropePath(a: Point, b: Point): string {
  const dy = b.y - a.y;
  return `M ${a.x} ${a.y} C ${a.x} ${a.y + dy * 0.6}, ${b.x} ${b.y - dy * 0.6}, ${b.x} ${b.y}`;
}

export function Rope({
  from,
  to,
  animate,
  exitDelay = 0,
}: {
  from: Point;
  to: Point;
  animate: boolean;
  /** When detached, the rope retracts into the eyelet above after this. */
  exitDelay?: number;
}) {
  const reduce = useReducedMotion();
  const play = animate && !reduce;
  const retract = {
    duration: reduce ? 0 : 0.28,
    delay: reduce ? 0 : exitDelay,
    ease: [0.4, 0, 1, 1] as const,
  };
  return (
    <g>
      <motion.path
        d={ropePath(from, to)}
        fill="none"
        stroke="var(--color-rope)"
        strokeWidth={1.5}
        strokeLinecap="round"
        initial={play ? { pathLength: 0 } : false}
        animate={{ pathLength: 1 }}
        exit={{ pathLength: 0, transition: retract }}
        transition={{ duration: ROPE_DRAW, ease: [0.22, 1, 0.36, 1] }}
      />
      <motion.g
        exit={{
          opacity: 0,
          transition: { ...retract, delay: retract.delay + retract.duration },
        }}
      >
        <Eyelet at={from} />
      </motion.g>
      <motion.g
        initial={play ? { opacity: 0 } : false}
        animate={{ opacity: 1 }}
        exit={{
          opacity: 0,
          transition: { duration: 0.1, delay: retract.delay },
        }}
        transition={{ duration: 0.15, delay: play ? ROPE_DRAW * 0.8 : 0 }}
      >
        <Eyelet at={to} />
      </motion.g>
    </g>
  );
}

function Eyelet({ at }: { at: Point }) {
  return (
    <circle
      cx={at.x}
      cy={at.y}
      r={3}
      fill="var(--color-canvas)"
      stroke="var(--color-rope)"
      strokeWidth={1.5}
    />
  );
}
