// Tools over our own data: risk lists (OFAC, exploit attackers/victims),
// the exploits dataset, and the user's workspace.
import { addr, short, str, type Tool, type ToolItem } from './types';

export const lookupLabels: Tool = {
  spec: {
    name: 'lookup_labels',
    description:
      'Known labels for up to 25 addresses: OFAC sanctions and exploit attacker/victim lists (exact matches only).',
    parameters: {
      type: 'object',
      properties: { addresses: { type: 'array', items: { type: 'string' }, maxItems: 25 } },
      required: ['addresses'],
    },
  },
  async run(ctx, args) {
    const list = (Array.isArray(args.addresses) ? args.addresses : [])
      .slice(0, 25)
      .map((a) => addr(a));
    if (!list.length) return { items: [], note: 'no addresses given' };
    const rows = await ctx.env.DB.prepare(
      `SELECT list_name, address, chains, role, label, source_url, version FROM risk_lists
       WHERE address IN (${list.map(() => '?').join(',')})`,
    )
      .bind(...list)
      .all<{
        list_name: string;
        address: string;
        chains: string;
        role: string;
        label: string;
        source_url: string;
        version: string;
      }>();
    const items: ToolItem[] = (rows.results ?? []).map((r) => ({
      src: {
        kind: 'dataset',
        ref: `${r.list_name}/${r.role}/${r.address}`,
        title: `${r.list_name} list (${r.version})`,
        excerpt: `${r.address} is on the ${r.list_name} list as ${r.role}: ${r.label} (chains ${r.chains})`,
        url: r.source_url || undefined,
      },
      data: { address: r.address, list: r.list_name, role: r.role, label: r.label },
    }));
    const hit = new Set(items.map((i) => i.data.address));
    const misses = list.filter((a) => !hit.has(a));
    return {
      items,
      note: misses.length ? `no label for: ${misses.map(short).join(', ')}` : undefined,
    };
  },
};

interface ExploitRow {
  id: string;
  protocol: string;
  date: string;
  loss_usd: number;
  technique: string;
  body: string;
}

export const searchExploits: Tool = {
  spec: {
    name: 'search_exploits',
    description:
      'Search the curated exploits dataset (271 EVM incidents) by protocol name, technique, or an attacker/victim address or tx hash. Returns date, loss, technique, addresses and txs.',
    parameters: {
      type: 'object',
      properties: { query: { type: 'string' } },
      required: ['query'],
    },
  },
  async run(ctx, args) {
    const q = str(args.query, 'query').toLowerCase();
    const like = `%${q.replace(/[%_]/g, '')}%`;
    const rows = await ctx.env.DB.prepare(
      `SELECT id, protocol, date, loss_usd, technique, body FROM exploits
       WHERE lower(protocol) LIKE ? OR lower(technique) LIKE ? OR lower(body) LIKE ?
       ORDER BY loss_usd DESC LIMIT 5`,
    )
      .bind(like, like, like)
      .all<ExploitRow>();
    const items: ToolItem[] = (rows.results ?? []).map((r) => {
      const e = JSON.parse(r.body) as {
        chains: string[];
        loss_note?: string;
        hacker_addresses: { address: string; label: string; chain: string }[];
        victim_addresses: { address: string; label: string; chain: string }[];
        exploit_txs: { hash: string; chain: string }[];
        sources?: string[];
      };
      const hackers = e.hacker_addresses.map((h) => `${h.address} (${h.label}, ${h.chain})`);
      const victims = e.victim_addresses.map((v) => `${v.address} (${v.label}, ${v.chain})`);
      const txs = e.exploit_txs.map((t) => `${t.hash} (${t.chain})`);
      return {
        src: {
          kind: 'dataset',
          ref: `exploits/${r.id}`,
          title: `${r.protocol} exploit, ${r.date}`,
          excerpt: `${r.protocol} was exploited on ${r.date} on ${e.chains.join(', ')}; loss $${Math.round(r.loss_usd).toLocaleString('en-US')}${e.loss_note ? ` (${e.loss_note})` : ''}; technique: ${r.technique || 'unknown'}. Attackers: ${hackers.join('; ')}. Victims: ${victims.join('; ')}. Exploit txs: ${txs.join('; ')}.`,
          url: e.sources?.[0],
        },
        data: {
          id: r.id,
          protocol: r.protocol,
          date: r.date,
          lossUsd: r.loss_usd,
          technique: r.technique,
          attackers: e.hacker_addresses,
          victims: e.victim_addresses,
          txs: e.exploit_txs,
        },
      };
    });
    return { items, note: items.length ? undefined : 'no matching exploit in the dataset' };
  },
};

export const workspace: Tool = {
  spec: {
    name: 'workspace',
    description:
      "What the user is looking at: the address chain they built (root first, with roles), the active address and the card they're inspecting.",
    parameters: { type: 'object', properties: {} },
  },
  async run(ctx) {
    const w = ctx.workspace;
    if (!w) return { items: [], note: 'no workspace attached' };
    return { items: [{ src: null, data: { ...w } }] };
  },
};
