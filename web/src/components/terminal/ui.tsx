import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function Panel({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <section
      className={cn(
        "rounded-[20px] bg-surface p-5 shadow-card sm:p-6",
        className,
      )}
    >
      {children}
    </section>
  );
}

export function SectionLabel({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <h2
      className={cn(
        "text-[12px] font-medium tracking-[0.08em] text-faint uppercase",
        className,
      )}
    >
      {children}
    </h2>
  );
}

export function Status({ text }: { text: string }) {
  return (
    <p className="text-[13px]">
      <span className="t-shimmer" data-text={text}>
        {text}
      </span>
    </p>
  );
}

export function ErrorLine({ children }: { children: ReactNode }) {
  return <p className="text-[13px] text-verified">{children}</p>;
}

export function Tag({
  tone,
  children,
}: {
  tone: "verified" | "inferred" | "neutral" | "ion";
  children: ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium capitalize",
        tone === "verified" && "bg-verified-soft text-verified",
        tone === "inferred" && "bg-inferred-soft text-inferred",
        tone === "neutral" && "bg-subtle text-ink-soft",
        tone === "ion" && "bg-ion-50 text-ion-700",
      )}
    >
      {children}
    </span>
  );
}

export const linkCls =
  "text-ion-600 underline decoration-ion-200 underline-offset-2 transition-colors hover:text-ion-700 hover:decoration-ion-600";

export const selectCls =
  "h-8 rounded-full border border-line bg-surface pr-7 pl-3 text-[13px] text-ink-soft outline-none transition-colors hover:border-line-strong focus:border-ion-400";
