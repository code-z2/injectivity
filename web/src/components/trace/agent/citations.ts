// Turns the agent's verified text ("… drained 10,000 stETH [S4][S9].") into
// blocks of citation parts for AICitations, and ledger sources into the
// chips' preview cards.
import type {
  AnswerPart,
  CitationSource,
} from "@/components/kokonutui/ai-citations";
import type { Source } from "@/lib/agent";

export type Block =
  | { kind: "para"; parts: AnswerPart[] }
  | { kind: "list"; items: AnswerPart[][] }
  | { kind: "heading"; text: string };

const MARKERS = /(?:\s*\[(?:S\d+|\d+)(?:\s*,\s*(?:S\d+|\d+))*\])+/g;
const LEAD_PUNCT = /^[.,;:)]+\s*/;

/** One line of text → parts, each cited run ending at its markers. */
export function parseParts(text: string): AnswerPart[] {
  const parts: AnswerPart[] = [];
  let last = 0;
  const push = (seg: string, cite?: string[]) => {
    // Punctuation after the previous chip belongs outside this claim.
    const lead = LEAD_PUNCT.exec(seg)?.[0];
    if (lead && parts.length) {
      parts.push({ text: lead });
      seg = seg.slice(lead.length);
    }
    if (!seg && !cite) return;
    parts.push(cite ? { text: seg.trimEnd(), cite } : { text: seg });
  };
  for (const m of text.matchAll(MARKERS)) {
    const ids = [...m[0].matchAll(/S?\d+/g)].map((x) => x[0]);
    push(text.slice(last, m.index), ids);
    last = (m.index ?? 0) + m[0].length;
  }
  push(text.slice(last));
  // Space between a chip and the next claim.
  return parts.flatMap((p, i) =>
    p.cite && parts[i + 1] && !/^\s|^[.,;:)]/.test(parts[i + 1].text)
      ? [p, { text: " " }]
      : [p],
  );
}

export function parseBlocks(text: string): Block[] {
  const blocks: Block[] = [];
  for (const raw of text.split(/\n{2,}/)) {
    const lines = raw.split("\n").filter((l) => l.trim());
    if (!lines.length) continue;
    if (lines.length === 1 && /^#{1,6}\s/.test(lines[0])) {
      blocks.push({
        kind: "heading",
        text: lines[0].replace(/^#{1,6}\s+/, ""),
      });
      continue;
    }
    if (lines.every((l) => /^\s*(?:[-*•]|\d+\.)\s+/.test(l))) {
      blocks.push({
        kind: "list",
        items: lines.map((l) =>
          parseParts(l.replace(/^\s*(?:[-*•]|\d+\.)\s+/, "")),
        ),
      });
      continue;
    }
    blocks.push({ kind: "para", parts: parseParts(lines.join(" ")) });
  }
  return blocks;
}

const KIND_SITE: Record<Source["kind"], string> = {
  tx: "Transfer",
  chain_state: "Chain state",
  contract: "Contract",
  dataset: "Dataset",
  computed: "Computed",
  memory: "Memory",
  document: "Document",
  web: "Web",
};

const hostOf = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
};

/** A ledger source as a citation chip and preview. */
export function toCitation(s: Source): CitationSource {
  const host = s.url ? hostOf(s.url) : "";
  const site =
    s.kind === "web" || s.kind === "document"
      ? host || KIND_SITE[s.kind]
      : s.kind === "tx" && host
        ? host.split(".")[0].replace(/^\w/, (c) => c.toUpperCase())
        : KIND_SITE[s.kind];
  return {
    id: s.id,
    title: s.title,
    url: s.url ?? "",
    site,
    snippet: s.excerpt.length > 280 ? `${s.excerpt.slice(0, 280)}…` : s.excerpt,
  };
}
