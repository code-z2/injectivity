import { useNavigate } from "@tanstack/react-router";
import { ArrowRight, Settings2, Sparkles } from "lucide-react";
import { AnimatePresence, motion, useAnimationControls } from "motion/react";
import { useEffect, useRef, useState } from "react";
import {
  ORB,
  ORB_BODY_CSS,
  ORB_BOUNCE_CSS,
  ORB_SPEC_CSS,
} from "@/components/brand/orb";
import { SettingsDialog } from "@/components/SettingsDialog";
import { CHAIN_META } from "@/lib/chains";
import { looksLikeEns } from "@/lib/ens";
import { lookupErrorMessage, preloadInvestigation } from "@/lib/preload";
import { useSettings } from "@/lib/settings";
import { ADDRESS_RE, cn } from "@/lib/utils";
import { ThinkingOrb, type ThinkingPhase } from "./ThinkingOrb";

// The landing spotlight. A zero-size anchor at the stage centre, where the
// wordmark sequence lands its orb. Stages:
//   hidden → orb    the orb blooms where the dot ring closed
//   orb → field     the search field opens out from behind the orb while
//                   the orb grows into the send button and slides to the
//                   field's right edge
//   field → ready   placeholder, chips and focus arrive last
// On submit the orb shrinks to a core and blooms into the thinking swirl
// while the first view loads (at least MIN_THINK). Success: the swirl
// collapses into its centre and the terminal opens already filled.
// Failure: after the collapse the orb grows back, the field shakes and the
// reason shows underneath.

export type SpotlightStage = "hidden" | "orb" | "field" | "ready";

// Field, button and inset sizes: full, and compact for narrow screens.
const SIZES = {
  full: { field: 76, btn: 60, inset: 8 },
  compact: { field: 62, btn: 48, inset: 7 },
};
const EASE = [0.22, 1, 0.36, 1] as const;
const MIN_THINK = 1600;

export function Spotlight({
  stage,
  orbD,
  fieldW,
}: {
  stage: SpotlightStage;
  orbD: number;
  fieldW: number;
}) {
  const settings = useSettings();
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [think, setThink] = useState<ThinkingPhase>("off");
  const [error, setError] = useState("");
  const after = useRef<() => void>(() => {});
  const inputRef = useRef<HTMLInputElement>(null);
  const shake = useAnimationControls();
  const compact = fieldW < 480;
  const {
    field: FIELD_H,
    btn: BTN,
    inset: INSET,
  } = SIZES[compact ? "compact" : "full"];
  const open = stage === "field" || stage === "ready";
  const ready = stage === "ready";
  const busy = think !== "off";

  useEffect(() => {
    if (ready && window.matchMedia("(pointer: fine)").matches) {
      inputRef.current?.focus({ preventScroll: true });
    }
  }, [ready]);

  function shakeField() {
    // transitions.dev error shake: 8px / 6px segments.
    void shake.start({
      x: [0, -8, 8, -6, 6, 0],
      transition: { duration: 0.4, ease: "easeInOut" },
    });
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!ready || busy) return;
    const v = query.trim();
    if (!v) {
      inputRef.current?.focus();
      return;
    }
    if (!ADDRESS_RE.test(v) && !looksLikeEns(v)) {
      shakeField();
      inputRef.current?.focus();
      return;
    }
    const chain = settings.chain;
    setError("");
    setThink("think");
    const started = performance.now();
    const hold = () =>
      new Promise((r) =>
        setTimeout(r, Math.max(0, MIN_THINK - (performance.now() - started))),
      );
    try {
      await preloadInvestigation(chain, v);
      await hold();
      after.current = () =>
        void navigate({
          to: "/investigate/$chain/$target",
          params: { chain, target: v },
        });
      setThink("in");
    } catch (err) {
      await hold();
      after.current = () => {
        setThink("off");
        setError(lookupErrorMessage(err));
        shakeField();
        inputRef.current?.focus();
      };
      setThink("back");
    }
  }

  const orbBox = (d: number, x = -d / 2) => ({
    width: d,
    height: d,
    x,
    y: -d / 2,
  });

  return (
    <div className="relative size-0">
      <motion.form
        animate={shake}
        onSubmit={submit}
        className="absolute top-0 left-0"
        aria-label="Trace a wallet"
      >
        {/* The field: opens from the orb's footprint. */}
        <motion.div
          className="absolute rounded-full border border-white/80 bg-white/75 shadow-console backdrop-blur-xl"
          initial={false}
          animate={
            open
              ? {
                  width: fieldW,
                  height: FIELD_H,
                  x: -fieldW / 2,
                  y: -FIELD_H / 2,
                  opacity: 1,
                }
              : { ...orbBox(orbD), opacity: 0 }
          }
          transition={{ duration: 0.9, ease: EASE }}
        >
          <motion.input
            ref={inputRef}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              if (error) setError("");
            }}
            disabled={!ready || busy}
            placeholder={
              compact
                ? "Wallet address or ENS name"
                : "Enter a wallet address or an ENS name"
            }
            spellCheck={false}
            autoComplete="off"
            autoCapitalize="off"
            aria-label="Wallet address or ENS name"
            initial={false}
            animate={{ opacity: ready ? 1 : 0 }}
            transition={{ duration: 0.4, ease: "easeOut" }}
            className={cn(
              "absolute inset-y-0 left-0 w-full bg-transparent text-ink transition-colors duration-300 outline-none placeholder:text-faint disabled:text-ink/45",
              compact
                ? "pl-5 text-[16px]"
                : "pl-8 text-[18px] tracking-[-0.01em]",
              ADDRESS_RE.test(query.trim()) &&
                "font-mono text-[15px] tracking-normal",
            )}
            style={{ paddingRight: BTN + INSET * 2 }}
          />
        </motion.div>

        {/* The orb, then the send button. */}
        <motion.button
          type="submit"
          aria-label="Trace"
          className="absolute top-0 left-0 rounded-full outline-offset-4"
          initial={false}
          animate={
            stage === "hidden"
              ? { ...orbBox(orbD), scale: 0.35, opacity: 0 }
              : stage === "orb"
                ? { ...orbBox(orbD), scale: 1, opacity: 1 }
                : {
                    ...orbBox(BTN, fieldW / 2 - INSET - BTN),
                    scale: 1,
                    opacity: 1,
                  }
          }
          whileHover={ready && !busy ? { scale: 1.04 } : undefined}
          whileTap={ready && !busy ? { scale: 0.96 } : undefined}
          transition={
            stage === "orb"
              ? { duration: 0.75, ease: [0.16, 1, 0.3, 1] }
              : { duration: 0.9, ease: EASE }
          }
        >
          {/* While thinking, the canvas draws the orb (identically) and
              morphs it; the face here steps aside without a fade. */}
          <OrbFace solid={!busy} shadow={!busy} />
          <motion.span
            className="absolute inset-0 flex items-center justify-center text-white"
            initial={false}
            animate={{
              opacity: open && !busy ? 1 : 0,
              scale: open && !busy ? 1 : 0.6,
            }}
            transition={{
              duration: busy ? 0.15 : 0.45,
              ease: EASE,
              delay: open && !busy ? 0.3 : 0,
            }}
          >
            <ArrowRight
              className="size-[22px] drop-shadow-[0_1px_2px_rgb(11_13_18/0.25)]"
              strokeWidth={2.4}
            />
          </motion.span>
        </motion.button>

        {/* Thinking swirl, centred on the send orb. */}
        <div
          className="absolute top-0"
          style={{ left: fieldW / 2 - INSET - BTN / 2 }}
        >
          <ThinkingOrb
            phase={think}
            orbD={BTN}
            maxD={FIELD_H}
            onCollapsed={() => after.current()}
          />
        </div>
      </motion.form>

      {/* Why a lookup failed, under the chips. */}
      <div
        className="absolute text-center"
        style={{ left: -fieldW / 2, top: FIELD_H / 2 + 60, width: fieldW }}
        aria-live="polite"
      >
        <AnimatePresence>
          {error && (
            <motion.p
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.25, ease: EASE }}
              className="text-[13px] text-verified/85"
            >
              {error}
            </motion.p>
          )}
        </AnimatePresence>
      </div>

      {/* Chips: chain and model badges left, settings right. */}
      <div
        className="absolute flex items-center justify-between"
        style={{ left: -fieldW / 2, top: FIELD_H / 2 + 14, width: fieldW }}
      >
        <div className="flex items-center gap-2 pl-2">
          <Chip show={ready} i={0}>
            <span
              className="size-2 rounded-full"
              style={{ backgroundColor: CHAIN_META[settings.chain].dot }}
            />
            {CHAIN_META[settings.chain].label}
          </Chip>
          <Chip show={ready} i={1}>
            <Sparkles className="size-3.5 text-ion-500" />
            <span className="max-w-[16ch] truncate">
              {settings.model.trim() || "Muse Spark"}
            </span>
          </Chip>
        </div>
        <motion.div
          className="pr-2"
          initial={false}
          animate={ready ? shown : hiddenChip}
          transition={{ ...chipTransition, delay: ready ? 0.22 : 0 }}
        >
          <SettingsDialog
            trigger={
              <button
                aria-label="Settings"
                className="flex size-8 items-center justify-center rounded-full border border-white/70 bg-white/55 text-ink-soft shadow-hairline backdrop-blur-md transition-colors hover:bg-white/80 hover:text-ink"
              >
                <Settings2 className="size-4" />
              </button>
            }
          />
        </motion.div>
      </div>
    </div>
  );
}

const shown = { opacity: 1, y: 0, filter: "blur(0px)" };
const hiddenChip = { opacity: 0, y: 8, filter: "blur(3px)" };
const chipTransition = { duration: 0.5, ease: EASE };

function Chip({
  show,
  i,
  children,
}: {
  show: boolean;
  i: number;
  children: React.ReactNode;
}) {
  return (
    <motion.span
      initial={false}
      animate={show ? shown : hiddenChip}
      transition={{ ...chipTransition, delay: show ? 0.06 + i * 0.08 : 0 }}
      className="flex h-8 items-center gap-1.5 rounded-full border border-white/70 bg-white/55 px-3 text-[12.5px] text-ink-soft shadow-hairline backdrop-blur-md"
    >
      {children}
    </motion.span>
  );
}

// The orb in HTML, matching the SVG orb and the thinking canvas (shared
// palette in brand/orb.ts). The cast shadow and halo stay put while the
// canvas morphs the orb; the face is hidden one frame after the canvas
// has drawn its identical copy, and shown again the instant it hands back.
function OrbFace({ solid, shadow }: { solid: boolean; shadow: boolean }) {
  return (
    <span aria-hidden className="absolute inset-0">
      <span
        className="absolute inset-0 transition-opacity duration-300"
        style={{ opacity: shadow ? 1 : 0 }}
      >
        <span
          className="absolute inset-x-[14%] -bottom-[18%] h-[22%] rounded-full blur-[6px]"
          style={{ backgroundColor: `rgb(11 13 18 / ${ORB.shadowAlpha})` }}
        />
        <span
          className="absolute inset-0 scale-105 rounded-full blur-[12px]"
          style={{ backgroundColor: `rgb(11 13 18 / ${ORB.haloAlpha})` }}
        />
      </span>
      <span
        className="absolute inset-0"
        style={{
          opacity: solid ? 1 : 0,
          transition: solid ? "none" : "opacity 0s linear 40ms",
        }}
      >
        <span
          className="absolute inset-0 rounded-full"
          style={{ background: ORB_BODY_CSS }}
        />
        <span
          className="absolute inset-0 rounded-full"
          style={{ background: ORB_BOUNCE_CSS }}
        />
        <span
          className="absolute inset-0 rounded-full"
          style={{ background: ORB_SPEC_CSS }}
        />
        <span
          className="absolute inset-0 rounded-full"
          style={{
            boxShadow: `inset 0 0 0 1px rgb(255 255 255 / ${ORB.rimAlpha})`,
          }}
        />
      </span>
    </span>
  );
}
