// Evidence ledger: every piece of data a tool returns becomes a numbered
// source (S1, S2, …). The model may only state what it can cite by ID;
// the verifier checks each citation against this ledger.

export type SourceKind =
  | 'tx' // a transfer or transaction
  | 'chain_state' // balances, code, ENS: chain state at fetch time
  | 'contract' // verified source / metadata
  | 'dataset' // risk lists, OFAC, exploits seed
  | 'computed' // totals and counts computed by code from other sources
  | 'memory' // a curated memory fact
  | 'document' // a PDF page
  | 'web'; // built-in search result

export interface SourceInput {
  kind: SourceKind;
  /** Tx hash / uniqueId, address, URL, dataset row id, memory fact id. */
  ref: string;
  chain?: string;
  title: string;
  /** The exact text or decoded data a claim can rest on. */
  excerpt: string;
  url?: string;
  page?: number;
}

export interface Source extends SourceInput {
  id: string;
  fetchedAt: string;
}

export class Ledger {
  private list: Source[] = [];
  private byKey = new Map<string, string>();

  constructor(sources: Source[] = []) {
    for (const s of sources) this.restore(s);
  }

  private restore(s: Source) {
    this.list.push(s);
    this.byKey.set(keyOf(s), s.id);
  }

  /** Adds a source (or finds the identical one) and returns its ID. */
  add(s: SourceInput): string {
    const key = keyOf(s);
    const hit = this.byKey.get(key);
    if (hit) return hit;
    const id = `S${this.list.length + 1}`;
    this.restore({ ...s, id, fetchedAt: new Date().toISOString() });
    return id;
  }

  get(id: string): Source | undefined {
    const n = Number(id.replace(/^S/, ''));
    const s = this.list[n - 1];
    return s && s.id === id ? s : undefined;
  }

  all(): Source[] {
    return [...this.list];
  }

  get size() {
    return this.list.length;
  }

  toJSON(): Source[] {
    return this.list;
  }
}

const keyOf = (s: SourceInput) =>
  `${s.kind}|${s.chain ?? ''}|${s.ref}|${s.page ?? ''}|${s.excerpt}`;

/** Every [S12] marker in a text, in order of appearance (with repeats). */
export function citedIds(text: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(/\[(S\d+(?:\s*,\s*S\d+)*)\]/g))
    for (const id of m[1]!.split(',')) out.push(id.trim());
  return out;
}
