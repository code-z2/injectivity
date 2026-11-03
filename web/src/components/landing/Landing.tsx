import { useEffect, useRef, useState } from "react";
import { ORB_R, WordmarkSequence } from "@/components/brand/WordmarkSequence";
import { Aurora, type AuroraSky } from "./Aurora";
import { Spotlight, type SpotlightStage } from "./Spotlight";
import { StatusBar } from "./StatusBar";
import { Underlay } from "./Underlay";
import { usePeekLens } from "./usePeekLens";

// Landing: the wordmark plays centred on the aurora, its orb becomes the
// spotlight's send button, then the chips and status arrive last.
// Hidden in the aurora is line art of the on-chain world (blocks, locks,
// graphs, exploit code); it surfaces softly around the cursor and fades
// out with no edge, so the visitor feels they are peeking beneath.
// `?sky=night` keeps the dark aurora for reference.

const HOLD = 700; // read the wordmark before it starts moving
const ORB_TO_FIELD = 450; // orb settles, then the field opens
const FIELD_TO_READY = 750;

const DRIFT = 40; // underlay overscan for the parallax drift

// The intro plays once per page load. Returning to "/" from another page
// (same JS session) opens straight onto the ready spotlight; a reload
// plays it again. Set when the intro completes, so React StrictMode's
// double effect in dev cannot mark it played before it has run.
let introPlayed = false;

function useViewport(): { w: number; h: number } {
  const [v, setV] = useState(() => ({ w: innerWidth, h: innerHeight }));
  useEffect(() => {
    const on = () => setV({ w: innerWidth, h: innerHeight });
    window.addEventListener("resize", on);
    return () => window.removeEventListener("resize", on);
  }, []);
  return v;
}

export function Landing() {
  const sky: AuroraSky =
    new URLSearchParams(window.location.search).get("sky") === "night"
      ? "night"
      : "pearl";
  const { w: vw, h: vh } = useViewport();
  const artRef = useRef<HTMLDivElement>(null);
  const driftRef = useRef<HTMLDivElement>(null);
  usePeekLens(artRef, driftRef);
  const scale = Math.min(2.2, Math.max(1.3, (vw - 48) / 175));
  const fieldW = Math.min(720, vw - 32);
  const [seq, setSeq] = useState<"word" | "orb">(introPlayed ? "orb" : "word");
  const [stage, setStage] = useState<SpotlightStage>(
    introPlayed ? "ready" : "hidden",
  );
  const timers = useRef<number[]>([]);

  useEffect(() => {
    if (introPlayed) return;
    const reduce = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    if (reduce) {
      introPlayed = true;
      setSeq("orb");
      setStage("ready");
      return;
    }
    const t = window.setTimeout(() => setSeq("orb"), HOLD);
    return () => {
      clearTimeout(t);
      timers.current.forEach(clearTimeout);
    };
  }, []);

  function onOrbBloom() {
    setStage((s) => (s === "hidden" ? "orb" : s));
    timers.current.push(
      window.setTimeout(() => setStage("field"), ORB_TO_FIELD),
      window.setTimeout(() => {
        introPlayed = true;
        setStage("ready");
      }, ORB_TO_FIELD + FIELD_TO_READY),
    );
  }

  return (
    <main
      className={`relative h-svh w-full overflow-hidden ${sky === "night" ? "bg-[#050812]" : "bg-canvas"}`}
    >
      <Aurora className="absolute inset-0" sky={sky} />
      {/* Line art over the sky, multiplied into its tint, revealed only
          around the cursor (hidden until the pointer moves). */}
      <div
        ref={artRef}
        className="pointer-events-none absolute inset-0 opacity-75 mix-blend-multiply"
        style={{
          maskImage: "linear-gradient(transparent, transparent)",
          WebkitMaskImage: "linear-gradient(transparent, transparent)",
        }}
      >
        <div
          ref={driftRef}
          className="absolute will-change-transform"
          style={{ inset: -DRIFT }}
        >
          <Underlay width={vw + DRIFT * 2} height={vh + DRIFT * 2} />
        </div>
      </div>
      <h1 className="sr-only">Intel Terminal</h1>

      <div className="absolute top-[46%] left-1/2">
        <WordmarkSequence
          state={seq}
          scale={scale}
          align="center"
          showOrb={false}
          onOrbBloom={onOrbBloom}
        />
        <Spotlight stage={stage} orbD={ORB_R * 2 * scale} fieldW={fieldW} />
      </div>

      <StatusBar show={stage === "ready"} />
    </main>
  );
}
