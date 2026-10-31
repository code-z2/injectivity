import { useEffect, useRef, useState } from "react";
import { ORB_R, WordmarkSequence } from "@/components/brand/WordmarkSequence";
import { Aurora, type AuroraSky } from "./Aurora";
import { Spotlight, type SpotlightStage } from "./Spotlight";
import { StatusBar } from "./StatusBar";

// Landing: the wordmark plays centred on the aurora, its orb becomes the
// spotlight's send button, then the chips and status arrive last.
// `?sky=night` keeps the dark aurora for reference.

const HOLD = 700; // read the wordmark before it starts moving
const ORB_TO_FIELD = 450; // orb settles, then the field opens
const FIELD_TO_READY = 750;

function useViewportWidth(): number {
  const [w, setW] = useState(() => window.innerWidth);
  useEffect(() => {
    const on = () => setW(window.innerWidth);
    window.addEventListener("resize", on);
    return () => window.removeEventListener("resize", on);
  }, []);
  return w;
}

export function Landing() {
  const sky: AuroraSky =
    new URLSearchParams(window.location.search).get("sky") === "night"
      ? "night"
      : "pearl";
  const vw = useViewportWidth();
  const scale = Math.min(2.2, Math.max(1.3, (vw - 48) / 175));
  const fieldW = Math.min(720, vw - 32);
  const [seq, setSeq] = useState<"word" | "orb">("word");
  const [stage, setStage] = useState<SpotlightStage>("hidden");
  const timers = useRef<number[]>([]);

  useEffect(() => {
    const reduce = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    if (reduce) {
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
      window.setTimeout(() => setStage("ready"), ORB_TO_FIELD + FIELD_TO_READY),
    );
  }

  return (
    <main
      className={`relative h-svh w-full overflow-hidden ${sky === "night" ? "bg-[#050812]" : "bg-canvas"}`}
    >
      <Aurora className="absolute inset-0" sky={sky} />
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
