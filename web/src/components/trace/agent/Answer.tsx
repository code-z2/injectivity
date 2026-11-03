import AICitations, {
  type CitationSource,
} from "@/components/kokonutui/ai-citations";
import type { Source } from "@/lib/agent";
import { parseBlocks, toCitation } from "./citations";

// A verified answer: paragraphs, lists and headings with a citation chip
// after each claim; hovering a chip previews the source it rests on.
export type OnPreview = (
  p: { key: string; sources: CitationSource[]; rect: DOMRect } | null,
) => void;

export function Answer({
  text,
  sources,
  onPreview,
  onCite,
  prose = "text-[13px] leading-6 text-ink-soft",
}: {
  text: string;
  sources: Map<string, Source>;
  /** Show previews in the side card instead of beside the chip. */
  onPreview?: OnPreview;
  /** A chip was clicked: its source ids. */
  onCite?: (ids: string[]) => void;
  /** Text classes (size, leading, colour). */
  prose?: string;
}) {
  const cites = [...sources.values()].map(toCitation);
  const textCls = `${prose} [overflow-wrap:anywhere]`;
  return (
    <div className="flex flex-col gap-2.5">
      {parseBlocks(text).map((b, i) => {
        if (b.kind === "heading")
          return (
            <p key={i} className="pt-1 text-[12px] font-medium text-ink">
              {b.text}
            </p>
          );
        if (b.kind === "list")
          return (
            <ul key={i} className="flex flex-col gap-1.5 pl-4">
              {b.items.map((parts, j) => (
                <li key={j} className="list-disc marker:text-faint">
                  <AICitations
                    className="max-w-none"
                    parts={parts}
                    onCite={onCite}
                    onPreview={onPreview}
                    showSources={false}
                    sources={cites}
                    textClassName={textCls}
                  />
                </li>
              ))}
            </ul>
          );
        return (
          <AICitations
            className="max-w-none"
            key={i}
            parts={b.parts}
            onCite={onCite}
            onPreview={onPreview}
            showSources={false}
            sources={cites}
            textClassName={textCls}
          />
        );
      })}
    </div>
  );
}
