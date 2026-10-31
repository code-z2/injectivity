import { useEffect, type RefObject } from "react";

// Reveals the underlay's line art around the cursor. The art sits over the
// aurora (no background of its own); this masks the ART with a large,
// bell-shaped falloff so it fades in and out with no visible rim (the
// Gloam effect), rather than cutting a hole in the sky. Eased position, a
// radius that swells while moving and relaxes at rest, hides when the
// pointer leaves. The art drifts slightly against the cursor for depth.
// Writes styles directly (no React renders) and sleeps when settled.
// Mouse/trackpad only.

const BASE = 320; // reveal radius at rest, px (falloff spans all of it)
const SWELL = 70; // extra radius at speed
const FOLLOW = 0.14; // position easing per frame
const GROW = 0.08; // radius easing per frame
const PARALLAX = 0.018;

// Gaussian-like alpha stops: no flat core, no hard shoulder.
const FALLOFF = [
  [0, 1],
  [12, 0.9],
  [26, 0.7],
  [40, 0.47],
  [55, 0.26],
  [70, 0.11],
  [84, 0.035],
  [100, 0],
]
  .map(([p, a]) => `rgba(0,0,0,${a}) ${p}%`)
  .join(", ");
const HIDDEN = "linear-gradient(transparent, transparent)";

export function usePeekLens(
  art: RefObject<HTMLElement | null>,
  drift: RefObject<HTMLElement | null>,
) {
  useEffect(() => {
    if (!window.matchMedia("(pointer: fine)").matches) return;
    const reduce = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    const tgt = { x: innerWidth / 2, y: innerHeight / 2, r: 0 };
    const cur = { ...tgt };
    let last = { x: 0, y: 0, t: 0 };
    let raf = 0;
    let idle = 0;

    const paint = () => {
      const s = art.current;
      const u = drift.current;
      if (s) {
        const m =
          cur.r > 1
            ? `radial-gradient(circle ${cur.r.toFixed(1)}px at ${cur.x.toFixed(1)}px ${cur.y.toFixed(1)}px, ${FALLOFF})`
            : HIDDEN;
        s.style.maskImage = m;
        s.style.setProperty("-webkit-mask-image", m);
      }
      if (u) {
        const dx = (cur.x - innerWidth / 2) * -PARALLAX;
        const dy = (cur.y - innerHeight / 2) * -PARALLAX;
        u.style.transform = `translate3d(${dx.toFixed(2)}px, ${dy.toFixed(2)}px, 0)`;
      }
    };

    const step = () => {
      const k = reduce ? 1 : FOLLOW;
      cur.x += (tgt.x - cur.x) * k;
      cur.y += (tgt.y - cur.y) * k;
      cur.r += (tgt.r - cur.r) * (reduce ? 1 : GROW);
      paint();
      const settled =
        Math.abs(tgt.x - cur.x) < 0.2 &&
        Math.abs(tgt.y - cur.y) < 0.2 &&
        Math.abs(tgt.r - cur.r) < 0.2;
      raf = settled ? 0 : requestAnimationFrame(step);
    };
    const wake = () => {
      if (!raf) raf = requestAnimationFrame(step);
    };

    const onMove = (e: PointerEvent) => {
      if (e.pointerType !== "mouse" && e.pointerType !== "pen") return;
      const now = performance.now();
      const dt = Math.max(now - last.t, 1);
      const speed = Math.hypot(e.clientX - last.x, e.clientY - last.y) / dt;
      last = { x: e.clientX, y: e.clientY, t: now };
      tgt.x = e.clientX;
      tgt.y = e.clientY;
      tgt.r = BASE + Math.min(speed * 30, SWELL);
      clearTimeout(idle);
      idle = window.setTimeout(() => {
        tgt.r = BASE;
        wake();
      }, 140);
      wake();
    };
    const onLeave = () => {
      tgt.r = 0;
      wake();
    };

    window.addEventListener("pointermove", onMove, { passive: true });
    document.documentElement.addEventListener("pointerleave", onLeave);
    window.addEventListener("blur", onLeave);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(idle);
      window.removeEventListener("pointermove", onMove);
      document.documentElement.removeEventListener("pointerleave", onLeave);
      window.removeEventListener("blur", onLeave);
    };
  }, [art, drift]);
}
