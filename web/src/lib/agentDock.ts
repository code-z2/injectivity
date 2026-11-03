// The agent dock's width, shared with what positions itself around it (the
// bottom dock's room on the right, the side card's offset). Dragging the
// dock's left edge sets it; it's remembered in this browser.
import { useSyncExternalStore } from "react";

export const AGENT_MIN_W = 300;
export const AGENT_DEFAULT_W = 340;
const SLOT = "intel-terminal:agent-dock-width";

/** Widest the dock may get: 560px, or 45% of the window on smaller screens. */
export const agentMaxW = () =>
  Math.max(AGENT_MIN_W, Math.min(560, Math.round(innerWidth * 0.45)));

const clamp = (w: number) =>
  Math.round(Math.min(agentMaxW(), Math.max(AGENT_MIN_W, w)));

let width = (() => {
  try {
    const v = Number(localStorage.getItem(SLOT));
    return Number.isFinite(v) && v > 0 ? clamp(v) : AGENT_DEFAULT_W;
  } catch {
    return AGENT_DEFAULT_W;
  }
})();
const listeners = new Set<() => void>();

export function setAgentWidth(w: number, persist = false) {
  width = clamp(w);
  for (const l of listeners) l();
  if (persist)
    try {
      localStorage.setItem(SLOT, String(width));
    } catch {
      // Not remembered.
    }
}

export const getAgentWidth = () => width;

export function useAgentWidth(): number {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => width,
    () => width,
  );
}
