import { useEffect, useRef } from "react";

// Hero atmosphere, two canvases:
//  1. A tiny gradient field (aurora / mint / lilac / ion) drifting slowly,
//     upscaled under a heavy CSS blur — the soft wash behind everything.
//  2. A dotted globe rising from the bottom edge with fund-flow arcs
//     travelling between wallets; a few endpoints are flagged red.
// Static single frame under prefers-reduced-motion; paused off-screen.

const BLOBS = [
  { c: [158, 220, 255], x: 0.22, y: 0.3, r: 0.55, sx: 0.00021, sy: 0.00017 },
  { c: [196, 241, 223], x: 0.78, y: 0.25, r: 0.5, sx: 0.00015, sy: 0.00023 },
  { c: [217, 212, 255], x: 0.6, y: 0.75, r: 0.6, sx: 0.00019, sy: 0.00012 },
  { c: [197, 210, 255], x: 0.3, y: 0.8, r: 0.45, sx: 0.00013, sy: 0.0002 },
] as const;

const DOTS = 2600;
const ARCS = 8;

interface Arc {
  a: number;
  b: number;
  t: number;
  speed: number;
  flagged: boolean;
}

function fibonacciSphere(n: number): [number, number, number][] {
  const pts: [number, number, number][] = [];
  const phi = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < n; i++) {
    const y = 1 - (i / (n - 1)) * 2;
    const r = Math.sqrt(1 - y * y);
    const th = phi * i;
    pts.push([Math.cos(th) * r, y, Math.sin(th) * r]);
  }
  return pts;
}

export function HeroField() {
  const washRef = useRef<HTMLCanvasElement>(null);
  const globeRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const wash = washRef.current!;
    const globe = globeRef.current!;
    const wctx = wash.getContext("2d")!;
    const gctx = globe.getContext("2d")!;
    const reduce = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    const pts = fibonacciSphere(DOTS);

    // Arc endpoints only on the upper, camera-facing cap so they read.
    const candidates = pts
      .map((p, i) => ({ p, i }))
      .filter(({ p }) => p[1] > 0.2)
      .map(({ i }) => i);
    const pick = () =>
      candidates[Math.floor(Math.random() * candidates.length)]!;
    // Second endpoint within ~40° of the first: short local hops read as
    // fund flows; antipodal loops read as noise.
    const near = (a: number) => {
      const pa = pts[a]!;
      for (let k = 0; k < 40; k++) {
        const b = pick();
        const pb = pts[b]!;
        const dot = pa[0] * pb[0] + pa[1] * pb[1] + pa[2] * pb[2];
        if (b !== a && dot > 0.77 && dot < 0.97) return b;
      }
      return pick();
    };
    const newArc = (t = 0): Arc => {
      const a = pick();
      return {
        a,
        b: near(a),
        t,
        speed: 0.0028 + Math.random() * 0.0022,
        flagged: Math.random() < 0.22,
      };
    };
    const arcs: Arc[] = Array.from({ length: ARCS }, () =>
      newArc(Math.random()),
    );

    let w = 0;
    let h = 0;
    let dpr = 1;
    const resize = () => {
      const rect = globe.getBoundingClientRect();
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = rect.width;
      h = rect.height;
      globe.width = Math.round(w * dpr);
      globe.height = Math.round(h * dpr);
      gctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      wash.width = 96;
      wash.height = Math.max(32, Math.round((96 * h) / Math.max(w, 1)));
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(globe);

    const drawWash = (time: number) => {
      const ww = wash.width;
      const wh = wash.height;
      wctx.fillStyle = "#f7f8fa";
      wctx.fillRect(0, 0, ww, wh);
      for (const b of BLOBS) {
        const x = (b.x + Math.sin(time * b.sx) * 0.12) * ww;
        const y = (b.y + Math.cos(time * b.sy) * 0.12) * wh;
        const r = b.r * Math.max(ww, wh);
        const g = wctx.createRadialGradient(x, y, 0, x, y, r);
        g.addColorStop(0, `rgba(${b.c.join(",")},0.62)`);
        g.addColorStop(1, `rgba(${b.c.join(",")},0)`);
        wctx.fillStyle = g;
        wctx.fillRect(0, 0, ww, wh);
      }
    };

    const drawGlobe = (time: number) => {
      gctx.clearRect(0, 0, w, h);
      const R = Math.min(w < 640 ? w * 0.7 : w * 0.36, h * 0.66, 560);
      const cx = w / 2;
      const cy = h + R * 0.3;
      const rot = time * 0.00004;
      const tilt = -0.32;
      const cosR = Math.cos(rot);
      const sinR = Math.sin(rot);
      const cosT = Math.cos(tilt);
      const sinT = Math.sin(tilt);

      const proj = new Float32Array(DOTS * 3);
      for (let i = 0; i < DOTS; i++) {
        const [x0, y0, z0] = pts[i]!;
        const x1 = x0 * cosR + z0 * sinR;
        const z1 = -x0 * sinR + z0 * cosR;
        const y2 = y0 * cosT - z1 * sinT;
        const z2 = y0 * sinT + z1 * cosT;
        proj[i * 3] = cx + x1 * R;
        proj[i * 3 + 1] = cy - y2 * R;
        proj[i * 3 + 2] = z2;
      }

      for (let i = 0; i < DOTS; i++) {
        const z = proj[i * 3 + 2]!;
        if (z < -0.15) continue;
        const a = 0.07 + Math.max(0, z) * 0.42;
        gctx.fillStyle = `rgba(11,13,18,${a.toFixed(3)})`;
        const s = 0.9 + Math.max(0, z) * 1.1;
        gctx.fillRect(proj[i * 3]! - s / 2, proj[i * 3 + 1]! - s / 2, s, s);
      }

      for (const arc of arcs) {
        const ax = proj[arc.a * 3]!;
        const ay = proj[arc.a * 3 + 1]!;
        const bx = proj[arc.b * 3]!;
        const by = proj[arc.b * 3 + 1]!;
        if (proj[arc.a * 3 + 2]! < 0 || proj[arc.b * 3 + 2]! < 0) continue;
        const mx = (ax + bx) / 2;
        const my = (ay + by) / 2;
        const lift = Math.hypot(bx - ax, by - ay) * 0.55 + 18;
        const qx = mx + ((mx - cx) / R) * lift * 0.4;
        const qy = my - lift;
        const fade = Math.sin(Math.min(arc.t, 1) * Math.PI);

        gctx.strokeStyle = `rgba(11,13,18,${(0.14 * fade).toFixed(3)})`;
        gctx.lineWidth = 1;
        gctx.beginPath();
        gctx.moveTo(ax, ay);
        gctx.quadraticCurveTo(qx, qy, bx, by);
        gctx.stroke();

        const t = Math.min(arc.t * 1.25, 1);
        const px = (1 - t) ** 2 * ax + 2 * (1 - t) * t * qx + t * t * bx;
        const py = (1 - t) ** 2 * ay + 2 * (1 - t) * t * qy + t * t * by;
        const head = arc.flagged ? "229,72,77" : "47,91,255";
        const glow = gctx.createRadialGradient(px, py, 0, px, py, 10);
        glow.addColorStop(0, `rgba(${head},${(0.35 * fade).toFixed(3)})`);
        glow.addColorStop(1, `rgba(${head},0)`);
        gctx.fillStyle = glow;
        gctx.fillRect(px - 10, py - 10, 20, 20);
        gctx.fillStyle = `rgba(${head},${(0.95 * fade).toFixed(3)})`;
        gctx.beginPath();
        gctx.arc(px, py, 2, 0, Math.PI * 2);
        gctx.fill();

        for (const [ex, ey, red] of [
          [ax, ay, false],
          [bx, by, arc.flagged],
        ] as const) {
          gctx.fillStyle = red
            ? `rgba(229,72,77,${(0.9 * fade).toFixed(3)})`
            : `rgba(11,13,18,${(0.55 * fade).toFixed(3)})`;
          gctx.beginPath();
          gctx.arc(ex, ey, red ? 2.6 : 1.8, 0, Math.PI * 2);
          gctx.fill();
        }

        if (!reduce) {
          arc.t += arc.speed;
          if (arc.t >= 1) Object.assign(arc, newArc());
        }
      }
    };

    let raf = 0;
    let visible = true;
    const loop = (time: number) => {
      drawWash(time);
      drawGlobe(time);
      if (!reduce && visible) raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    const io = new IntersectionObserver(([entry]) => {
      const was = visible;
      visible = !!entry?.isIntersecting && !document.hidden;
      if (visible && !was && !reduce) raf = requestAnimationFrame(loop);
    });
    io.observe(globe);
    const onVis = () => {
      const was = visible;
      visible = !document.hidden;
      if (visible && !was && !reduce) raf = requestAnimationFrame(loop);
    };
    document.addEventListener("visibilitychange", onVis);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      io.disconnect();
      document.removeEventListener("visibilitychange", onVis);
    };
  }, []);

  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 overflow-hidden"
    >
      <canvas
        ref={washRef}
        className="absolute -inset-[8%] h-[116%] w-[116%] blur-[36px] saturate-[1.15]"
      />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_50%_38%,rgb(255_255_255/0.82),transparent_66%)]" />
      <canvas ref={globeRef} className="absolute inset-0 h-full w-full" />
    </div>
  );
}
