import { useNavigate } from "@tanstack/react-router";
import { FileDown, Network, ShieldCheck, Split } from "lucide-react";
import { motion } from "motion/react";
import { Console } from "@/components/Console";
import { Brand } from "@/components/Mark";
import { SettingsDialog } from "@/components/SettingsDialog";
import type { Chain } from "@/lib/api";
import { saveSettings } from "@/lib/settings";
import { FloatingCards } from "./FloatingCards";
import { HeroField } from "./HeroField";

const EXAMPLES: { label: string; value: string; chain: Chain }[] = [
  { label: "vitalik.eth", value: "vitalik.eth", chain: "ethereum" },
  {
    label: "KelpDAO exploiter",
    value: "0x8B1b6c9A6DB1304000412dd21Ae6A70a82d60D3b",
    chain: "ethereum",
  },
];

const CAPABILITIES = [
  { icon: ShieldCheck, text: "866 flagged addresses indexed" },
  { icon: Network, text: "Depth-2 fund-flow mesh" },
  { icon: Split, text: "Verified and inferred, kept apart" },
  { icon: FileDown, text: "Reports export to PDF" },
];

// transitions.dev texts-reveal: 12px blurred rise, staggered.
const rise = (i: number) => ({
  initial: { opacity: 0, y: 12, filter: "blur(3px)" },
  animate: { opacity: 1, y: 0, filter: "blur(0px)" },
  transition: {
    delay: 0.08 + i * 0.08,
    duration: 0.5,
    ease: [0.22, 1, 0.36, 1] as const,
  },
});

export function Landing() {
  const navigate = useNavigate();

  function pick(ex: (typeof EXAMPLES)[number]) {
    saveSettings({ chain: ex.chain });
    // Inside document.startViewTransition: the console surface morphs
    // into the terminal search bar (see styles.css).
    void navigate({
      viewTransition: true,
      to: "/investigate/$chain/$target",
      params: { chain: ex.chain, target: ex.value },
    });
  }

  return (
    <div className="flex min-h-svh flex-col px-3 pt-3 pb-4 sm:px-5 sm:pt-5">
      <section className="relative isolate flex min-h-[calc(100svh-88px)] flex-1 flex-col overflow-hidden rounded-[28px] bg-canvas shadow-hairline">
        <HeroField />

        <header className="relative z-10 mx-auto mt-4 flex w-[calc(100%-32px)] max-w-[1040px] items-center justify-between rounded-full py-2 pr-2 pl-4 shadow-card glass">
          <Brand />
          <SettingsDialog />
        </header>

        <main className="relative z-10 flex flex-1 flex-col items-center px-4 pt-[12vh] pb-[26vh] text-center sm:pt-[14vh]">
          <motion.span
            {...rise(0)}
            className="mb-6 inline-flex items-center gap-2 rounded-full py-1 pr-3 pl-1.5 text-[13px] text-ink-soft shadow-hairline glass"
          >
            <span className="rounded-full bg-ink px-2 py-0.5 text-[11px] font-medium text-white">
              New
            </span>
            On-chain security intelligence
          </motion.span>
          <motion.h1
            {...rise(1)}
            className="text-[40px] display text-ink sm:text-[64px] lg:text-[76px]"
          >
            <span className="block">Trace any wallet.</span>
            <span className="block text-faint">No wallet needed.</span>
          </motion.h1>
          <motion.p
            {...rise(2)}
            className="mt-5 max-w-[50ch] text-[16px] leading-[1.6] text-ink-soft sm:text-[17px]"
          >
            Paste an ENS name or address. Funds, risk and hidden links surface
            in seconds, with verified facts kept apart from inference.
          </motion.p>

          <motion.div {...rise(3)} className="mt-9 flex w-full justify-center">
            <Console variant="hero" autoFocus />
          </motion.div>

          <motion.div
            {...rise(4)}
            className="mt-4 flex flex-wrap items-center justify-center gap-2"
          >
            <span className="text-[13px] text-faint">Try</span>
            {EXAMPLES.map((ex) => (
              <button
                key={ex.value}
                onClick={() => pick(ex)}
                className="rounded-full px-3 py-1.5 text-[13px] text-ink-soft shadow-hairline glass transition-all duration-150 hover:-translate-y-px hover:text-ink hover:shadow-card"
              >
                {ex.label}
              </button>
            ))}
          </motion.div>
        </main>

        <FloatingCards />
      </section>

      <footer className="mx-auto mt-4 grid w-full max-w-[1040px] grid-cols-2 gap-x-6 gap-y-2 px-2 sm:flex sm:justify-between">
        {CAPABILITIES.map((c) => (
          <span
            key={c.text}
            className="flex items-center gap-2 text-[13px] text-muted"
          >
            <c.icon className="size-4 text-faint" />
            {c.text}
          </span>
        ))}
      </footer>
    </div>
  );
}
