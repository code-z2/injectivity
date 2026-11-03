import type { CitationSource } from "@/components/kokonutui/ai-citations";

// What a citation chip rests on, shown in the side card: each source's
// kind or site, title and the passage that backs the claim.

const hostOf = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
};

export function SourcePreview({ sources }: { sources: CitationSource[] }) {
  return (
    <div className="flex flex-col">
      {sources.map((s) => (
        <div className="rounded-xl p-3" key={s.id}>
          <div className="flex items-center gap-1.5 text-[11.5px] text-faint">
            <span className="flex size-4 shrink-0 items-center justify-center rounded-[4px] bg-subtle text-[9px] font-semibold text-muted uppercase">
              {(s.site ?? "?").charAt(0)}
            </span>
            <span className="truncate">{s.site}</span>
            {s.url && (
              <span className="ml-auto shrink-0 truncate">{hostOf(s.url)}</span>
            )}
          </div>
          <p className="mt-1.5 text-[13px] leading-snug font-medium text-ink">
            {s.title}
          </p>
          {s.snippet && (
            <p className="mt-1 text-[12px] leading-relaxed [overflow-wrap:anywhere] text-muted">
              {s.snippet}
            </p>
          )}
        </div>
      ))}
    </div>
  );
}
