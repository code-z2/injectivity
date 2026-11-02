// Sphere math for the trace globe: unit vectors, quaternions and
// great-circle interpolation. Globe space: +z faces the viewer, +x right,
// +y up.

export type Vec = [number, number, number];
export type Quat = [number, number, number, number]; // w, x, y, z

export const FRONT: Vec = [0, 0, 1];
export const IDENTITY: Quat = [1, 0, 0, 0];

export const dot = (a: Vec, b: Vec) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

export const cross = (a: Vec, b: Vec): Vec => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];

export const norm = (a: Vec): Vec => {
  const l = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};

/** Great-circle interpolation between unit vectors. */
export function slerpVec(a: Vec, b: Vec, t: number): Vec {
  const d = Math.min(1, Math.max(-1, dot(a, b)));
  const om = Math.acos(d);
  if (om < 1e-4) return a;
  const s = Math.sin(om);
  const ka = Math.sin((1 - t) * om) / s;
  const kb = Math.sin(t * om) / s;
  return norm([
    a[0] * ka + b[0] * kb,
    a[1] * ka + b[1] * kb,
    a[2] * ka + b[2] * kb,
  ]);
}

export function mulQ(a: Quat, b: Quat): Quat {
  return [
    a[0] * b[0] - a[1] * b[1] - a[2] * b[2] - a[3] * b[3],
    a[0] * b[1] + a[1] * b[0] + a[2] * b[3] - a[3] * b[2],
    a[0] * b[2] - a[1] * b[3] + a[2] * b[0] + a[3] * b[1],
    a[0] * b[3] + a[1] * b[2] - a[2] * b[1] + a[3] * b[0],
  ];
}

export function rotate(q: Quat, v: Vec): Vec {
  const [w, x, y, z] = q;
  // v' = v + 2w(u×v) + 2u×(u×v), u = (x,y,z)
  const u: Vec = [x, y, z];
  const c1 = cross(u, v);
  const c2 = cross(u, c1);
  return [
    v[0] + 2 * (w * c1[0] + c2[0]),
    v[1] + 2 * (w * c1[1] + c2[1]),
    v[2] + 2 * (w * c1[2] + c2[2]),
  ];
}

/** Shortest rotation taking unit vector a onto b. */
export function fromTo(a: Vec, b: Vec): Quat {
  const d = dot(a, b);
  if (d > 0.99999) return IDENTITY;
  if (d < -0.99999) return [0, 0, 1, 0]; // 180° about y
  const c = cross(a, b);
  const w = 1 + d;
  const l = Math.hypot(w, c[0], c[1], c[2]);
  return [w / l, c[0] / l, c[1] / l, c[2] / l];
}

export function slerpQ(a: Quat, b: Quat, t: number): Quat {
  let d = a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3];
  let bb = b;
  if (d < 0) {
    d = -d;
    bb = [-b[0], -b[1], -b[2], -b[3]];
  }
  if (d > 0.9995) {
    const r: Quat = [
      a[0] + (bb[0] - a[0]) * t,
      a[1] + (bb[1] - a[1]) * t,
      a[2] + (bb[2] - a[2]) * t,
      a[3] + (bb[3] - a[3]) * t,
    ];
    const l = Math.hypot(...r);
    return [r[0] / l, r[1] / l, r[2] / l, r[3] / l];
  }
  const om = Math.acos(d);
  const s = Math.sin(om);
  const ka = Math.sin((1 - t) * om) / s;
  const kb = Math.sin(t * om) / s;
  return [
    a[0] * ka + bb[0] * kb,
    a[1] * ka + bb[1] * kb,
    a[2] * ka + bb[2] * kb,
    a[3] * ka + bb[3] * kb,
  ];
}

export function axisAngle(axis: Vec, angle: number): Quat {
  const s = Math.sin(angle / 2);
  const n = norm(axis);
  return [Math.cos(angle / 2), n[0] * s, n[1] * s, n[2] * s];
}

/** Deterministic 0..1 random stream from a string (stable layouts). */
export function seeded(seed: string): () => number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  let s = h >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
