import { useNavigate } from "@tanstack/react-router";
import {
  ArrowRight,
  AtSign,
  CircleAlert,
  CircleCheck,
  Loader2,
  Search,
} from "lucide-react";
import { AnimatePresence, motion, useAnimationControls } from "motion/react";
import { useEffect, useRef, useState } from "react";
import type { Chain } from "@/lib/api";
import { looksLikeEns } from "@/lib/ens";
import { saveSettings, useSettings } from "@/lib/settings";
import { ADDRESS_RE, cn } from "@/lib/utils";
import { ChainPicker } from "./ChainPicker";

type Detect =
  | { kind: "empty" }
  | { kind: "address" }
  | { kind: "ens" }
  | { kind: "partial"; have: number }
  | { kind: "unknown" };

function detect(raw: string): Detect {
  const v = raw.trim();
  if (!v) return { kind: "empty" };
  if (ADDRESS_RE.test(v)) return { kind: "address" };
  if (looksLikeEns(v)) return { kind: "ens" };
  if (/^0x[0-9a-fA-F]*$/.test(v))
    return { kind: "partial", have: v.length - 2 };
  return { kind: "unknown" };
}

const HINTS: Record<
  Detect["kind"],
  (d: Detect) => { text: string; tone: "muted" | "ok" | "warn" }
> = {
  empty: () => ({
    text: "ENS names resolve on Ethereum mainnet",
    tone: "muted",
  }),
  address: () => ({ text: "Wallet address", tone: "ok" }),
  ens: () => ({ text: "ENS name · resolves on mainnet", tone: "ok" }),
  partial: (d) => ({
    text: `Address incomplete · ${d.kind === "partial" ? d.have : 0}/40 hex`,
    tone: "warn",
  }),
  unknown: () => ({
    text: "Try a name like vitalik.eth or a 0x address",
    tone: "warn",
  }),
};

// The search surface. `hero` is the centered spotlight console on the
// landing page; `compact` is the same control in the terminal header.
// Both carry view-transition-name: console, so navigating between them
// morphs one into the other.
export function Console({
  variant,
  initial = "",
  busy = false,
  autoFocus = false,
}: {
  variant: "hero" | "compact";
  initial?: string;
  busy?: boolean;
  autoFocus?: boolean;
}) {
  const settings = useSettings();
  const navigate = useNavigate();
  const [query, setQuery] = useState(initial);
  const [focused, setFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const shake = useAnimationControls();
  const d = detect(query);
  const valid = d.kind === "address" || d.kind === "ens";
  const hint = HINTS[d.kind](d);
  const hero = variant === "hero";

  useEffect(() => setQuery(initial), [initial]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = (e.target as HTMLElement | null)?.closest(
        "input, textarea, select",
      );
      if (
        (e.key === "k" && (e.metaKey || e.ctrlKey)) ||
        (e.key === "/" && !typing)
      ) {
        e.preventDefault();
        inputRef.current?.focus();
        inputRef.current?.select();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  function submit(e?: React.FormEvent) {
    e?.preventDefault();
    if (busy) return;
    if (!valid) {
      // transitions.dev error-shake: 8px / 6px segments, 80ms each.
      void shake.start({
        x: [0, -8, 8, -6, 6, 0],
        transition: { duration: 0.4, ease: "easeInOut" },
      });
      inputRef.current?.focus();
      return;
    }
    // Inside document.startViewTransition: the console surface morphs
    // into the terminal search bar (see styles.css).
    void navigate({
      viewTransition: true,
      to: "/investigate/$chain/$target",
      params: { chain: settings.chain, target: query.trim() },
    });
  }

  return (
    <div className={cn("w-full", hero ? "max-w-[640px]" : "max-w-none")}>
      <motion.form
        animate={shake}
        onSubmit={submit}
        style={{ viewTransitionName: "console" }}
        className={cn(
          "relative flex items-center bg-surface transition-[box-shadow] duration-250 ease-smooth-out",
          hero
            ? "h-[68px] gap-2 rounded-(--radius-console) pr-2.5 pl-2.5 shadow-console"
            : "h-14 gap-2 rounded-2xl pr-2 pl-2 shadow-card",
          focused &&
            (hero
              ? "shadow-[var(--shadow-console),var(--shadow-focus)]"
              : "shadow-[var(--shadow-card),var(--shadow-focus)]"),
        )}
      >
        <ChainPicker
          value={settings.chain}
          compact={!hero}
          onChange={(c: Chain) => saveSettings({ chain: c })}
        />
        <div className="relative flex min-w-0 flex-1 items-center">
          <Search
            className={cn(
              "pointer-events-none absolute left-1.5 shrink-0 text-faint",
              hero ? "size-[18px]" : "size-4",
            )}
          />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            autoFocus={autoFocus}
            placeholder="Enter an ENS name or wallet address"
            spellCheck={false}
            autoComplete="off"
            autoCapitalize="off"
            aria-label="ENS name or wallet address"
            aria-describedby="console-hint"
            className={cn(
              "h-full w-full min-w-0 bg-transparent pl-8 text-ink outline-none placeholder:text-faint",
              hero
                ? "text-[16px] tracking-[-0.01em] sm:text-[17px]"
                : "text-[15px]",
              d.kind === "address" && "font-mono text-[0.92em] tracking-normal",
            )}
          />
        </div>
        {hero && !query && (
          <kbd className="hidden shrink-0 items-center gap-0.5 rounded-md border border-line bg-subtle px-1.5 py-0.5 font-sans text-[11px] text-muted sm:flex">
            ⌘K
          </kbd>
        )}
        <button
          type="submit"
          aria-label={busy ? "Working" : "Trace"}
          className={cn(
            "flex shrink-0 items-center justify-center gap-1.5 rounded-full font-medium transition-all duration-250 ease-smooth-out",
            hero
              ? "h-12 px-3.5 text-[15px] sm:pr-4 sm:pl-5"
              : "h-10 px-3 text-[14px] sm:pr-3.5 sm:pl-4",
            valid && !busy
              ? "bg-ink text-white hover:bg-ink-soft active:scale-[0.97]"
              : "bg-subtle text-faint",
          )}
        >
          {busy ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <span className="hidden sm:inline">Trace</span>
          )}
          {!busy && <ArrowRight className="size-4" />}
        </button>
      </motion.form>

      {hero && (
        <div
          id="console-hint"
          className="mt-3 flex h-5 items-center justify-center"
          aria-live="polite"
        >
          <AnimatePresence mode="wait" initial={false}>
            <motion.p
              key={hint.text}
              initial={{ opacity: 0, y: 4, filter: "blur(2px)" }}
              animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
              exit={{ opacity: 0, y: -4, filter: "blur(2px)" }}
              transition={{ duration: 0.15, ease: "easeInOut" }}
              className={cn(
                "flex items-center gap-1.5 text-[13px]",
                hint.tone === "ok" && "text-clean",
                hint.tone === "warn" && "text-inferred",
                hint.tone === "muted" && "text-muted",
              )}
            >
              {hint.tone === "ok" &&
                (d.kind === "ens" ? (
                  <AtSign className="size-3.5" />
                ) : (
                  <CircleCheck className="size-3.5" />
                ))}
              {hint.tone === "warn" && <CircleAlert className="size-3.5" />}
              {hint.text}
            </motion.p>
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}
