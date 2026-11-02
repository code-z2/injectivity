// Node summaries: the fund movement of one address, for the right panel's
// node brief. Facts are computed in code from its ledger page (instant, no
// model), each filed as a citable source; a model then writes two or three
// sentences from those facts alone, which the verifier checks. Cached per
// address until a new transfer arrives.
import { hasLiveRpc, type Transfer } from '@/alchemy';
import { fmtValue, loadPrices, valueOf } from '@/agent/facts/prices';
import { spoofOf } from '@/agent/facts/spoof';
import { Ledger, type Source } from '@/agent/ledger';
import { recallFacts } from '@/agent/memory/store';
import { verifyText } from '@/agent/verify';
import type { ModelAdapter, ModelConfig } from '@/llm/adapters';
import { cachedTransfers, storeTransfers, transferUid } from '@/stores/transfers';
import type { AlchemyClient, Env } from '@/types';

export interface Fact {
  id: string;
  text: string;
}

export interface NodeSummary {
  chain: string;
  address: string;
  facts: Fact[];
  /** Model sentences with [S#] markers, verified; empty when none survived. */
  text: string;
  sources: Source[];
  coverage: { transfers: number; live: boolean; more: boolean };
  model: string | null;
  cached: boolean;
}

export const SUMMARY_PROMPT = `You write the node brief in an on-chain security terminal: at most three short, plain sentences on how money moved through one address, for an analyst glancing at a card.

Rules:
- Use only the facts given. Each fact has an ID such as S3; end every sentence with the IDs it rests on, like [S3][S5].
- Refer to the address as "this address", never by its hash. Name other addresses by role or label when the facts give one; otherwise use a short form like 0x47666f…86e2.
- Keep each sentence under 25 words. Round figures for reading ("about 2.3M USDT", "$202M"); never change a value.
- Lead with what matters for security: labels, sanctioned or exploit-linked counterparties, spoof tokens, where most value went. Leave out minor tokens and exact transfer counts unless they matter.
- No headings, lists, advice, next steps or questions. No code formatting.`;

interface Built {
  facts: Fact[];
  ledger: Ledger;
  watermark: string;
  coverage: NodeSummary['coverage'];
}

export async function buildFacts(
  env: Env,
  client: AlchemyClient,
  chain: string,
  address: string,
  fetchImpl: typeof fetch = fetch,
): Promise<Built> {
  const a = address.toLowerCase();
  let rows: Transfer[];
  let live = false;
  let more = false;
  if (hasLiveRpc(env, chain)) {
    const page = await client.getTransfers(env, chain, a, 'both');
    rows = page.transfers;
    live = true;
    more = Boolean(page.pageKey && page.pageKey !== 'e30');
    void storeTransfers(env, chain, rows).catch(() => undefined);
  } else {
    rows = (await cachedTransfers(env, chain, a, 'both')).rows;
  }

  const ledger = new Ledger();
  const facts: Fact[] = [];
  const add = (text: string, kind: Source['kind'], ref: string, url?: string) =>
    facts.push({
      id: ledger.add({ kind, ref, chain, title: text.slice(0, 80), excerpt: text, url }),
      text,
    });

  // Labels of the address itself and its counterparties, one query.
  const byCp = new Map<string, { n: number; in: number; out: number }>();
  for (const t of rows) {
    const out = t.from.toLowerCase() === a;
    const cp = (out ? t.to : t.from).toLowerCase();
    const c = byCp.get(cp) ?? { n: 0, in: 0, out: 0 };
    c.n++;
    if (out) c.out++;
    else c.in++;
    byCp.set(cp, c);
  }
  const lookup = [a, ...byCp.keys()].slice(0, 90);
  const labelRows =
    (
      await env.DB.prepare(
        `SELECT address, list_name, role, label FROM risk_lists WHERE address IN (${lookup.map(() => '?').join(',')})`,
      )
        .bind(...lookup)
        .all<{ address: string; list_name: string; role: string; label: string }>()
    ).results ?? [];
  const labels = new Map<string, string[]>();
  for (const r of labelRows)
    labels.set(r.address, [
      ...(labels.get(r.address) ?? []),
      `${r.list_name} ${r.role}: ${r.label}`,
    ]);

  for (const l of labels.get(a) ?? []) add(`${a} is on the ${l}.`, 'dataset', `label:${a}:${l}`);

  // What earlier investigations established about it.
  const known = await recallFacts(env, { subjects: [a], limit: 3 }).catch(() => []);
  for (const f of known)
    facts.push({
      id: ledger.add({
        kind: 'memory',
        ref: `memory/${f.id}`,
        chain,
        title: `Memory: ${f.kind}`,
        excerpt: `${f.statement} Evidence: ${f.sources.map((s) => s.excerpt.slice(0, 300)).join(' | ')}`,
      }),
      text: `From an earlier investigation: ${f.statement}`,
    });

  if (!rows.length) {
    add(
      `No transfers were found for ${a}${live ? '' : ' in the cache (no live RPC)'}.`,
      'computed',
      `empty:${a}`,
    );
    return { facts, ledger, watermark: 'empty', coverage: { transfers: 0, live, more } };
  }

  const ins = rows.filter((t) => t.from.toLowerCase() !== a);
  const outs = rows.filter((t) => t.from.toLowerCase() === a);
  const times = rows
    .map((t) => t.timestamp)
    .filter(Boolean)
    .sort() as string[];
  const span = times.length
    ? ` between ${day(times[0]!)} and ${day(times[times.length - 1]!)}`
    : '';
  const cover = `${rows.length}${more ? ' most recent' : ''} transfers`;
  add(
    `Across its ${cover}${span}, ${a} received ${ins.length} and sent ${outs.length}, with ${byCp.size} distinct counterparties.`,
    'computed',
    `coverage:${a}:${rows.length}`,
  );

  const prices = await loadPrices(chain, fetchImpl);
  const flows = (list: Transfer[]) =>
    list.map((t) => ({
      contract: t.contract ?? null,
      asset: t.asset ?? '',
      amount: num(t.value),
      category: t.category ?? '',
    }));
  const vin = fmtValue(valueOf(chain, flows(ins), prices));
  const vout = fmtValue(valueOf(chain, flows(outs), prices));
  add(
    `Counted value over those ${cover}: ${vin} in and ${vout} out (liquid tokens only; ">" marks a lower bound).`,
    'computed',
    `value:${a}:${rows.length}`,
  );

  const tokens = new Map<string, { asset: string; in: number; out: number; n: number }>();
  for (const t of rows) {
    const k = t.contract ?? t.asset ?? '';
    const x = tokens.get(k) ?? { asset: t.asset || '?', in: 0, out: 0, n: 0 };
    const v = num(t.value) ?? 0;
    if (t.from.toLowerCase() === a) x.out += v;
    else x.in += v;
    x.n++;
    tokens.set(k, x);
  }
  const topTokens = [...tokens.values()].sort((p, q) => q.n - p.n).slice(0, 5);
  add(
    `Main tokens moved: ${topTokens.map((x) => `${x.asset} (${fmt(x.in)} in, ${fmt(x.out)} out, ${x.n} transfers)`).join('; ')}.`,
    'computed',
    `tokens:${a}:${rows.length}`,
  );

  const top = [...byCp.entries()].sort((p, q) => q[1].n - p[1].n).slice(0, 5);
  add(
    `Most frequent counterparties: ${top
      .map(
        ([cp, c]) =>
          `${cp} (${c.n} transfers${labels.get(cp) ? `; ${labels.get(cp)!.join('; ')}` : ''})`,
      )
      .join(', ')}.`,
    'computed',
    `counterparties:${a}:${rows.length}`,
  );

  for (const [cp, ls] of labels) {
    if (cp === a) continue;
    const c = byCp.get(cp)!;
    for (const l of ls)
      add(
        `Counterparty ${cp} (${c.in} in, ${c.out} out) is on the ${l}.`,
        'dataset',
        `cp-label:${a}:${cp}:${l}`,
      );
  }

  const spoofs = new Map<string, { imitates: string; n: number }>();
  for (const t of rows) {
    const imitates = t.asset ? spoofOf(t.asset) : null;
    if (!imitates) continue;
    const s = spoofs.get(t.asset!) ?? { imitates, n: 0 };
    s.n++;
    spoofs.set(t.asset!, s);
  }
  for (const [sym, s] of spoofs)
    add(
      `${s.n} transfers used the spoof token "${sym}", which imitates ${s.imitates}; its amounts are not real ${s.imitates}.`,
      'computed',
      `spoof:${a}:${sym}`,
    );

  const outCps = new Set(outs.map((t) => t.to.toLowerCase()));
  if (outs.length >= 10 && outCps.size >= outs.length * 0.6)
    add(
      `Fan-out pattern: ${outs.length} outgoing transfers went to ${outCps.size} different addresses.`,
      'computed',
      `fanout:${a}:${rows.length}`,
    );
  const inCps = new Set(ins.map((t) => t.from.toLowerCase()));
  if (ins.length >= 10 && inCps.size >= ins.length * 0.6)
    add(
      `Fan-in pattern: ${ins.length} incoming transfers came from ${inCps.size} different addresses.`,
      'computed',
      `fanin:${a}:${rows.length}`,
    );

  return {
    facts,
    ledger,
    watermark: `${transferUid(rows[0]!)}:${rows.length}`,
    coverage: { transfers: rows.length, live, more },
  };
}

export async function summarise(opts: {
  env: Env;
  client: AlchemyClient;
  chain: string;
  address: string;
  model: { adapter: ModelAdapter; cfg: ModelConfig } | null;
  fetch?: typeof fetch;
  onFacts?: (facts: Fact[], coverage: NodeSummary['coverage']) => void;
  signal?: AbortSignal;
}): Promise<NodeSummary> {
  const { env, chain } = opts;
  const address = opts.address.toLowerCase();
  const built = await buildFacts(env, opts.client, chain, address, opts.fetch);
  opts.onFacts?.(built.facts, built.coverage);

  const model = opts.model?.cfg.model ?? null;
  const cached = await env.DB.prepare(
    'SELECT watermark, body FROM node_summaries WHERE chain = ? AND address = ?',
  )
    .bind(chain, address)
    .first<{ watermark: string; body: string }>()
    .catch(() => null);
  if (cached && cached.watermark === built.watermark) {
    const body = JSON.parse(cached.body) as NodeSummary;
    if (body.model === model) return { ...body, cached: true };
  }

  let text = '';
  if (opts.model) {
    try {
      const turn = await opts.model.adapter.run(opts.model.cfg, {
        system: SUMMARY_PROMPT,
        messages: [
          {
            role: 'user',
            text: `Facts about ${address} on ${chain}:\n${built.facts.map((f) => `${f.id}: ${f.text}`).join('\n')}`,
          },
        ],
        // Reasoning models spend output tokens thinking first.
        maxTokens: 8000,
        signal: opts.signal,
      });
      text = verifyText(turn.text, built.ledger).text;
    } catch {
      // The facts stand on their own.
    }
  }
  const sources = verifyText(text, built.ledger).used;
  const summary: NodeSummary = {
    chain,
    address,
    facts: built.facts,
    text,
    sources,
    coverage: built.coverage,
    model: text ? model : null,
    cached: false,
  };
  if (text)
    await env.DB.prepare(
      'INSERT OR REPLACE INTO node_summaries (chain, address, watermark, body, created_at) VALUES (?,?,?,?,?)',
    )
      .bind(chain, address, built.watermark, JSON.stringify(summary), new Date().toISOString())
      .run()
      .catch(() => undefined);
  return summary;
}

const num = (v: unknown): number | null => {
  const n = Number(v);
  return Number.isFinite(n) && v !== '' ? n : null;
};

const compact = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 });
const fmt = (n: number) => (Math.abs(n) >= 0.01 || n === 0 ? compact.format(n) : n.toPrecision(2));
const day = (iso: string) => iso.slice(0, 10);
