import { useEffect, useRef } from "react";
import { createOrbPainter } from "@/components/brand/orb";

// The send orb "breathes" through the work, on one canvas clock:
//   1 shrink    the solid orb contracts into a small core
//   2 expand    a thinking swirl of fine dots blooms out of the core (the
//               core is gone as they leave it) and keeps spinning, twisting
//               by latitude and breathing, for as long as the work runs
//   3 collapse  success ("in"): the swirl is drawn into its centre and is
//               gone; that is the last beat, and the page moves on
//   4 reform    failure ("back"): after the same collapse the core
//               reappears and grows back into the full orb, with a small
//               overshoot; onCollapsed fires once it is exactly at rest
// The canvas draws the orb with the button's own shading (brand/orb.ts),
// so the hand-offs at both ends are invisible. The only switch between
// solid and dots happens at the core, a few pixels across.
// Reduced motion: no shrink or spin, the dot sphere simply holds.

export type ThinkingPhase = "off" | "think" | "in" | "back";

const N = 150;
const CORE = 0.2; // core size, fraction of the orb
const SHRINK = 420;
const EXPAND = 760;
const COLLAPSE = 460;
const REFORM = 520;
const SPIN = 1.15; // rad/s while thinking
const SPIN_IN = 3.2; // rad/s as the swirl is drawn in
const TWIST = 0.7;
const FRONT = [34, 38, 45];
const BACK = [138, 144, 155];

const clamp = (v: number, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const seg = (t: number, a: number, b: number) => clamp((t - a) / (b - a));
const lerp = (a: number, b: number, p: number) => a + (b - a) * p;
const easeOut = (p: number) => 1 - Math.pow(1 - p, 3);
const easeIn = (p: number) => p * p * p;
const inOut = (p: number) =>
  p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
const smooth = (p: number) => p * p * (3 - 2 * p);
// Ease-out with a small overshoot (lands at exactly 1).
const outBack = (p: number) => {
  const k = 1.4;
  return 1 + (k + 1) * Math.pow(p - 1, 3) + k * Math.pow(p - 1, 2);
};

interface Dot {
  x: number;
  y: number;
  z: number;
  seed: number;
  delay: number;
}

function makeDots(): Dot[] {
  const out: Dot[] = [];
  const phi = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < N; i++) {
    const y = 1 - (i / (N - 1)) * 2;
    const r = Math.sqrt(1 - y * y);
    const th = phi * i;
    out.push({
      x: Math.cos(th) * r,
      y,
      z: Math.sin(th) * r,
      seed: Math.random(),
      delay: Math.random() * 140,
    });
  }
  return out;
}

export function ThinkingOrb({
  phase,
  orbD,
  maxD,
  onCollapsed,
}: {
  phase: ThinkingPhase;
  /** Diameter of the solid orb (the send button). */
  orbD: number;
  /** Largest swirl diameter that still fits (the field height). */
  maxD: number;
  onCollapsed?: () => void;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const dots = useRef<Dot[]>(makeDots());
  const t0 = useRef(0);
  const tc = useRef(0);
  const phaseRef = useRef(phase);
  const done = useRef(onCollapsed);
  done.current = onCollapsed;

  const orbR = orbD / 2;
  // Breathing adds ~5%: keep the outermost dots inside the field.
  const Rs = Math.min(orbR * 1.06, maxD / 2 / 1.08 - 2);
  const S = Math.ceil(maxD * 1.25);

  useEffect(() => {
    const prev = phaseRef.current;
    phaseRef.current = phase;
    const now = performance.now();
    if (phase === "think" && prev === "off") t0.current = now;
    if ((phase === "in" || phase === "back") && prev === "think") {
      tc.current = now;
    }
  }, [phase]);

  useEffect(() => {
    if (phase === "off") return;
    const canvas = ref.current!;
    const ctx = canvas.getContext("2d")!;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = S * dpr;
    canvas.height = S * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const reduce = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    const c = S / 2;
    const paintOrb = createOrbPainter(ctx, c, c, orbR);
    const dotBase = (orbD / 60) * 1.15;
    const tilt = 0.42;
    const ct = Math.cos(tilt);
    const st = Math.sin(tilt);
    let raf = 0;
    let finished = false;
    let angle = 0;
    let last = performance.now();

    const drawOrb = (s: number) => {
      if (s <= 0.002) return;
      ctx.save();
      ctx.translate(c, c);
      ctx.scale(s, s);
      ctx.translate(-c, -c);
      ctx.beginPath();
      ctx.arc(c, c, orbR, 0, Math.PI * 2);
      ctx.clip();
      paintOrb();
      ctx.restore();
    };

    const frame = (now: number) => {
      const dt = Math.min(now - last, 48) / 1000;
      last = now;
      const p = phaseRef.current;
      // Dev only: freeze the think clock from the console (__thinkT = 300).
      const forced = import.meta.env.DEV
        ? (window as unknown as { __thinkT?: number }).__thinkT
        : undefined;
      const t = reduce ? SHRINK + EXPAND : (forced ?? now - t0.current);
      const ts = t / 1000;
      const ending = p === "in" || p === "back";
      const et = ending ? now - tc.current : 0;
      const k = ending ? easeIn(seg(et, 0, COLLAPSE)) : 0; // drawn in
      const reform = p === "back";
      const rp = reform ? seg(et, COLLAPSE, COLLAPSE + REFORM) : 0;

      // 1 + 2: orb shrinks to the core, then the core gives way to dots.
      let orbScale = lerp(1, CORE, inOut(seg(t, 0, SHRINK)));
      orbScale *= 1 - smooth(seg(t, SHRINK - 60, SHRINK + 200));
      // 4 (failure only): core returns as the swirl is drawn in, then
      // grows back into the orb.
      if (reform) {
        const core = CORE * easeOut(seg(et, COLLAPSE * 0.55, COLLAPSE));
        orbScale = rp > 0 ? lerp(CORE, 1, outBack(rp)) : core;
        if (rp >= 1) orbScale = 1;
      }

      // Swirl speed: spins up as it blooms; quickens as it is drawn in.
      let w = SPIN * easeOut(seg(t, SHRINK, SHRINK + 900));
      if (ending) w = lerp(w, SPIN_IN, k);
      if (!reduce) angle += w * dt;
      const twist = reduce ? 0 : TWIST * smooth(seg(t, SHRINK, SHRINK + 1100));

      ctx.clearRect(0, 0, S, S);

      if (!(ending && rp > 0)) {
        for (const d of dots.current) {
          const start = SHRINK - 80 + d.delay;
          const bloom = reduce ? 1 : easeOut(seg(t, start, start + EXPAND));
          if (bloom <= 0) continue;
          const ang = angle + twist * Math.sin(ts * 0.8 + d.y * 2.2);
          const ca = Math.cos(ang);
          const sa = Math.sin(ang);
          const x1 = d.x * ca + d.z * sa;
          const z1 = -d.x * sa + d.z * ca;
          const y2 = d.y * ct - z1 * st;
          const z2 = d.y * st + z1 * ct;
          const f = (z2 + 1) / 2; // 0 back … 1 front
          const breathe = 1 + 0.05 * Math.sin(ts * 2.1 + d.seed * Math.PI * 2);
          const rad = Rs * breathe * bloom * (1 - k);
          const r = (0.55 + 0.9 * f) * dotBase * smooth(bloom) * (1 - 0.5 * k);
          const a = (0.25 + 0.75 * f) * (1 - smooth(seg(k, 0.7, 1)));
          if (a <= 0.003 || r <= 0.05) continue;
          ctx.fillStyle = `rgba(${Math.round(lerp(BACK[0]!, FRONT[0]!, f))},${Math.round(
            lerp(BACK[1]!, FRONT[1]!, f),
          )},${Math.round(lerp(BACK[2]!, FRONT[2]!, f))},${a.toFixed(3)})`;
          ctx.beginPath();
          ctx.arc(c + x1 * rad, c - y2 * rad, r, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      drawOrb(orbScale);

      const over = reform ? rp >= 1 : ending && et >= COLLAPSE;
      if (over) {
        if (!finished) {
          finished = true;
          done.current?.();
        }
        return;
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [phase === "off", S, Rs, orbR, orbD]); // eslint-disable-line react-hooks/exhaustive-deps

  if (phase === "off") return null;
  return (
    <canvas
      ref={ref}
      aria-hidden
      className="pointer-events-none absolute"
      style={{ width: S, height: S, left: -S / 2, top: -S / 2 }}
    />
  );
}
