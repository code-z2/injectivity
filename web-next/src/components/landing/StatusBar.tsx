import { motion } from "motion/react";
import { useServiceStatus, type ServiceStatus } from "@/lib/status";
import { cn } from "@/lib/utils";

const LABEL: Record<ServiceStatus["state"], string> = {
  checking: "Checking",
  operational: "Operational",
  degraded: "Degraded",
  down: "Unavailable",
};

// Quiet, glanceable service status, bottom-right in one row. Present,
// never asking for attention.
export function StatusBar({ show }: { show: boolean }) {
  const { rpc, agent } = useServiceStatus();
  return (
    <motion.dl
      initial={{ opacity: 0 }}
      animate={{ opacity: show ? 1 : 0 }}
      transition={{ duration: 0.8, ease: "easeOut" }}
      className="fixed right-6 bottom-5 z-10 flex items-center gap-4 text-[11px] leading-none text-ink/40 select-none"
    >
      <Row name="RPC" s={rpc} />
      <span aria-hidden className="h-2.5 w-px bg-ink/10" />
      <Row name="AI agent" s={agent} />
    </motion.dl>
  );
}

function Row({ name, s }: { name: string; s: ServiceStatus }) {
  return (
    <div
      className="flex items-center gap-1.5"
      title={s.ms !== null ? `${name}: ${s.ms} ms` : undefined}
    >
      <dt>{name}</dt>
      <dd className="flex items-center gap-1.5">
        <span className="text-ink/25">→</span>
        {LABEL[s.state]}
        <span
          className={cn(
            "size-1.5 rounded-full",
            s.state === "operational" && "bg-clean/70",
            s.state === "degraded" && "bg-inferred/70",
            s.state === "down" && "bg-verified/70",
            s.state === "checking" && "animate-pulse bg-ink/20",
          )}
        />
      </dd>
    </div>
  );
}
