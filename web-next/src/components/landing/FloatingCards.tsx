import { motion } from "motion/react";
import { FileText, GitFork, ShieldAlert } from "lucide-react";
import { cn } from "@/lib/utils";

// Illustrative product moments orbiting the console (Talise pattern).
// Purely decorative: hidden from assistive tech and below lg.
const CARDS = [
  {
    pos: "left-[3.5%] top-[54%]",
    dark: false,
    icon: ShieldAlert,
    iconCls: "bg-verified-soft text-verified",
    title: "0x8B1b…0D3b flagged",
    sub: "OFAC SDN · verified match",
    delay: 0.5,
    float: "0s",
  },
  {
    pos: "right-[3.5%] top-[36%]",
    dark: true,
    icon: GitFork,
    iconCls: "bg-white/10 text-ion-400",
    title: "Trace complete",
    sub: "41 wallets · 2 hops · 3 flagged",
    delay: 0.65,
    float: "-2.5s",
  },
  {
    pos: "left-[9%] bottom-[11%]",
    dark: false,
    icon: FileText,
    iconCls: "bg-ion-50 text-ion-600",
    title: "Report #12 ready",
    sub: "4 findings · PDF",
    delay: 0.8,
    float: "-4.5s",
    blur: true,
  },
] as const;

export function FloatingCards() {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 hidden xl:block"
    >
      {CARDS.map((c) => (
        <motion.div
          key={c.title}
          className={cn("absolute", c.pos)}
          initial={{ opacity: 0, y: 12, filter: "blur(3px)" }}
          animate={{
            opacity: "blur" in c ? 0.55 : 1,
            y: 0,
            filter: "blur" in c ? "blur(1.5px)" : "blur(0px)",
          }}
          transition={{
            delay: c.delay,
            duration: 0.5,
            ease: [0.22, 1, 0.36, 1],
          }}
        >
          <div
            className={cn(
              "flex animate-float items-center gap-3 rounded-2xl py-2.5 pr-5 pl-2.5",
              c.dark
                ? "bg-ink text-white shadow-float"
                : "text-ink shadow-float glass",
            )}
            style={{ animationDelay: c.float }}
          >
            <span
              className={cn(
                "flex size-9 items-center justify-center rounded-xl",
                c.iconCls,
              )}
            >
              <c.icon className="size-4" />
            </span>
            <span>
              <span className="block text-[14px] font-medium tracking-[-0.01em]">
                {c.title}
              </span>
              <span
                className={cn(
                  "block text-[12px]",
                  c.dark ? "text-white/55" : "text-muted",
                )}
              >
                {c.sub}
              </span>
            </span>
          </div>
        </motion.div>
      ))}
    </div>
  );
}
