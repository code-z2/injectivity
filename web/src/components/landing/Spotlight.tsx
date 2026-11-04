import { useNavigate } from "@tanstack/react-router";
import { ArrowRight, Settings2, Sparkles } from "lucide-react";
import { motion, useAnimationControls } from "motion/react";
import { useEffect, useRef, useState } from "react";
import {
  ORB,
  ORB_BODY_CSS,
  ORB_BOUNCE_CSS,
  ORB_SPEC_CSS,
} from "@/components/brand/orb";
import { SettingsDialog } from "@/components/SettingsDialog";
import { ThemeToggle } from "../ThemeToggle";
import { CHAIN_META } from "@/lib/chains";
import { looksLikeEns } from "@/lib/ens";
import { lookupErrorMessage, preloadInvestigation } from "@/lib/preload";
import { CHAINS, type Chain, searchExploits } from "@/lib/api";
import { saveSettings, useSettings } from "@/lib/settings";
import { SUGGESTIONS, type Suggestion } from "@/lib/suggestions";
import { ADDRESS_RE, cn, short } from "@/lib/utils";
import { ThinkingOrb, type ThinkingPhase } from "./ThinkingOrb";

// The landing spotlight. A zero-size anchor at the stage centre, where the
// wordmark sequence lands its orb. Stages:
//   hidden → orb    the orb blooms where the dot ring closed
//   orb → field     the search field opens out from behind the orb while
//                   the orb grows into the send button and slides to the
//                   field's right edge
//   field → ready   placeholder, chips, suggestions and focus arrive last
// On submit the orb shrinks to a core and blooms into the thinking swirl
// while the first view loads. Success: the swirl holds for at least
// MIN_THINK_OK, then collapses into its centre and the terminal opens
// already filled. Failure (after MIN_THINK_FAIL): the orb grows back and
// the field shakes; that nudge is the whole message on screen (the reason
// is announced to screen readers only).

export type SpotlightStage = "hidden" | "orb" | "field" | "ready";

// Field, button and inset sizes: full, and compact for narrow screens.
const SIZES = {
  full: { field: 76, btn: 60, inset: 8 },
  compact: { field: 62, btn: 48, inset: 7 },
};
const EASE = [0.22, 1, 0.36, 1] as const;
const MIN_THINK_OK = 5000;
const MIN_THINK_FAIL = 1600;

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
  const matches = useExploitSearch(query);
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

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!ready || busy) return;
    const v = query.trim();
    if (!v) {
      inputRef.current?.focus();
      return;
    }
    if (!ADDRESS_RE.test(v) && !looksLikeEns(v) && matches?.[0]) {
      pick(matches[0]);
      return;
    }
    if (!ADDRESS_RE.test(v) && !looksLikeEns(v)) {
      shakeField();
      inputRef.current?.focus();
      return;
    }
    void trace(v, settings.chain);
  }

  // A suggestion fills the field, switches to its chain and traces it.
  function pick(s: Suggestion) {
    if (!ready || busy) return;
    setQuery(s.address);
    if (s.chain !== settings.chain) saveSettings({ chain: s.chain });
    void trace(s.address, s.chain);
  }

  async function trace(v: string, chain: Chain) {
    setError("");
    setThink("think");
    const started = performance.now();
    const hold = (min: number) =>
      new Promise((r) =>
        setTimeout(r, Math.max(0, min - (performance.now() - started))),
      );
    try {
      await preloadInvestigation(chain, v);
      await hold(MIN_THINK_OK);
      after.current = () =>
        void navigate({
          to: "/investigate/$chain/$target",
          params: { chain, target: v },
        });
      setThink("in");
    } catch (err) {
      await hold(MIN_THINK_FAIL);
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
          className="absolute rounded-full border border-glass-edge/80 bg-glass/75 shadow-console backdrop-blur-xl"
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
            data-tour="search"
            ref={inputRef}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              if (error) setError("");
            }}
            disabled={!ready || busy}
            placeholder={
              compact
                ? "Address, ENS or exploit"
                : "Enter a wallet address, ENS name or exploit"
            }
            spellCheck={false}
            autoComplete="off"
            autoCapitalize="off"
            aria-label="Wallet address, ENS name or exploit"
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
          data-tour="submit"
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

      {/* Why a lookup failed: announced, not shown (the shake says it). */}
      <p className="sr-only" aria-live="polite">
        {error}
      </p>

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
          className="flex items-center gap-1.5 pr-2"
          initial={false}
          animate={ready ? shown : hiddenChip}
          transition={{ ...chipTransition, delay: ready ? 0.22 : 0 }}
        >
          <ThemeToggle className="border border-glass-edge/70 bg-glass/55 shadow-hairline backdrop-blur-md hover:bg-glass/80" />
          <SettingsDialog
            trigger={
              <button
                data-tour="settings"
                aria-label="Settings"
                className="flex size-8 items-center justify-center rounded-full border border-glass-edge/70 bg-glass/55 text-ink-soft shadow-hairline backdrop-blur-md transition-colors hover:bg-glass/80 hover:text-ink"
              >
                <Settings2 className="size-4" />
              </button>
            }
          />
        </motion.div>
      </div>

      {/* Suggestions: known exploiter wallets to start from. */}
      <motion.div
        data-tour="examples"
        className="absolute"
        style={{
          left: -fieldW / 2,
          top: FIELD_H / 2 + 14 + 32 + 18,
          width: fieldW,
        }}
        initial={false}
        animate={ready ? shown : hiddenChip}
        transition={{ ...chipTransition, delay: ready ? 0.34 : 0 }}
      >
        <div
          className={cn(
            "rounded-2xl border border-glass-edge/70 bg-glass/50 p-1.5 shadow-hairline backdrop-blur-md transition-opacity duration-300",
            busy && "opacity-50",
          )}
        >
          <p className="px-3 pt-1.5 pb-1 text-[11.5px] text-faint">
            {matches === null
              ? "Start from a known exploit"
              : matches.length
                ? "Matches in our exploit data"
                : "No match in our exploit data"}
          </p>
          <ul>
            {(matches ?? SUGGESTIONS).slice(0, compact ? 3 : 6).map((s) => (
              <li key={`${s.chain}:${s.address}`}>
                <button
                  type="button"
                  onClick={() => pick(s)}
                  disabled={!ready || busy}
                  className="flex h-9 w-full items-center gap-2.5 rounded-xl px-3 text-left transition-colors hover:bg-glass/80 disabled:pointer-events-none"
                >
                  <span className="size-2 shrink-0 rounded-full bg-attacker" />
                  <span className="min-w-0 flex-1 truncate text-[13px] text-ink">
                    {s.label}
                  </span>
                  <span
                    className="size-1.5 shrink-0 rounded-full"
                    style={{ backgroundColor: CHAIN_META[s.chain].dot }}
                    title={CHAIN_META[s.chain].label}
                  />
                  <span className="font-mono text-[12px] text-muted">
                    {short(s.address)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      </motion.div>
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
      className="flex h-8 items-center gap-1.5 rounded-full border border-glass-edge/70 bg-glass/55 px-3 text-[12.5px] text-ink-soft shadow-hairline backdrop-blur-md"
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

/**
 * The quick list's search: anything that isn't an address or ENS name is
 * looked up in the curated exploits (debounced), and each attacker address
 * becomes a row. null means not searching (show the starting points).
 */
function useExploitSearch(query: string): Suggestion[] | null {
  const q = query.trim();
  const searching = q.length >= 2 && !ADDRESS_RE.test(q) && !looksLikeEns(q);
  const [rows, setRows] = useState<Suggestion[] | null>(null);
  useEffect(() => {
    if (!searching) {
      setRows(null);
      return;
    }
    const ctl = new AbortController();
    const t = setTimeout(() => {
      searchExploits(q, ctl.signal)
        .then((results) =>
          setRows(
            results.flatMap((e) =>
              e.attackers
                .filter((a) => (CHAINS as string[]).includes(a.chain))
                .map((a) => ({
                  label: `${e.protocol} · ${a.role}`,
                  address: a.address,
                  chain: a.chain as Chain,
                  seedId: `${e.protocol} ${e.date}`,
                })),
            ),
          ),
        )
        .catch(() => !ctl.signal.aborted && setRows([]));
    }, 220);
    return () => {
      clearTimeout(t);
      ctl.abort();
    };
  }, [q, searching]);
  return searching ? rows : null;
}
