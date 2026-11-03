import { Monitor, Moon, Sun } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { setThemeMode, type ThemeMode, useThemeMode } from "@/lib/theme";
import { cn } from "@/lib/utils";

// One button that cycles the appearance: light → dark → system.

const NEXT: Record<ThemeMode, ThemeMode> = {
  light: "dark",
  dark: "system",
  system: "light",
};
const LABEL: Record<ThemeMode, string> = {
  light: "Light",
  dark: "Dark",
  system: "System",
};
const ICON = { light: Sun, dark: Moon, system: Monitor };

export function ThemeToggle({ className }: { className?: string }) {
  const mode = useThemeMode();
  const Icon = ICON[mode];
  return (
    <button
      aria-label={`Appearance: ${LABEL[mode]}. Switch to ${LABEL[NEXT[mode]]}.`}
      className={cn(
        "relative flex size-8 items-center justify-center overflow-hidden rounded-full text-ink-soft transition-colors hover:text-ink",
        className,
      )}
      onClick={(e) => {
        e.stopPropagation();
        setThemeMode(NEXT[mode]);
      }}
      title={`Appearance: ${LABEL[mode]}`}
      type="button"
    >
      <AnimatePresence initial={false} mode="popLayout">
        <motion.span
          animate={{ opacity: 1, rotate: 0, scale: 1 }}
          exit={{ opacity: 0, rotate: 40, scale: 0.6 }}
          initial={{ opacity: 0, rotate: -40, scale: 0.6 }}
          key={mode}
          transition={{ duration: 0.2, ease: [0.23, 1, 0.32, 1] }}
        >
          <Icon className="size-4" />
        </motion.span>
      </AnimatePresence>
    </button>
  );
}

/** Light / Dark / System as a segmented control (Settings). */
export function ThemeSegmented() {
  const mode = useThemeMode();
  return (
    <div className="flex rounded-full bg-subtle p-1">
      {(["light", "dark", "system"] as const).map((m) => {
        const Icon = ICON[m];
        return (
          <button
            aria-pressed={mode === m}
            className={cn(
              "relative flex flex-1 items-center justify-center gap-1.5 rounded-full py-1.5 text-[13px] font-medium transition-colors duration-250",
              mode === m ? "text-ink" : "text-muted",
            )}
            key={m}
            onClick={() => setThemeMode(m)}
            type="button"
          >
            {mode === m && (
              <motion.span
                className="absolute inset-0 rounded-full bg-surface shadow-card"
                layoutId="theme-pill"
                transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
              />
            )}
            <Icon className="relative size-3.5" />
            <span className="relative">{LABEL[m]}</span>
          </button>
        );
      })}
    </div>
  );
}
