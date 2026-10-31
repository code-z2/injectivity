// One source for the orb's look, shared by the SVG mark, the landing's
// HTML send button and the thinking-orb canvas, so the hand-offs between
// them are pixel-identical. Soft graphite, not pure black: a key light
// top-left falling to deep charcoal, a bounce light at the base, a
// specular highlight and a hairline rim.
export const ORB = {
  key: "#737985",
  mid: "#30353e",
  deep: "#15181d",
  shadowAlpha: 0.26,
  haloAlpha: 0.16,
  bounceAlpha: 0.16,
  specAlpha: 0.8,
  rimAlpha: 0.08,
};

// Gradient geometry as fractions of the orb's 2R box (CSS percentages).
export const ORB_BODY_AT = { x: 0.38, y: 0.32 };
export const ORB_BOUNCE_AT = { x: 0.55, y: 1 };
export const ORB_SPEC = { x: 0.34, y: 0.26, rx: 0.34, ry: 0.22 };

export const ORB_BODY_CSS = `radial-gradient(circle at 38% 32%, ${ORB.key} 0%, ${ORB.mid} 45%, ${ORB.deep} 100%)`;
export const ORB_BOUNCE_CSS = `radial-gradient(circle at 55% 100%, rgb(255 255 255 / ${ORB.bounceAlpha}), transparent 55%)`;
export const ORB_SPEC_CSS = `radial-gradient(ellipse 34% 22% at 34% 26%, rgb(255 255 255 / ${ORB.specAlpha}), transparent)`;

// Build a painter for the orb's surface centred at (cx, cy), radius R:
// identical to the CSS layers above. Gradients are created once; each
// call paints into whatever path is currently clipped on ctx (so a canvas
// can show the one orb's shading through many separate pieces).
export function createOrbPainter(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  R: number,
): () => void {
  const x0 = cx - R;
  const y0 = cy - R;
  const d = 2 * R;
  // CSS `circle` defaults to farthest-corner sizing.
  const far = (fx: number, fy: number) =>
    Math.hypot(Math.max(fx, 1 - fx) * d, Math.max(fy, 1 - fy) * d);

  const bx = x0 + ORB_BODY_AT.x * d;
  const by = y0 + ORB_BODY_AT.y * d;
  const body = ctx.createRadialGradient(
    bx,
    by,
    0,
    bx,
    by,
    far(ORB_BODY_AT.x, ORB_BODY_AT.y),
  );
  body.addColorStop(0, ORB.key);
  body.addColorStop(0.45, ORB.mid);
  body.addColorStop(1, ORB.deep);

  const ux = x0 + ORB_BOUNCE_AT.x * d;
  const uy = y0 + ORB_BOUNCE_AT.y * d;
  const bounce = ctx.createRadialGradient(
    ux,
    uy,
    0,
    ux,
    uy,
    far(ORB_BOUNCE_AT.x, ORB_BOUNCE_AT.y) * 0.55,
  );
  bounce.addColorStop(0, `rgba(255,255,255,${ORB.bounceAlpha})`);
  bounce.addColorStop(1, "rgba(255,255,255,0)");

  // Specular: an ellipse, drawn as a circle under a scale transform.
  const sx = x0 + ORB_SPEC.x * d;
  const sy = y0 + ORB_SPEC.y * d;
  const rx = ORB_SPEC.rx * d;
  const ry = ORB_SPEC.ry * d;
  const spec = ctx.createRadialGradient(0, 0, 0, 0, 0, rx);
  spec.addColorStop(0, `rgba(255,255,255,${ORB.specAlpha})`);
  spec.addColorStop(1, "rgba(255,255,255,0)");

  return () => {
    ctx.fillStyle = body;
    ctx.fillRect(x0 - R, y0 - R, d * 2, d * 2);
    ctx.fillStyle = bounce;
    ctx.fillRect(x0 - R, y0 - R, d * 2, d * 2);
    ctx.save();
    ctx.translate(sx, sy);
    ctx.scale(1, ry / rx);
    ctx.fillStyle = spec;
    ctx.fillRect(-rx, -rx, rx * 2, rx * 2);
    ctx.restore();
  };
}
