import { Link } from "@tanstack/react-router";
import { cn } from "@/lib/utils";

// Brand mark: a traced node — root ring with one outbound hop.
export function MarkGlyph({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={cn("size-7", className)} aria-hidden>
      <rect width="32" height="32" rx="9" className="fill-ink" />
      <path
        d="M13 16 L22.5 10.5"
        stroke="white"
        strokeOpacity="0.55"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      <circle
        cx="12.5"
        cy="16.5"
        r="4.6"
        fill="none"
        stroke="white"
        strokeWidth="2"
      />
      <circle cx="12.5" cy="16.5" r="1.6" fill="white" />
      <circle cx="23" cy="10" r="2.2" fill="#6d8cff" />
    </svg>
  );
}

export function Brand({ className }: { className?: string }) {
  return (
    <Link
      to="/"
      className={cn(
        "flex items-center gap-2.5 text-[15px] font-medium tracking-[-0.01em] text-ink",
        className,
      )}
    >
      <MarkGlyph />
      Intel Terminal
    </Link>
  );
}
