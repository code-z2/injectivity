import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { ORB } from "./orb";

// "Intel Terminal" → orb, pure SVG, driven by ONE master clock (rAF) so
// every stage overlaps the next instead of waiting on it.
//
// Timeline (t: 0 → END), short deliberate beats, overlapping tails:
//   0.12–1.00s shrink   each letter condenses into an ink dot
//   0.95–1.55s gather   dots slide together, closing the gaps
//   1.60–3.15s wave     a ripple runs along the line; dots peel off it
//   1.75–2.95s colour   ink → graphite ramp along the line, with the wave
//   2.55–3.55s roll     dots roll into a ring, left first; five dots
//                       merge into neighbours so the ring stays small
//   3.55–4.00s hold     the 8-dot ring keeps spinning, a short beat
//   4.00–4.85s tighten  the ring closes on its centre, unhurried
//   4.30–5.00s orb      the glowing orb blooms (ORB_BLOOM)
// Driving `state` back to "word" plays the clock backwards, faster.
//
// Coordinates are in a 200×40 design box, drawn at `scale`. The component
// is a zero-size anchor: with align="center" the word's centre sits on the
// anchor (and the orb lands there); with align="start" the anchor is the
// box's top-left corner and the orb lands at the left.

export const END = 5000;
export const ORB_BLOOM = 4300;
export const ORB_R = 11; // design units

type Rgb = [number, number, number];

const TEXT = "Intel Terminal";
const ITALIC_FROM = 6; // "Terminal" is italic
const FONT = 26;
const W = 200;
const H = 40;
const MID = 20;
const BASELINE = 28;
const INK: Rgb = [11, 13, 18];
const DOT_R = 2.6;
const GAP = 7;
const RING_R = 8;
// Dots that merge into their left neighbour while rolling, leaving 8.
const MERGE = new Set([1, 4, 6, 9, 11]);
const START_ORB_CX = 14;
const START_LINE_X = 4;
const REVERSE_SPEED = 1.5;

// Mono ramp the dots shift into: ink → graphite. The orb is glossy black,
// so the dots read as fragments of it (and can scatter back out of it).
const RAMP: Rgb[] = [
  [11, 13, 18],
  [52, 57, 66],
  [96, 103, 116],
];

const clamp = (v: number, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const seg = (t: number, a: number, b: number) => clamp((t - a) / (b - a));
const lerp = (a: number, b: number, p: number) => a + (b - a) * p;
const inOut = (p: number) =>
  p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
const easeOut = (p: number) => 1 - Math.pow(1 - p, 3);
const smooth = (p: number) => p * p * (3 - 2 * p);
const mixRgb = (a: Rgb, b: Rgb, p: number): Rgb => [
  lerp(a[0], b[0], p),
  lerp(a[1], b[1], p),
  lerp(a[2], b[2], p),
];
export const rgb = (c: Rgb) =>
  `rgb(${Math.round(c[0])},${Math.round(c[1])},${Math.round(c[2])})`;

function gradientAt(f: number): Rgb {
  const x = clamp(f, 0, 0.9999) * (RAMP.length - 1);
  const i = Math.floor(x);
  return mixRgb(RAMP[i]!, RAMP[i + 1]!, x - i);
}

interface Glyph {
  ch: string;
  italic: boolean;
  x: number;
  cx: number;
  cy: number;
  i: number;
}

export function WordmarkSequence({
  state,
  scale = 1,
  align = "start",
  showOrb = true,
  onOrbBloom,
  onSettle,
}: {
  state: "word" | "orb";
  scale?: number;
  align?: "start" | "center";
  /** Draw the SVG orb. Off when a page takes the orb over (landing). */
  showOrb?: boolean;
  /** Fires once each time the forward clock crosses ORB_BLOOM. */
  onOrbBloom?: () => void;
  onSettle?: (state: "word" | "orb") => void;
}) {
  const id = useId().replace(/:/g, "");
  const [glyphs, setGlyphs] = useState<Glyph[] | null>(null);
  const measureRef = useRef<SVGTextElement>(null);
  const letterRefs = useRef<(SVGTextElement | null)[]>([]);
  const dotRefs = useRef<(SVGCircleElement | null)[]>([]);
  const orbRef = useRef<SVGGElement>(null);
  const glowRef = useRef<SVGCircleElement>(null);
  const shadowRef = useRef<SVGEllipseElement>(null);
  const initial = state === "orb" ? END : 0;
  const clock = useRef(initial);
  const target = useRef(initial);
  const raf = useRef(0);
  const cb = useRef({ onOrbBloom, onSettle });
  cb.current = { onOrbBloom, onSettle };

  useLayoutEffect(() => {
    void document.fonts.ready.then(() => {
      const el = measureRef.current;
      if (!el) return;
      const out: Glyph[] = [];
      for (let i = 0; i < TEXT.length; i++) {
        if (TEXT[i] === " ") continue;
        const b = el.getExtentOfChar(i);
        out.push({
          ch: TEXT[i]!,
          italic: i >= ITALIC_FROM,
          x: b.x,
          cx: b.x + b.width / 2,
          cy: b.y + b.height * 0.56,
          i,
        });
      }
      setGlyphs(out);
    });
  }, []);

  // Word centre (design units): anchor for align="center".
  const wordCx = glyphs
    ? (glyphs[0]!.x +
        glyphs[glyphs.length - 1]!.cx * 2 -
        glyphs[glyphs.length - 1]!.x) /
      2
    : W / 2;
  const orbCx = align === "center" ? wordCx : START_ORB_CX;

  const paint = (t: number) => {
    if (!glyphs) return;
    const n = glyphs.length;
    // Ring slot per kept dot, in order.
    const slotOf: number[] = [];
    let ringN = 0;
    glyphs.forEach((_, k) => {
      if (!MERGE.has(k)) slotOf[k] = ringN++;
    });
    const lineX0 =
      align === "center" ? wordCx - ((n - 1) * GAP) / 2 : START_LINE_X;
    glyphs.forEach((g, k) => {
      const letter = letterRefs.current[k];
      const dot = dotRefs.current[k];
      if (!letter || !dot) return;

      // 1. shrink (staggered left → right)
      const s0 = 120 + k * 30;
      const sp = inOut(seg(t, s0, s0 + 520));
      const ls = lerp(1, 0.12, sp);
      letter.setAttribute(
        "transform",
        `translate(${g.cx} ${g.cy}) scale(${ls}) translate(${-g.cx} ${-g.cy})`,
      );
      letter.setAttribute("opacity", String(1 - smooth(seg(sp, 0.45, 0.95))));
      let r = DOT_R * easeOut(seg(sp, 0.35, 1));

      // 2. gather into a tight line
      const gp = inOut(seg(t, 950, 1550));
      let x = lerp(g.cx, lineX0 + k * GAP, gp);
      let y = lerp(g.cy, MID, gp);

      // 3. wave: eased in and out; still moving as the roll begins
      const w = seg(t, 1600, 3150);
      const env = Math.pow(Math.sin(Math.PI * w), 2);
      y += -5 * env * Math.sin(k * 0.8 - w * Math.PI * 4.6);

      // 4. roll into a spinning ring, staggered from the left. Merging
      //    dots head for their left neighbour's slot and dissolve into it.
      const merges = MERGE.has(k);
      const slot = slotOf[merges ? k - 1 : k]!;
      const spin = Math.PI * 2 * 2 * inOut(seg(t, 2550, END - 300));
      const ang = (slot / ringN) * Math.PI * 2 + Math.PI + spin;
      const r0 = 2550 + k * 30;
      const rp = inOut(seg(t, r0, r0 + 640));
      const fold = merges ? smooth(seg(t, r0 + 200, r0 + 640)) : 0;

      // 5. after a spinning beat, the ring tightens on its centre
      const m = inOut(seg(t, 4000, 4850));
      const ringR = RING_R * (1 - m);
      x = lerp(x, orbCx + Math.cos(ang) * ringR, rp);
      y = lerp(y, MID + Math.sin(ang) * ringR, rp);
      r *= (1 - 0.55 * m) * (1 - fold);

      const c = smooth(seg(t, 1750, 2950));
      dot.setAttribute("cx", x.toFixed(2));
      dot.setAttribute("cy", y.toFixed(2));
      dot.setAttribute("r", r.toFixed(2));
      dot.setAttribute("fill", rgb(mixRgb(INK, gradientAt(k / (n - 1)), c)));
      dot.setAttribute(
        "opacity",
        String((1 - fold) * (1 - smooth(seg(t, 4450, 4900)))),
      );
    });

    const o = easeOut(seg(t, ORB_BLOOM, END));
    orbRef.current?.setAttribute(
      "transform",
      `translate(${orbCx} ${MID}) scale(${lerp(0.35, 1, o)}) translate(${-orbCx} ${-MID})`,
    );
    orbRef.current?.setAttribute("opacity", String(o));
    glowRef.current?.setAttribute("opacity", String(o * 0.65));
    shadowRef.current?.setAttribute("opacity", String(o));
  };

  useLayoutEffect(() => {
    paint(clock.current);
    if (import.meta.env.DEV) {
      // Scrub from the console, e.g. __wordmark(1800).
      (window as unknown as { __wordmark: (t: number) => void }).__wordmark =
        paint;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [glyphs, align]);

  useEffect(() => {
    const next = state === "orb" ? END : 0;
    target.current = next;
    if (!glyphs || next === clock.current) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      clock.current = next;
      paint(next);
      if (next === END) cb.current.onOrbBloom?.();
      cb.current.onSettle?.(state);
      return;
    }
    let last = performance.now();
    const step = (now: number) => {
      const dt = Math.min(now - last, 48); // no jumps after a stalled frame
      last = now;
      const prev = clock.current;
      const forward = target.current > prev;
      clock.current = clamp(
        prev + (forward ? dt : -dt * REVERSE_SPEED),
        0,
        END,
      );
      const done = forward
        ? clock.current >= target.current
        : clock.current <= target.current;
      if (done) clock.current = target.current;
      if (forward && prev < ORB_BLOOM && clock.current >= ORB_BLOOM) {
        cb.current.onOrbBloom?.();
      }
      paint(clock.current);
      if (done) {
        cb.current.onSettle?.(target.current === END ? "orb" : "word");
        return;
      }
      raf.current = requestAnimationFrame(step);
    };
    cancelAnimationFrame(raf.current);
    raf.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, glyphs]);

  const left = align === "center" ? -wordCx * scale : 0;
  const top = align === "center" ? -MID * scale : 0;

  return (
    <div className="relative size-0">
      <svg
        width={W * scale}
        height={H * scale}
        viewBox={`0 0 ${W} ${H}`}
        overflow="visible"
        aria-hidden
        className="pointer-events-none absolute"
        style={{ left, top, opacity: glyphs ? 1 : 0 }}
      >
        <defs>
          {/* Glossy black sphere: graphite key light top-left falling to
              near-black, a soft bounce light at the base, a crisp
              specular highlight. */}
          <radialGradient id={`${id}-body`} cx="0.38" cy="0.32" r="0.75">
            <stop offset="0" stopColor={ORB.key} />
            <stop offset="0.45" stopColor={ORB.mid} />
            <stop offset="1" stopColor={ORB.deep} />
          </radialGradient>
          <radialGradient id={`${id}-bounce`} cx="0.55" cy="1" r="0.55">
            <stop offset="0" stopColor="#fff" stopOpacity="0.16" />
            <stop offset="1" stopColor="#fff" stopOpacity="0" />
          </radialGradient>
          <radialGradient id={`${id}-light`} cx="0.34" cy="0.26" r="0.3">
            <stop offset="0" stopColor="#fff" stopOpacity="0.85" />
            <stop offset="0.5" stopColor="#fff" stopOpacity="0.25" />
            <stop offset="1" stopColor="#fff" stopOpacity="0" />
          </radialGradient>
          <filter id={`${id}-blur-lg`} x="-1" y="-1" width="3" height="3">
            <feGaussianBlur stdDeviation="5" />
          </filter>
          <filter id={`${id}-blur-sm`} x="-1" y="-1" width="3" height="3">
            <feGaussianBlur stdDeviation="1.6" />
          </filter>
        </defs>

        <text
          ref={measureRef}
          x={0}
          y={BASELINE}
          fontSize={FONT}
          className="font-brand"
          opacity={0}
        >
          <tspan>{TEXT.slice(0, ITALIC_FROM)}</tspan>
          <tspan fontStyle="italic">{TEXT.slice(ITALIC_FROM)}</tspan>
        </text>

        {showOrb && (
          <>
            <ellipse
              ref={shadowRef}
              cx={orbCx}
              cy={MID + ORB_R + 3}
              rx={ORB_R * 0.8}
              ry={2.4}
              fill="#0b0d12"
              fillOpacity={ORB.shadowAlpha}
              filter={`url(#${id}-blur-sm)`}
              opacity={0}
            />
            <circle
              ref={glowRef}
              cx={orbCx}
              cy={MID}
              r={ORB_R + 2}
              fill="#0b0d12"
              fillOpacity={ORB.haloAlpha}
              filter={`url(#${id}-blur-lg)`}
              opacity={0}
            />
          </>
        )}

        {glyphs?.map((g, k) => (
          <text
            key={g.i}
            ref={(el) => {
              letterRefs.current[k] = el;
            }}
            x={g.x}
            y={BASELINE}
            fontSize={FONT}
            fontStyle={g.italic ? "italic" : "normal"}
            className="font-brand"
            fill={rgb(INK)}
          >
            {g.ch}
          </text>
        ))}

        {glyphs?.map((g, k) => (
          <circle
            key={g.i}
            ref={(el) => {
              dotRefs.current[k] = el;
            }}
            cx={g.cx}
            cy={g.cy}
            r={0}
            fill={rgb(INK)}
          />
        ))}

        {showOrb && (
          <g ref={orbRef} opacity={0}>
            <circle cx={orbCx} cy={MID} r={ORB_R} fill={`url(#${id}-body)`} />
            <circle cx={orbCx} cy={MID} r={ORB_R} fill={`url(#${id}-bounce)`} />
            <circle cx={orbCx} cy={MID} r={ORB_R} fill={`url(#${id}-light)`} />
            <circle
              cx={orbCx}
              cy={MID}
              r={ORB_R - 0.25}
              fill="none"
              stroke="#fff"
              strokeOpacity={0.08}
              strokeWidth={0.5}
            />
          </g>
        )}
      </svg>
    </div>
  );
}
