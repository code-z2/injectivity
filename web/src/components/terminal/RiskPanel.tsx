import type { RiskMatch } from "@/lib/api";
import { cn, short } from "@/lib/utils";
import { SectionLabel } from "./ui";

export function RiskPanel({
  matches,
  screened,
}: {
  matches: RiskMatch[];
  screened: number;
}) {
  const verified = matches.filter((m) => m.match_type === "exact");
  const inferred = matches.filter((m) => m.match_type !== "exact");

  return (
    <div className="mt-6">
      <SectionLabel>Risk assessment</SectionLabel>
      <div className="mt-3 space-y-2.5">
        {verified.length > 0 && (
          <Box tone="verified">
            <p className="text-[13px] font-medium text-verified">
              Verified · {verified.length}
            </p>
            {verified.map((m) => (
              <p
                key={`${m.list_name}/${m.role}`}
                className="mt-1.5 font-mono text-[12.5px] text-ink"
              >
                {m.list_name} / {m.role} — {m.label}{" "}
                <span className="text-muted">({m.version})</span>
              </p>
            ))}
          </Box>
        )}

        {inferred.length > 0 && (
          <Box tone="inferred">
            <p className="text-[13px] font-medium text-inferred">
              Inferred association · {inferred.length}
            </p>
            {inferred.map((m) => (
              <p
                key={`${m.list_name}/${m.role}/${m.via}`}
                className="mt-1.5 font-mono text-[12.5px] text-ink"
              >
                {m.list_name} / {m.role}{" "}
                <span className="text-muted">via {short(m.via)}</span>
              </p>
            ))}
            <p className="mt-2.5 text-[12px] text-muted">
              One hop from a flagged address. Association is not wrongdoing.
            </p>
          </Box>
        )}

        {verified.length === 0 && inferred.length === 0 && (
          <Box tone="clean">
            <p className="text-[13px] font-medium text-clean">
              No risk matches
            </p>
            <p className="mt-1 text-[13px] text-ink-soft">
              Screened {screened} counterparties, nothing flagged.
            </p>
          </Box>
        )}
      </div>
    </div>
  );
}

function Box({
  tone,
  children,
}: {
  tone: "verified" | "inferred" | "clean";
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "rounded-2xl border px-4 py-3",
        tone === "verified" && "border-verified/15 bg-verified-soft/60",
        tone === "inferred" && "border-inferred/15 bg-inferred-soft/60",
        tone === "clean" && "border-clean/15 bg-clean-soft/60",
      )}
    >
      {children}
    </div>
  );
}
