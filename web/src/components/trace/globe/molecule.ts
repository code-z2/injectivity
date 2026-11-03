import type { TokenFlow } from "@/lib/prices";
import { cross, dot, FRONT, norm, seeded, type Vec } from "./geometry";

// The trace as chained molecules on a sphere. The active address is the
// centre atom at the front; its counterparties attach around it at
// irregular angles (like the H atoms around C in CH4), and each of those
// carries its own counterparties the same way, three rings deep.
//
// That sketch is then spread over the WHOLE sphere, like stickers on a
// football: it is stretched so the outer ring reaches round the back, and
// each card snaps to the nearest free slot of an evenly spaced lattice
// (inner rings first), so cards are evenly spaced everywhere, front and
// back, while neighbours stay near each other. A small seeded nudge keeps
// it from looking gridded. Seeded by address: same trace, same globe.

export interface NodeStat {
  address: string;
  inCount: number;
  outCount: number;
  /** Token movements between this address and its inner neighbour. */
  flows: TokenFlow[];
  /** USD moved between this address and its inner neighbour (profiles). */
  movedUsd?: number;
  /** Some of it couldn't be priced: movedUsd is a lower bound. */
  movedPartial?: boolean;
}

export type Flow = "in" | "out" | "both";

export interface MolNode {
  address: string;
  ring: 0 | 1 | 2 | 3;
  vec: Vec;
  /** Inner neighbour (ring 1: the active address; outer rings: their parent). */
  parent: string | null;
  stat: NodeStat | null;
}

export interface MolLink {
  /** Inner end. */
  a: string;
  /** Outer end. */
  b: string;
  /** Money direction relative to the inner end. */
  flow: Flow;
  count: number;
  seed: number;
}

export const flowOf = (s: Pick<NodeStat, "inCount" | "outCount">): Flow =>
  s.inCount && s.outCount ? "both" : s.inCount ? "in" : "out";

const DEG = Math.PI / 180;

/** Point at angular distance d from c, heading `dir` (a tangent at c). */
function step(c: Vec, dir: Vec, d: number): Vec {
  return norm([
    c[0] * Math.cos(d) + dir[0] * Math.sin(d),
    c[1] * Math.cos(d) + dir[1] * Math.sin(d),
    c[2] * Math.cos(d) + dir[2] * Math.sin(d),
  ]);
}

export function buildMolecule(
  active: string,
  ring1: NodeStat[],
  ring2: Map<string, NodeStat[]>,
  ring3: Map<string, NodeStat[]>,
): { nodes: Map<string, MolNode>; links: MolLink[] } {
  const nodes = new Map<string, MolNode>();
  const links: MolLink[] = [];
  const target = new Map<string, Vec>();
  nodes.set(active, {
    address: active,
    ring: 0,
    vec: FRONT,
    parent: null,
    stat: null,
  });

  // Ring 1 around the centre, spread evenly but ordered so outflows sit
  // right, inflows left and two-way top and bottom; each atom then gets
  // its own jitter in angle and distance, so the shape is never regular.
  const outs = ring1.filter((s) => flowOf(s) === "out");
  const boths = ring1.filter((s) => flowOf(s) === "both");
  const ins = ring1.filter((s) => flowOf(s) === "in");
  const half = Math.ceil(boths.length / 2);
  const order = [
    ...outs,
    ...boths.slice(0, half),
    ...ins,
    ...boths.slice(half),
  ];
  const n1 = Math.max(order.length, 1);
  const step1 = (Math.PI * 2) / n1;
  const start = outs.length
    ? -((outs.length - 1) / 2) * step1
    : Math.PI - (half + (ins.length - 1) / 2) * step1;
  order.forEach((s, i) => {
    const r = seeded(s.address);
    const flow = flowOf(s);
    const az = start + i * step1 + (r() - 0.5) * step1 * 0.7;
    const d = (26 + r() * 26) * DEG;
    const dir: Vec = [Math.cos(az), Math.sin(az), 0];
    const v = step(FRONT, dir, d);
    nodes.set(s.address, {
      address: s.address,
      ring: 1,
      vec: v,
      parent: active,
      stat: s,
    });
    target.set(s.address, v);
    links.push({
      a: active,
      b: s.address,
      flow,
      count: s.inCount + s.outCount,
      seed: r(),
    });
  });

  // Outer rings around each parent, heading away from the parent's own
  // inner neighbour and fanned irregularly to either side.
  const attach = (
    ring: 2 | 3,
    groups: Map<string, NodeStat[]>,
    minDeg: number,
    spanDeg: number,
  ) => {
    for (const [parent, kids] of groups) {
      const p = nodes.get(parent);
      if (!p || p.ring !== ring - 1) continue;
      const inner = p.parent ? (nodes.get(p.parent)?.vec ?? FRONT) : FRONT;
      const pd = dot(p.vec, inner);
      let out: Vec = norm([
        p.vec[0] * pd - inner[0],
        p.vec[1] * pd - inner[1],
        p.vec[2] * pd - inner[2],
      ]);
      if (!Number.isFinite(out[0])) out = [1, 0, 0];
      const side = norm(cross(p.vec, out));
      kids.forEach((k, i) => {
        if (k.address === active) return;
        const r = seeded(`${parent}:${k.address}`);
        if (nodes.has(k.address)) {
          // Already placed elsewhere: just link the two.
          const linked = links.some(
            (l) =>
              (l.a === parent && l.b === k.address) ||
              (l.a === k.address && l.b === parent),
          );
          if (!linked) {
            links.push({
              a: parent,
              b: k.address,
              flow: flowOf(k),
              count: k.inCount + k.outCount,
              seed: r(),
            });
          }
          return;
        }
        const m = kids.length;
        const fan = m > 1 ? (i / (m - 1) - 0.5) * 2.0 : 0;
        const a = fan + (r() - 0.5) * 0.7;
        const dir: Vec = norm([
          out[0] * Math.cos(a) + side[0] * Math.sin(a),
          out[1] * Math.cos(a) + side[1] * Math.sin(a),
          out[2] * Math.cos(a) + side[2] * Math.sin(a),
        ]);
        const v = step(p.vec, dir, (minDeg + r() * spanDeg) * DEG);
        nodes.set(k.address, {
          address: k.address,
          ring,
          vec: v,
          parent,
          stat: k,
        });
        target.set(k.address, v);
        links.push({
          a: parent,
          b: k.address,
          flow: flowOf(k),
          count: k.inCount + k.outCount,
          seed: r(),
        });
      });
    }
  };
  attach(2, ring2, 17, 14);
  attach(3, ring3, 14, 11);

  spread(nodes, target);
  return { nodes, links };
}

/** Average angle between neighbouring cards for n cards on the sphere. */
export const spacingFor = (n: number) =>
  Math.sqrt((4 * Math.PI) / Math.max(n, 2));

// Stretch the sketch round the sphere, then snap every card to the
// nearest free slot of an even lattice (inner rings claim slots first).
function spread(nodes: Map<string, MolNode>, sketch: Map<string, Vec>) {
  const list = [...nodes.values()].filter((n) => n.ring > 0);
  const n = list.length + 1;
  if (n < 3) return;
  // Lattice: Fibonacci sphere from the front pole (slot 0 = FRONT) to the
  // back pole.
  const slots: Vec[] = [];
  const golden = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < n; i++) {
    const z = 1 - (2 * i) / (n - 1);
    const r = Math.sqrt(Math.max(0, 1 - z * z));
    slots.push([Math.cos(golden * i) * r, Math.sin(golden * i) * r, z]);
  }
  const free = new Set(slots.keys());
  free.delete(0); // the active atom

  // Stretch: polar angle from the front scaled so the farthest card lands
  // near the back pole; azimuth kept.
  const theta = (v: Vec) => Math.acos(Math.min(1, Math.max(-1, v[2])));
  const far = Math.max(
    ...list.map((x) => theta(sketch.get(x.address) ?? x.vec)),
    0.01,
  );
  const k = (Math.PI * 0.94) / far;
  const want = new Map<string, Vec>();
  for (const x of list) {
    const v = sketch.get(x.address) ?? x.vec;
    const th = Math.min(Math.PI * 0.97, theta(v) * k);
    const az = Math.atan2(v[1], v[0]);
    want.set(x.address, [
      Math.sin(th) * Math.cos(az),
      Math.sin(th) * Math.sin(az),
      Math.cos(th),
    ]);
  }

  const gap = spacingFor(n);
  const ordered = [...list].sort(
    (a, b) =>
      a.ring - b.ring ||
      (b.stat ? b.stat.inCount + b.stat.outCount : 0) -
        (a.stat ? a.stat.inCount + a.stat.outCount : 0),
  );
  for (const x of ordered) {
    const w = want.get(x.address)!;
    let best = -1;
    let bd = -2;
    for (const i of free) {
      const d = dot(slots[i]!, w);
      if (d > bd) {
        bd = d;
        best = i;
      }
    }
    if (best < 0) continue;
    free.delete(best);
    // Seeded nudge of up to a fifth of the spacing, so it isn't a grid.
    const r = seeded(`nudge:${x.address}`);
    const base = slots[best]!;
    const t1 = norm(
      cross(base, Math.abs(base[2]) > 0.9 ? [1, 0, 0] : [0, 0, 1]),
    );
    const t2 = cross(base, t1);
    const a = r() * Math.PI * 2;
    const dir: Vec = [
      t1[0] * Math.cos(a) + t2[0] * Math.sin(a),
      t1[1] * Math.cos(a) + t2[1] * Math.sin(a),
      t1[2] * Math.cos(a) + t2[2] * Math.sin(a),
    ];
    x.vec = step(base, dir, r() * gap * 0.2);
  }
}
