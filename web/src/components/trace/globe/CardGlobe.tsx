import { useEffect, useMemo, useRef, useState } from "react";
import { currentTheme } from "@/lib/theme";
import type { KnownLabel } from "@/lib/api";
import { fmtValue, valueOf, type Prices } from "@/lib/prices";
import { cn, short } from "@/lib/utils";
import { RoleDot } from "../AddressCard";
import { nameFromLabel, roleFromLabel } from "../types";
import {
  fromTo,
  FRONT,
  IDENTITY,
  mulQ,
  rotate,
  slerpQ,
  slerpVec,
  axisAngle,
  type Quat,
  type Vec,
} from "./geometry";
import {
  buildMolecule,
  spacingFor,
  type MolLink,
  type MolNode,
  type NodeStat,
} from "./molecule";

// The trace globe: small cards on the surface of a sphere, arranged as
// chained molecules three rings deep (see molecule.ts), centred on the
// page. Cards facing you are full size and crisp; as they turn away they
// shrink and fade, so the front stays in focus and the globe still reads
// as a globe. Thin curved connectors join each atom to
// its neighbours; now and then a single pulse runs along one link facing
// you, the way the money moved. The globe is still until you move it.
//
// Drag spins it freely (with inertia); nothing is fetched by moving it.
// Click a card to inspect it in the dock; double-click to follow it (the
// globe turns that card to the front and its own molecule grows in).

const TURN_MS = 760;
const MORPH_MS = 720;
const ZOOM_MIN = 0.8;
const ZOOM_MAX = 1.5;
const CARD_GAP = 150; // px between neighbouring cards at the front
const DOUBLE_MS = 280; // a second click within this follows instead
const PULSE_MS = 1300;
const PULSE_GAP: [number, number] = [1800, 3600];
const PULSE_RGB = { in: "18,159,116", out: "48,53,62", both: "75,112,255" };
const HOT_RGB = "109,140,255"; // a hovered card's links (light ion)

interface Live {
  vec: Vec;
  alpha: number;
  from: Vec;
  to: Vec;
  aFrom: number;
  aTo: number;
  node: MolNode;
}

interface Pt {
  x: number;
  y: number;
}

const ease = (p: number) =>
  p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
const clamp = (v: number, a = 0, b = 1) => Math.min(b, Math.max(a, v));

// A curved connector from a to b: a cubic bowing to one side by a seeded
// amount (a fifth to a third of its length), never ruler-straight.
// Returned as sampled points so a pulse can travel along it by length.
function curve(a: Pt, b: Pt, seed: number): Pt[] {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len;
  const ny = dx / len;
  const side = seed < 0.5 ? -1 : 1;
  const bow = len * (0.2 + Math.abs(seed - 0.5) * 0.26) * side;
  const c1 = { x: a.x + dx * 0.3 + nx * bow, y: a.y + dy * 0.3 + ny * bow };
  const c2 = {
    x: a.x + dx * 0.7 + nx * bow * 0.8,
    y: a.y + dy * 0.7 + ny * bow * 0.8,
  };
  const pts: Pt[] = [];
  for (let i = 0; i <= 24; i++) {
    const u = i / 24;
    const m = 1 - u;
    pts.push({
      x:
        m * m * m * a.x +
        3 * m * m * u * c1.x +
        3 * m * u * u * c2.x +
        u * u * u * b.x,
      y:
        m * m * m * a.y +
        3 * m * m * u * c1.y +
        3 * m * u * u * c2.y +
        u * u * u * b.y,
    });
  }
  return pts;
}

// Index of the first sample (from the start, or from the end) that lies
// outside a card's box, so a line meets the card's edge, not its centre.
function exitIndex(
  pts: Pt[],
  b: { hw: number; hh: number },
  fromEnd: boolean,
): number {
  const c = fromEnd ? pts[pts.length - 1]! : pts[0]!;
  const out = (p: Pt) =>
    Math.abs(p.x - c.x) > b.hw + 3 || Math.abs(p.y - c.y) > b.hh + 3;
  if (fromEnd) {
    for (let i = pts.length - 1; i >= 0; i--) if (out(pts[i]!)) return i;
    return 0;
  }
  for (let i = 0; i < pts.length; i++) if (out(pts[i]!)) return i;
  return pts.length - 1;
}

function trace(ctx: CanvasRenderingContext2D, pts: Pt[]) {
  ctx.beginPath();
  pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
}

/** The stretch of a polyline between fractions u0 < u1 of its length. */
function stretch(pts: Pt[], u0: number, u1: number): Pt[] {
  const lens = [0];
  for (let i = 1; i < pts.length; i++) {
    lens.push(
      lens[i - 1]! +
        Math.hypot(pts[i]!.x - pts[i - 1]!.x, pts[i]!.y - pts[i - 1]!.y),
    );
  }
  const total = lens[lens.length - 1]! || 1;
  const at = (u: number): Pt => {
    const d = u * total;
    let i = 1;
    while (i < lens.length - 1 && lens[i]! < d) i++;
    const seg = lens[i]! - lens[i - 1]! || 1;
    const k = (d - lens[i - 1]!) / seg;
    return {
      x: pts[i - 1]!.x + (pts[i]!.x - pts[i - 1]!.x) * k,
      y: pts[i - 1]!.y + (pts[i]!.y - pts[i - 1]!.y) * k,
    };
  };
  const out = [at(u0)];
  for (let i = 0; i < pts.length; i++) {
    const u = lens[i]! / total;
    if (u > u0 && u < u1) out.push(pts[i]!);
  }
  out.push(at(u1));
  return out;
}

export function CardGlobe({
  chain,
  active,
  ring1,
  ring2,
  ring3,
  ready,
  labels,
  prices,
  lit,
  inspected,
  overflow,
  mapping,
  onInspect,
  onFollow,
}: {
  chain: string;
  active: string;
  ring1: NodeStat[];
  ring2: Map<string, NodeStat[]>;
  ring3: Map<string, NodeStat[]>;
  /** The active address's ring 1 has loaded (re-form only then). */
  ready: boolean;
  labels: Record<string, KnownLabel>;
  prices: Prices;
  /** Address to highlight (a hovered dock row). */
  lit: string | null;
  /** The card shown in the dock. */
  inspected: string;
  overflow: number;
  mapping: number;
  /** Single click: show this address in the dock. */
  onInspect: (address: string) => void;
  /** Double click: follow the path from the active address to it. */
  onFollow: (path: string[]) => void;
}) {
  const wrap = useRef<HTMLDivElement>(null);
  const lines = useRef<HTMLCanvasElement>(null);
  const cardEls = useRef(new Map<string, HTMLDivElement>());
  const [cards, setCards] = useState<MolNode[]>([]);
  const [hovered, setHovered] = useState<string | null>(null);
  const mol = useMemo(
    () => buildMolecule(active, ring1, ring2, ring3),
    [active, ring1, ring2, ring3],
  );

  const scene = useRef({
    live: new Map<string, Live>(),
    links: [] as MolLink[],
    t0: 0,
    dur: 0,
    q: IDENTITY as Quat,
    qFrom: IDENTITY as Quat,
    qTo: IDENTITY as Quat,
    qt0: 0,
    qdur: 0,
    spin: IDENTITY as Quat, // inertia per frame after a drag
    dragging: false,
    zoom: 1,
    zoomTo: 1,
    active,
    hovered: null as string | null,
    lit: null as string | null,
    inspected,
    pulse: null as { key: string; t0: number } | null,
    nextPulse: 0,
  });
  const reduce = useRef(false);
  useEffect(() => {
    reduce.current = matchMedia("(prefers-reduced-motion: reduce)").matches;
  }, []);
  scene.current.hovered = hovered;
  scene.current.lit = lit;
  scene.current.inspected = inspected;
  // Cards linked to the hovered one get a soft highlight.
  const neighbours = useMemo(() => {
    const out = new Set<string>();
    if (!hovered) return out;
    for (const ln of scene.current.links) {
      if (ln.a === hovered) out.add(ln.b);
      else if (ln.b === hovered) out.add(ln.a);
    }
    return out;
  }, [hovered]);

  function settle(now: number) {
    const s = scene.current;
    const p = s.dur ? ease(clamp((now - s.t0) / s.dur)) : 1;
    for (const l of s.live.values()) {
      l.vec = slerpVec(l.from, l.to, p);
      l.alpha = l.aFrom + (l.aTo - l.aFrom) * p;
    }
    if (s.qdur) {
      const qp = ease(clamp((now - s.qt0) / s.qdur));
      s.q = slerpQ(s.qFrom, s.qTo, qp);
      if (qp >= 1) s.qdur = 0;
    }
  }

  // Active address changed: turn its card to the front.
  useEffect(() => {
    const s = scene.current;
    if (s.active === active) return;
    const now = performance.now();
    settle(now);
    s.active = active;
    s.spin = IDENTITY;
    s.pulse = null;
    const target = s.live.get(active);
    if (target && target.alpha > 0.05) {
      s.qFrom = s.q;
      s.qTo = mulQ(fromTo(rotate(s.q, target.vec), FRONT), s.q);
      s.qt0 = now;
      s.qdur = reduce.current ? 1 : TURN_MS;
    } else {
      for (const l of s.live.values()) {
        l.from = l.vec;
        l.to = l.vec;
        l.aFrom = l.alpha;
        l.aTo = 0;
      }
      s.t0 = now;
      s.dur = reduce.current ? 0 : 320;
    }
  }, [active]); // eslint-disable-line react-hooks/exhaustive-deps

  // The active address's molecule is ready (or grew): re-form around it.
  useEffect(() => {
    if (!ready) return;
    const s = scene.current;
    const begin = () => {
      const now = performance.now();
      settle(now);
      // Bake the current orientation into positions so the new molecule
      // (laid out with the active atom at the front) continues seamlessly.
      for (const l of s.live.values()) l.vec = rotate(s.q, l.vec);
      s.q = IDENTITY;
      s.qdur = 0;
      const next = new Map<string, Live>();
      for (const [addr, node] of mol.nodes) {
        const prev = s.live.get(addr);
        let from: Vec;
        let aFrom: number;
        if (prev && prev.alpha > 0.02) {
          from = prev.vec;
          aFrom = prev.alpha;
        } else {
          const parent = node.parent ? mol.nodes.get(node.parent) : undefined;
          from = parent && node.ring > 1 ? parent.vec : FRONT;
          aFrom = 0;
        }
        next.set(addr, {
          vec: from,
          alpha: aFrom,
          from,
          to: node.vec,
          aFrom,
          aTo: 1,
          node,
        });
      }
      for (const [addr, l] of s.live) {
        if (next.has(addr) || l.alpha < 0.02) continue;
        next.set(addr, {
          ...l,
          from: l.vec,
          to: l.vec,
          aFrom: l.alpha,
          aTo: 0,
        });
      }
      s.live = next;
      s.links = mol.links;
      s.t0 = now;
      s.dur = reduce.current ? 0 : MORPH_MS;
      setCards([...next.values()].map((l) => l.node));
    };
    const left = s.qdur ? s.qt0 + s.qdur - performance.now() : 0;
    if (left > 30) {
      const t = setTimeout(begin, left);
      return () => clearTimeout(t);
    }
    begin();
  }, [mol, ready]); // eslint-disable-line react-hooks/exhaustive-deps

  // Drop faded-out cards from the DOM once their fade has finished.
  useEffect(() => {
    const t = setTimeout(() => {
      const s = scene.current;
      let dropped = false;
      for (const [a, l] of s.live) {
        if (l.aTo === 0) {
          s.live.delete(a);
          dropped = true;
        }
      }
      if (dropped) setCards([...s.live.values()].map((l) => l.node));
    }, MORPH_MS + 60);
    return () => clearTimeout(t);
  }, [cards]);

  // Frame loop: orientation, cards, connectors, the occasional pulse.
  useEffect(() => {
    const cv = lines.current!;
    const ctx = cv.getContext("2d")!;
    const dpr = Math.min(devicePixelRatio || 1, 2);
    let w = 0;
    let h = 0;
    let raf = 0;
    const ro = new ResizeObserver(() => {
      w = cv.clientWidth;
      h = cv.clientHeight;
      cv.width = Math.round(w * dpr);
      cv.height = Math.round(h * dpr);
    });
    ro.observe(cv);

    const frame = (now: number) => {
      const s = scene.current;
      settle(now);
      if (!s.dragging && !s.qdur) {
        s.q = mulQ(s.spin, s.q);
        s.spin = slerpQ(s.spin, IDENTITY, 0.08);
      }
      s.zoom += (s.zoomTo - s.zoom) * 0.14;
      const cx = w / 2;
      const cy = h * 0.47;
      // Sized by card spacing, not the viewport: cards stay spaced out
      // all round the sphere, and the globe may be larger than the screen
      // (drag to bring any part of it round).
      const R =
        Math.max(Math.min(w, h) * 0.38, CARD_GAP / spacingFor(s.live.size)) *
        s.zoom;
      const proj = (v: Vec) => {
        const p = rotate(s.q, v);
        return { x: cx + p[0] * R, y: cy - p[1] * R, z: p[2] };
      };

      // Cards (and the hovered card's neighbours, kept legible).
      const near = new Set<string>();
      if (s.hovered) {
        for (const ln of s.links) {
          if (ln.a === s.hovered) near.add(ln.b);
          else if (ln.b === s.hovered) near.add(ln.a);
        }
      }
      const pos = new Map<string, { x: number; y: number; z: number }>();
      const box = new Map<string, { hw: number; hh: number }>();
      for (const [addr, l] of s.live) {
        const p = proj(l.vec);
        pos.set(addr, p);
        const el = cardEls.current.get(addr);
        if (!el) continue;
        const f = (p.z + 1) / 2;
        const focus =
          addr === s.hovered || addr === s.lit || addr === s.inspected;
        const scale = (0.5 + 0.5 * f) * (l.node.ring === 0 ? 1.08 : 1);
        box.set(addr, {
          hw: (el.offsetWidth / 2) * scale,
          hh: (el.offsetHeight / 2) * scale,
        });
        const vis = Math.pow(clamp((p.z + 0.25) / 0.85, 0.04, 1), 1.4);
        const op =
          l.alpha *
          (focus
            ? Math.max(vis, 0.85)
            : near.has(addr)
              ? Math.max(vis, 0.7)
              : vis);
        el.style.transform = `translate(${p.x.toFixed(1)}px, ${p.y.toFixed(1)}px) translate(-50%, -50%) scale(${scale.toFixed(3)})`;
        el.style.opacity = op.toFixed(3);
        el.style.zIndex = String(
          Math.round(p.z * 100) + 200 + (focus ? 1000 : 0),
        );
        el.style.pointerEvents = op > 0.45 ? "auto" : "none";
      }

      // Connectors: thin curves, fading with depth.
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      ctx.lineJoin = "round";
      ctx.lineCap = "round";
      const facing: { key: string; pts: Pt[]; ln: MolLink; k: number }[] = [];
      const hot: { pts: Pt[]; ln: MolLink; alpha: number }[] = [];
      for (const ln of s.links) {
        const a = s.live.get(ln.a);
        const b = s.live.get(ln.b);
        const pa = pos.get(ln.a);
        const pb = pos.get(ln.b);
        if (!a || !b || !pa || !pb) continue;
        const alpha = Math.min(a.alpha, b.alpha);
        if (alpha < 0.02) continue;
        const face = clamp((Math.min(pa.z, pb.z) + 0.3) / 1.1);
        const pts = curve(pa, pb, ln.seed);
        if (s.hovered && (ln.a === s.hovered || ln.b === s.hovered)) {
          hot.push({ pts, ln, alpha });
          continue;
        }
        const focus = s.lit === ln.b || s.inspected === ln.b;
        trace(ctx, pts);
        ctx.strokeStyle = `rgba(${currentTheme() === "dark" ? "205,211,221" : "48,53,62"},${(alpha * (0.03 + 0.17 * face) * (focus ? 2.2 : 1)).toFixed(3)})`;
        ctx.lineWidth = 1;
        ctx.stroke();
        if (face > 0.75) {
          facing.push({ key: `${ln.a}>${ln.b}`, pts, ln, k: alpha });
        }
      }

      // The hovered card's links, on top, in a light accent, meeting the
      // cards' edges.
      for (const { pts, ln, alpha } of hot) {
        const ba = box.get(ln.a);
        const bb = box.get(ln.b);
        const i0 = ba ? exitIndex(pts, ba, false) : 0;
        const i1 = bb ? exitIndex(pts, bb, true) : pts.length - 1;
        if (i1 - i0 < 2) continue;
        const seg = pts.slice(i0, i1 + 1);
        const a = Math.max(alpha, 0.6);
        trace(ctx, seg);
        ctx.strokeStyle = `rgba(${HOT_RGB},${(0.6 * a).toFixed(3)})`;
        ctx.lineWidth = 1.25;
        ctx.stroke();
      }

      // One pulse at a time, now and then, on a link facing you.
      if (!reduce.current) {
        if (!s.pulse && now >= s.nextPulse && facing.length) {
          const pick = facing[Math.floor(Math.random() * facing.length)]!;
          s.pulse = { key: pick.key, t0: now };
        }
        if (s.pulse) {
          const p = (now - s.pulse.t0) / PULSE_MS;
          const link = facing.find((f) => f.key === s.pulse!.key);
          if (p >= 1 || !link) {
            s.pulse = null;
            s.nextPulse =
              now +
              PULSE_GAP[0] +
              Math.random() * (PULSE_GAP[1] - PULSE_GAP[0]);
          } else {
            const head = ease(p) * 1.28;
            const u1 = clamp(head);
            const u0 = clamp(head - 0.28);
            if (u1 > u0) {
              // Money direction: outward unless the link is an inflow.
              const seg =
                link.ln.flow === "in"
                  ? stretch(link.pts, 1 - u1, 1 - u0).reverse()
                  : stretch(link.pts, u0, u1);
              const first = seg[0]!;
              const last = seg[seg.length - 1]!;
              const g = ctx.createLinearGradient(
                first.x,
                first.y,
                last.x,
                last.y,
              );
              const rgb = PULSE_RGB[link.ln.flow];
              const fade = Math.sin(Math.PI * clamp(p)) * link.k;
              g.addColorStop(0, `rgba(${rgb},0)`);
              g.addColorStop(1, `rgba(${rgb},${(0.9 * fade).toFixed(3)})`);
              trace(ctx, seg);
              ctx.strokeStyle = g;
              ctx.lineWidth = 1.6;
              ctx.stroke();
            }
          }
        }
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, []);

  // Pointer: drag spins (with inertia); click inspects; double-click
  // follows (the single click waits briefly so a double doesn't inspect).
  const handlers = useRef({ onInspect, onFollow });
  handlers.current = { onInspect, onFollow };
  useEffect(() => {
    const el = wrap.current!;
    const s = scene.current;
    let down: {
      x: number;
      y: number;
      lx: number;
      ly: number;
      moved: boolean;
    } | null = null;
    let pending: { addr: string; timer: number } | null = null;
    const pathTo = (addr: string): string[] => {
      const path: string[] = [];
      let cur = s.live.get(addr)?.node;
      while (cur && cur.address !== s.active) {
        path.unshift(cur.address);
        cur = cur.parent ? s.live.get(cur.parent)?.node : undefined;
      }
      return path;
    };
    const pdown = (e: PointerEvent) => {
      down = {
        x: e.clientX,
        y: e.clientY,
        lx: e.clientX,
        ly: e.clientY,
        moved: false,
      };
      s.spin = IDENTITY;
    };
    const move = (e: PointerEvent) => {
      if (!down) return;
      const ddx = e.clientX - down.lx;
      const ddy = e.clientY - down.ly;
      if (
        !down.moved &&
        Math.hypot(e.clientX - down.x, e.clientY - down.y) > 4
      ) {
        down.moved = true;
        s.dragging = true;
        el.setPointerCapture(e.pointerId);
      }
      if (!down.moved) return;
      const len = Math.hypot(ddx, ddy);
      if (len > 0) {
        const dq = axisAngle([ddy, ddx, 0], len * 0.006);
        s.q = mulQ(dq, s.q);
        s.spin = slerpQ(IDENTITY, dq, 0.9);
        s.qdur = 0;
      }
      down.lx = e.clientX;
      down.ly = e.clientY;
    };
    const up = (e: PointerEvent) => {
      if (!down) return;
      const clicked = !down.moved;
      down = null;
      s.dragging = false;
      if (!clicked) return;
      const addr = (e.target as Element).closest<HTMLElement>("[data-addr]")
        ?.dataset.addr;
      if (!addr) return;
      const l = s.live.get(addr);
      if (!l || l.alpha < 0.3) return;
      if (pending && pending.addr === addr) {
        clearTimeout(pending.timer);
        pending = null;
        if (addr !== s.active) handlers.current.onFollow(pathTo(addr));
        return;
      }
      if (pending) clearTimeout(pending.timer);
      pending = {
        addr,
        timer: window.setTimeout(() => {
          pending = null;
          handlers.current.onInspect(addr);
        }, DOUBLE_MS),
      };
    };
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      s.zoomTo = clamp(
        s.zoomTo * Math.exp(-e.deltaY * 0.0012),
        ZOOM_MIN,
        ZOOM_MAX,
      );
    };
    el.addEventListener("pointerdown", pdown);
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", up);
    el.addEventListener("pointercancel", up);
    el.addEventListener("wheel", wheel, { passive: false });
    return () => {
      if (pending) clearTimeout(pending.timer);
      el.removeEventListener("pointerdown", pdown);
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", up);
      el.removeEventListener("pointercancel", up);
      el.removeEventListener("wheel", wheel);
    };
  }, []);

  return (
    <div
      ref={wrap}
      className="absolute inset-0 isolate cursor-grab touch-none select-none active:cursor-grabbing"
      aria-label="Trace globe"
    >
      <canvas
        ref={lines}
        className="pointer-events-none absolute inset-0 size-full"
      />
      {cards.map((n) => (
        <div
          key={n.address}
          data-addr={n.address}
          ref={(el) => {
            if (el) cardEls.current.set(n.address, el);
            else cardEls.current.delete(n.address);
          }}
          onMouseEnter={() => setHovered(n.address)}
          onMouseLeave={() => setHovered((h) => (h === n.address ? null : h))}
          className="absolute top-0 left-0 will-change-transform"
          style={{ opacity: 0 }}
        >
          <NodeCard
            node={n}
            chain={chain}
            active={n.address === active}
            inspected={n.address === inspected}
            linked={neighbours.has(n.address)}
            hovered={n.address === hovered}
            label={labels[n.address]}
            prices={prices}
          />
        </div>
      ))}
      <p className="pointer-events-none absolute bottom-24 left-1/2 z-[2000] -translate-x-1/2 text-center text-[11.5px] text-muted">
        {overflow > 0 && (
          <span className="block">+{overflow} more counterparties</span>
        )}
        {mapping > 0 && (
          <span className="t-shimmer block">
            Mapping outer rings… {mapping} left
          </span>
        )}
      </p>
    </div>
  );
}

function NodeCard({
  node,
  chain,
  active,
  inspected,
  linked,
  hovered,
  label,
  prices,
}: {
  node: MolNode;
  chain: string;
  active: boolean;
  inspected: boolean;
  /** Linked to the hovered card. */
  linked: boolean;
  hovered: boolean;
  label: KnownLabel | undefined;
  prices: Prices;
}) {
  const s = node.stat;
  const inC = s?.inCount ?? 0;
  const outC = s?.outCount ?? 0;
  const value = fmtValue(valueOf(chain, s?.flows ?? [], prices));
  const name = nameFromLabel(label);
  return (
    <div
      className={cn(
        "rounded-xl border border-glass-edge bg-surface/90 shadow-card backdrop-blur-md transition-[box-shadow] duration-200",
        active ? "px-3 py-2" : "px-2.5 py-1.5",
        (active || inspected) && "ring-2 ring-ink/10",
        linked && "border-ion-400/70",
        hovered && !active && "shadow-float",
      )}
    >
      <div className="flex items-center gap-1.5 whitespace-nowrap">
        <RoleDot role={roleFromLabel(label)} className="size-1.5" />
        <span
          className={cn(
            "font-mono text-ink",
            active ? "text-[12.5px]" : "text-[11.5px]",
          )}
        >
          {short(node.address, 4, 4)}
        </span>
      </div>
      {active ? (
        name && (
          <div className="mt-0.5 max-w-[20ch] truncate text-[10.5px] text-muted">
            {name}
          </div>
        )
      ) : (
        <div className="mt-0.5 flex items-center gap-1.5 text-[10.5px] whitespace-nowrap text-muted tabular-nums">
          <span className={inC > 0 ? "text-clean" : undefined}>↓{inC}</span>
          <span>↑{outC}</span>
          <span className="text-ink-soft">· {value}</span>
        </div>
      )}
      {hovered && (
        <div className="mt-1 border-t border-line pt-1 text-[10.5px] whitespace-nowrap">
          {!active && (
            <div className="max-w-[24ch] truncate text-ink-soft">
              {name ?? "Unlabelled"}
            </div>
          )}
          <div className="text-faint">
            {active
              ? "Click to inspect"
              : "Click to inspect · double-click to follow"}
          </div>
        </div>
      )}
    </div>
  );
}
