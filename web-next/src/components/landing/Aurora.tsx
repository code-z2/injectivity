import { useEffect, useRef } from "react";

// A literal aurora: three light curtains, each with the sharp bright
// lower hem and soft upward fade of real aurorae, vertical ray striations
// drifting along the hem, and colour shifting from the hem (emerald) up
// through blue to violet and rose at the crown. Two skies:
//  - night: deep blue-black with faint twinkling stars; light is added
//    (additive, tone-mapped) so curtains genuinely glow.
//  - pearl: light theme; light is mixed over a pale sky with white cores.
// One WebGL fragment shader at reduced resolution (the image is soft, so
// it upscales cleanly). Constant slow motion; a frozen frame under
// prefers-reduced-motion; paused when off-screen or the tab is hidden.

// Palettes (sRGB, 0..1). Tune here.
export type AuroraSky = "night" | "pearl";

const SKIES: Record<
  AuroraSky,
  {
    top: number[];
    bottom: number[];
    hem: number[];
    mid: number[];
    crown: number[];
    blush: number[];
    fallback: string;
  }
> = {
  night: {
    top: [0.008, 0.012, 0.035], // #020309
    bottom: [0.03, 0.05, 0.1], // #080d1a
    hem: [0.12, 1.0, 0.62], // oxygen green
    mid: [0.1, 0.62, 1.0], // cyan-blue
    crown: [0.5, 0.28, 1.0], // violet
    blush: [1.0, 0.28, 0.62], // magenta, crown tips only
    fallback:
      "radial-gradient(120% 60% at 35% 70%, rgb(30 255 160 / 0.18), transparent 60%), radial-gradient(110% 60% at 70% 40%, rgb(128 72 255 / 0.18), transparent 60%), #050812",
  },
  pearl: {
    top: [0.925, 0.933, 0.965], // #eceef6
    bottom: [0.972, 0.976, 0.988], // #f8f9fc
    hem: [0.16, 0.88, 0.64], // emerald glow
    mid: [0.26, 0.62, 1.0], // electric sky
    crown: [0.55, 0.42, 1.0], // violet
    blush: [1.0, 0.48, 0.78], // rose
    fallback:
      "radial-gradient(120% 70% at 30% 70%, rgb(23 199 168 / 0.22), transparent 60%), radial-gradient(110% 60% at 70% 45%, rgb(143 92 250 / 0.2), transparent 60%), #f6f7fb",
  },
};

const SPEED = 0.014; // global time scale: slow, never still
const RESOLUTION = 0.5; // render scale vs CSS pixels × DPR(≤2)

const VERT = `
attribute vec2 a;
void main() { gl_Position = vec4(a, 0.0, 1.0); }
`;

const FRAG = `
precision highp float;
uniform vec2 uRes;
uniform float uTime;
uniform float uNight;
uniform vec3 uSkyTop, uSkyBottom, uHem, uMid, uCrown, uBlush;

float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x),
             mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
}
float fbm(vec2 p) {
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 5; i++) { v += a * noise(p); p = p * 2.03 + 11.7; a *= 0.5; }
  return v;
}

// One curtain: returns (intensity, height-in-curtain 0..1, hem core).
vec3 curtain(vec2 p, float t, float seed, float baseY, float amp) {
  // Hem line: big slow S-folds plus a finer ripple, domain-warped.
  float warp = fbm(vec2(p.x * 0.6 + seed, t * 0.5));
  float hem = baseY
    + amp * (fbm(vec2(p.x * 0.8 + t * 0.6 + seed, seed)) - 0.5) * 2.2
    + 0.07 * sin(p.x * 1.7 + t * 0.9 + seed * 5.0 + warp * 4.0);
  float d = p.y - hem;                  // > 0 above the hem
  // Long soft fade upward; taller on the night sky, where rays carry.
  float up = exp(-max(d, 0.0) * mix(3.0, 1.9, uNight));
  float down = exp(min(d, 0.0) * 34.0); // crisp lower edge
  float body = d >= 0.0 ? up : down;

  // Rays: fine, irregular striations, strongest at the hem and melting
  // into haze higher up, sliding slowly along the curtain.
  float rx = p.x * 15.0 + warp * 9.0 + t * 1.4 + seed * 9.0;
  float rays = smoothstep(0.28, 0.82, fbm(vec2(rx, p.y * 1.4 - t * 0.3)));
  float near = exp(-max(d, 0.0) * 5.0);
  float shimmer = mix(1.0, 0.55 + 0.6 * rays, 0.25 + 0.4 * near);

  // Curtains brighten and dim in slow pulses along their length.
  float pulse = smoothstep(0.28, 0.75, fbm(vec2(p.x * 0.5 - t * 0.8, seed * 3.0)));

  // White-hot core along the hem: on a light sky, glow reads as a bright
  // core inside a saturated halo, never as a darker line.
  float core = exp(-abs(d) * 60.0) * pulse;

  float h = clamp(d / 0.6, 0.0, 1.0);
  return vec3(body * shimmer * pulse, h, core);
}

vec3 auroraColor(float h) {
  vec3 c = mix(uHem, uMid, smoothstep(0.0, 0.35, h));
  c = mix(c, uCrown, smoothstep(0.3, 0.75, h));
  return mix(c, uBlush, smoothstep(0.7, 1.0, h) * 0.6);
}

void main() {
  vec2 uv = gl_FragCoord.xy / uRes;
  float aspect = uRes.x / uRes.y;
  vec2 p = vec2(uv.x * aspect, uv.y);
  float t = uTime;

  vec3 sky = mix(uSkyBottom, uSkyTop, uv.y);

  // Back to front: farther curtains are higher, fainter, slower.
  vec3 c1 = curtain(p * vec2(0.8, 1.0), t * 0.7, 3.1, 0.70, 0.12);
  vec3 c2 = curtain(p, t, 7.7, 0.50, 0.16);
  vec3 c3 = curtain(p * vec2(1.15, 1.0), t * 1.2, 1.3, 0.28, 0.11);
  float a1 = c1.x * 0.5, a2 = c2.x * 0.85, a3 = c3.x * 0.75;
  vec3 col;

  if (uNight > 0.5) {
    // Faint horizon airglow.
    sky += vec3(0.01, 0.035, 0.045) * exp(-uv.y * 4.0);

    // Stars: sparse cells, varied size, slow twinkle; aurora light
    // washes them out where it is bright.
    vec2 g = gl_FragCoord.xy / 1.6;
    vec2 cell = floor(g);
    float h = hash(cell);
    float star = 0.0;
    if (h > 0.985) {
      vec2 off = vec2(hash(cell + 7.1), hash(cell + 3.3)) - 0.5;
      float r = length(fract(g) - 0.5 - off * 0.5);
      float tw = 0.6 + 0.4 * sin(t * (6.0 + h * 20.0) + h * 300.0);
      star = smoothstep(0.35, 0.0, r) * (h - 0.985) / 0.015 * tw;
    }
    float lit = clamp(a1 + a2 + a3, 0.0, 1.0);
    col = sky + vec3(0.85, 0.9, 1.0) * star * 1.6 * (1.0 - lit) * (0.35 + 0.65 * uv.y);

    // Additive light, then a soft tone curve so bright folds never clip.
    vec3 light = auroraColor(c1.y) * a1 * 0.9
               + auroraColor(c2.y) * a2 * 1.3
               + auroraColor(c3.y) * a3 * 1.15;
    vec3 coreCol = mix(uHem, vec3(0.9, 1.0, 0.95), 0.55);
    light += coreCol * (c1.z * 0.5 + c2.z * 1.0 + c3.z * 0.8);
    light += mix(uHem, uMid, uv.y) * (a1 + a2 + a3) * 0.04; // wide haze
    col += light;
    col = 1.0 - exp(-col * 1.5);
  } else {
    col = sky;
    col = mix(col, auroraColor(c1.y), clamp(a1, 0.0, 1.0) * 0.55);
    col = mix(col, auroraColor(c2.y), clamp(a2, 0.0, 1.0) * 0.75);
    col = mix(col, auroraColor(c3.y), clamp(a3, 0.0, 1.0) * 0.7);
    col = mix(col, vec3(1.0), clamp(c1.z * 0.35 + c2.z * 0.6 + c3.z * 0.5, 0.0, 0.7));
    float glow = (a1 + a2 + a3) * 0.18;
    col = mix(col, mix(uMid, uCrown, uv.y), clamp(glow, 0.0, 0.25));
    // Keep the centre airy for the console that will sit there.
    float veil = smoothstep(0.75, 0.0, length((uv - vec2(0.5, 0.52)) * vec2(1.0, 1.6)));
    col = mix(col, sky, veil * 0.22);
  }

  // Dither to kill banding in the soft gradients.
  col += (hash(gl_FragCoord.xy + fract(t)) - 0.5) / 255.0;
  gl_FragColor = vec4(col, 1.0);
}
`;

function compile(gl: WebGLRenderingContext, type: number, src: string) {
  const s = gl.createShader(type)!;
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
    throw new Error(gl.getShaderInfoLog(s) ?? "shader compile failed");
  }
  return s;
}

export function Aurora({
  className,
  sky = "night",
}: {
  className?: string;
  sky?: AuroraSky;
}) {
  const palette = SKIES[sky];
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current!;
    const gl = canvas.getContext("webgl", {
      antialias: false,
      alpha: false,
      powerPreference: "low-power",
    });
    if (!gl) return; // CSS fallback gradient stays visible.

    let prog: WebGLProgram;
    try {
      prog = gl.createProgram()!;
      gl.attachShader(prog, compile(gl, gl.VERTEX_SHADER, VERT));
      gl.attachShader(prog, compile(gl, gl.FRAGMENT_SHADER, FRAG));
      gl.linkProgram(prog);
      gl.useProgram(prog);
    } catch (e) {
      console.error(e);
      return;
    }

    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 3, -1, -1, 3]),
      gl.STATIC_DRAW,
    );
    const loc = gl.getAttribLocation(prog, "a");
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

    const u = (n: string) => gl.getUniformLocation(prog, n);
    const uRes = u("uRes");
    const uTime = u("uTime");
    gl.uniform1f(u("uNight"), sky === "night" ? 1 : 0);
    gl.uniform3fv(u("uSkyTop"), palette.top);
    gl.uniform3fv(u("uSkyBottom"), palette.bottom);
    gl.uniform3fv(u("uHem"), palette.hem);
    gl.uniform3fv(u("uMid"), palette.mid);
    gl.uniform3fv(u("uCrown"), palette.crown);
    gl.uniform3fv(u("uBlush"), palette.blush);

    const resize = () => {
      const r = canvas.getBoundingClientRect();
      const scale = Math.min(window.devicePixelRatio || 1, 2) * RESOLUTION;
      canvas.width = Math.max(1, Math.round(r.width * scale));
      canvas.height = Math.max(1, Math.round(r.height * scale));
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.uniform2f(uRes, canvas.width, canvas.height);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    const reduce = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    // Random phase so every visit opens on a different sky.
    const phase = Math.random() * 1000;
    let raf = 0;
    let running = false;

    const draw = (ms: number) => {
      gl.uniform1f(uTime, phase + (reduce ? 0 : ms / 1000) * SPEED * 10);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      canvas.dataset.ready = "1";
      if (running) raf = requestAnimationFrame(draw);
    };
    const start = () => {
      if (running || reduce) return;
      running = true;
      raf = requestAnimationFrame(draw);
    };
    const stop = () => {
      running = false;
      cancelAnimationFrame(raf);
    };

    draw(0);
    start();

    let onScreen = true;
    const sync = () => (onScreen && !document.hidden ? start() : stop());
    const io = new IntersectionObserver(([e]) => {
      onScreen = !!e?.isIntersecting;
      sync();
    });
    io.observe(canvas);
    document.addEventListener("visibilitychange", sync);

    return () => {
      stop();
      ro.disconnect();
      io.disconnect();
      document.removeEventListener("visibilitychange", sync);
      // No loseContext(): the canvas keeps one context for its lifetime,
      // and a remount (StrictMode, HMR) must be able to reuse it.
      gl.deleteBuffer(buf);
      gl.deleteProgram(prog);
    };
  }, [sky, palette]);

  return (
    <div
      aria-hidden
      className={className}
      // Fallback when WebGL is unavailable.
      style={{ background: palette.fallback }}
    >
      <canvas
        ref={ref}
        className="size-full opacity-0 transition-opacity duration-[1200ms] ease-out data-ready:opacity-100"
      />
    </div>
  );
}
