// The verifier: the model proposes, this disposes. Runs on every answer and
// report section before anything reaches the user. A sentence survives only
// if (1) every source it cites exists, (2) a sentence carrying figures,
// addresses or hashes cites at least one source, (3) every full address or
// hash in it appears in a cited source, and (4) every figure in it matches
// a figure in a cited source. Web facts are cited by URL ([https://…]) and
// resolve to the search results the model actually received.
import { citedIds, type Ledger, type Source } from '@/agent/ledger';

export interface Removed {
  sentence: string;
  reason: string;
}

export interface Verified {
  text: string;
  /** Sources cited by surviving text, in order of first use. */
  used: Source[];
  removed: Removed[];
}

const HEX = /0x[0-9a-fA-F]{64}|0x[0-9a-fA-F]{40}/g;
const SHORT_HEX = /0x([0-9a-fA-F]{4,6})(?:…|\.\.\.)([0-9a-fA-F]{4})/g;
const URL_CITE = /\[(https?:\/\/[^\s\]]+)\]/g;

/** Replace [https://…] web citations with the ledger ID of that search result. */
export function resolveUrlCitations(text: string, ledger: Ledger): string {
  const byUrl = new Map<string, string>();
  for (const s of ledger.all()) if (s.kind === 'web' && s.url) byUrl.set(norm(s.url), s.id);
  return text.replace(URL_CITE, (whole, url: string) => {
    const id = byUrl.get(norm(url));
    return id ? `[${id}]` : `[?${url}]`;
  });
}

const norm = (u: string) =>
  u
    .replace(/[#?].*$/, '')
    .replace(/\/$/, '')
    .toLowerCase();

export function verifyText(raw: string, ledger: Ledger): Verified {
  // A line holding only citations belongs to the sentence above it.
  const text = resolveUrlCitations(raw, ledger).replace(
    /[ \t]*\n[ \t]*((?:\[[^\]\n]+\][ \t]*)+)(?=\n|$)/g,
    ' $1',
  );
  const removed: Removed[] = [];
  const out: string[] = [];
  for (const line of text.split('\n')) {
    if (!line.trim() || /^\s*#{1,6}\s/.test(line) || /^\s*[-*_]{3,}\s*$/.test(line)) {
      out.push(line);
      continue;
    }
    const prefix = /^(\s*(?:[-*+]|\d+\.)\s+)/.exec(line)?.[1] ?? '';
    const kept: string[] = [];
    for (const sentence of splitSentences(line.slice(prefix.length))) {
      const reason = checkSentence(sentence, ledger);
      if (reason) removed.push({ sentence: sentence.trim(), reason });
      else kept.push(sentence.trim());
    }
    if (kept.length) out.push(prefix + kept.join(' '));
  }
  const final = out
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  const used: Source[] = [];
  for (const id of citedIds(final)) {
    const s = ledger.get(id);
    if (s && !used.includes(s)) used.push(s);
  }
  return { text: final, used, removed };
}

export function splitSentences(s: string): string[] {
  // Split after . ! ? followed by space and an uppercase letter, digit, or
  // markup; never inside "0x…", "e.g.", decimals or citation brackets.
  const parts = s.split(/(?<=[.!?](?:\s*\[[^\]]+\])*)\s+(?=[A-Z0-9*_("“]|\[(?!S\d|\?|https?:))/);
  const merged: string[] = [];
  for (const p of parts) {
    const prev = merged[merged.length - 1];
    if (prev && (/\b(e\.g|i\.e|vs|approx|No|U\.S)\.$/i.test(prev) || /(\.\.\.|…)$/.test(prev)))
      merged[merged.length - 1] = `${prev} ${p}`;
    else merged.push(p);
  }
  return merged.filter((p) => p.trim());
}

function checkSentence(sentence: string, ledger: Ledger): string | null {
  if (/\[\?https?:/.test(sentence)) return 'cites a web page the search did not return';
  const ids = citedIds(sentence);
  const sources = ids.map((id) => ledger.get(id));
  if (sources.some((s) => !s)) return 'cites a source that does not exist';
  const cited = sources as Source[];
  const body = sentence.replace(/\[(S\d+(?:\s*,\s*S\d+)*)\]/g, '');
  // A long hex string that is neither an address nor a hash is a typo.
  const bad = (body.match(/0x[0-9a-fA-F]{30,}/g) ?? []).find(
    (h) => h.length !== 42 && h.length !== 66,
  );
  if (bad) return `${bad.slice(0, 10)}… is not a valid address or hash`;
  const hexes = body.match(HEX) ?? [];
  const figures = figuresIn(body);
  const factual = hexes.length > 0 || figures.length > 0 || SHORT_HEX.test(body);
  SHORT_HEX.lastIndex = 0;
  if (!factual) return null;
  if (!cited.length) return 'states figures or addresses without a source';
  const haystack = cited.map((s) => `${s.ref} ${s.excerpt}`.toLowerCase()).join(' ');
  for (const h of hexes)
    if (!haystack.includes(h.toLowerCase()))
      return `${h.slice(0, 10)}… is not in the cited sources`;
  for (const m of body.matchAll(SHORT_HEX)) {
    const re = new RegExp(`0x${m[1]}[0-9a-f]*${m[2]}`, 'i');
    if (!re.test(haystack)) return `${m[0]} is not in the cited sources`;
  }
  const pool = cited.flatMap((s) => figuresIn(s.excerpt));
  for (const f of figures)
    if (!pool.some((p) => close(f, p))) return `${f.text} does not match the cited sources`;
  return null;
}

interface Figure {
  value: number;
  /** Significant digits as written, which sets the tolerance. */
  sig: number;
  text: string;
}

const SCALE: Record<string, number> = {
  k: 1e3,
  thousand: 1e3,
  m: 1e6,
  mn: 1e6,
  million: 1e6,
  b: 1e9,
  bn: 1e9,
  billion: 1e9,
};

/** Figures worth checking: amounts and counts, not years, dates, small ordinals or IDs. */
export function figuresIn(s: string): Figure[] {
  const clean = s
    .replace(HEX, ' ')
    .replace(/0x[0-9a-fA-F]+(?:…|\.\.\.)?[0-9a-fA-F]*/g, ' ')
    .replace(/\d{4}-\d{2}-\d{2}(?:T[\d:.]+Z?)?/g, ' ')
    // Written dates and times ("21 February 2025", "Feb 21, 2025", "14:13 UTC").
    .replace(
      /\b\d{1,2}(?:st|nd|rd|th)?\s+(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?(?:\s+\d{4})?|\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+\d{1,2}(?:st|nd|rd|th)?(?:,?\s+\d{4})?/gi,
      ' ',
    )
    .replace(/\b\d{1,2}:\d{2}(?::\d{2})?\b/g, ' ')
    .replace(/\bS\d+\b/g, ' ')
    .replace(/https?:\/\/\S+/g, ' ');
  const out: Figure[] = [];
  const re = /(\$)?(\d{1,3}(?:,\d{3})+|\d+)(\.\d+)?\s*(k|thousand|mn|m|million|bn|b|billion)?\b/gi;
  for (const m of clean.matchAll(re)) {
    const intPart = m[2]!.replace(/,/g, '');
    const frac = m[3] ?? '';
    const unit = m[4]?.toLowerCase();
    const value = Number(intPart + frac) * (unit ? SCALE[unit]! : 1);
    const isYear = !m[1] && !unit && !frac && /^(19|20)\d{2}$/.test(intPart);
    if (isYear || (!m[1] && !unit && !frac && value < 10)) continue;
    const digits = (intPart + frac.slice(1)).replace(/^0+/, '').replace(/0+$/, '');
    out.push({ value, sig: Math.max(1, digits.length), text: m[0].trim() });
  }
  return out;
}

/** A written figure matches when it rounds to the source's figure at the precision written. */
export function close(written: Figure, source: Figure): boolean {
  if (source.value === written.value) return true;
  const tol = written.sig <= 2 ? 0.05 : written.sig === 3 ? 0.01 : 0.002;
  return Math.abs(source.value - written.value) <= tol * Math.max(Math.abs(source.value), 1e-9);
}
