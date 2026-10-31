import { cn } from "@/lib/utils";

const COPY = {
  verified: "Verified threat",
  inferred: "Inferred link",
  none: "No flags",
} as const;

export function RiskBadge({
  level,
}: {
  level: "verified" | "inferred" | "none";
}) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-2 rounded-full px-3 py-1 text-[13px] font-medium",
        level === "verified" && "bg-verified-soft text-verified",
        level === "inferred" && "bg-inferred-soft text-inferred",
        level === "none" && "bg-clean-soft text-clean",
      )}
    >
      <span className="relative flex size-2">
        {level === "verified" && (
          <span className="absolute inset-0 animate-ping rounded-full bg-verified opacity-50" />
        )}
        <span
          className={cn(
            "relative size-2 rounded-full",
            level === "verified" && "bg-verified",
            level === "inferred" && "bg-inferred",
            level === "none" && "bg-clean",
          )}
        />
      </span>
      {COPY[level]}
    </span>
  );
}
