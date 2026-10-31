// API-2: bounded multi-hop fund-flow tracing (depth <= 2).
// BFS over cached transfers, live Alchemy per expansion only on cache
// miss. Shared-counterparty detection lives here, not in the UI.
import type { Transfer } from '@/alchemy';
import type { AlchemyClient, Env } from '@/types';
import { riskLabels } from '@/stores/risk';
import { cachedTransfers, fresh, nowIso, storeTransfers } from '@/stores/transfers';

// Exploration wideness: a 'both' visit covers later 'in'/'out' visits.
const rank = (d: string): number => (d === 'both' ? 2 : 1);

async function exploredDir(env: Env, chain: string, address: string): Promise<string | null> {
  const row = await env.DB.prepare(
    'SELECT direction, fetched_at FROM expansions WHERE chain = ? AND address = ?',
  )
    .bind(chain, address)
    .first<{ direction: string; fetched_at: string }>();
  if (!row || !fresh(row.fetched_at, env)) return null;
  return row.direction;
}

async function markExplored(
  env: Env,
  chain: string,
  address: string,
  direction: string,
): Promise<void> {
  const prev = await env.DB.prepare(
    'SELECT direction FROM expansions WHERE chain = ? AND address = ?',
  )
    .bind(chain, address)
    .first<{ direction: string }>();
  const widest = !prev || rank(direction) >= rank(prev.direction) ? direction : prev.direction;
  await env.DB.prepare(
    'INSERT OR REPLACE INTO expansions (chain, address, direction, fetched_at) VALUES (?,?,?,?)',
  )
    .bind(chain, address, widest, nowIso())
    .run();
}

export interface TraceEdge {
  from: string;
  to: string;
  hash: string;
  asset: string;
  value: string;
  blockNumber: number;
  hop: number;
  dir: 'out' | 'in';
}

export interface TraceNode {
  address: string;
  depth: number;
  labels: Awaited<ReturnType<typeof riskLabels>>;
}

export interface TraceOptions {
  direction?: 'in' | 'out' | 'both';
  depth?: number;
  fanout?: number;
  minValue?: number;
  asset?: string;
}

export interface TraceResult {
  nodes: TraceNode[];
  edges: TraceEdge[];
  pathsOut: string[][];
  pathsIn: string[][];
  shared: { address: string; labels: TraceNode['labels']; via: string[] }[];
  truncatedNodes: { address: string; dropped: number }[];
  pathsTruncated: boolean;
  stats: { expansions: number; liveCalls: number; cacheHits: number; nodeCapHit: boolean };
}

const MAX_NODES = 300;
const MAX_PATHS_PER_SIDE = 500;

const num = (v: string | number | undefined): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

function keep(t: Transfer, opts: TraceOptions): boolean {
  if (opts.asset && t.asset !== opts.asset) return false;
  if (opts.minValue !== undefined && num(t.value) < opts.minValue) return false;
  return true;
}

export async function traceFunds(
  env: Env,
  client: AlchemyClient,
  chain: string,
  source: string,
  opts: TraceOptions,
): Promise<{ result: TraceResult; liveUsed: boolean; stale: boolean; empty: boolean }> {
  const src = source.toLowerCase();
  const direction = opts.direction ?? 'both';
  const depth = Math.min(Math.max(opts.depth ?? 2, 1), 2);
  const fanout = Math.min(Math.max(opts.fanout ?? 25, 1), 100);
  const keyed = Boolean(env.ALCHEMY_API_KEY);

  const nodes = new Map<string, { depth: number }>();
  const edges = new Map<string, TraceEdge>();
  const adjacency = new Map<string, Set<string>>();
  const truncatedNodes: TraceResult['truncatedNodes'] = [];
  const stats = { expansions: 0, liveCalls: 0, cacheHits: 0, nodeCapHit: false };
  let liveUsed = false;
  let stale = false;
  let empty = true;

  nodes.set(src, { depth: 0 });
  const link = (a: string, b: string) => {
    if (!adjacency.has(a)) adjacency.set(a, new Set());
    adjacency.get(a)?.add(b);
  };

  let frontier = [src];
  for (let level = 0; level < depth && frontier.length > 0; level++) {
    const next: string[] = [];
    for (const addr of frontier) {
      if (nodes.size >= MAX_NODES) {
        stats.nodeCapHit = true;
        break;
      }
      stats.expansions++;
      // Cache rows alone don't prove an address was explored: a row where
      // it is merely the counterparty says nothing about its own transfers.
      // The expansions table records completed visits; only those allow a
      // cache-only expansion.
      const seen = await exploredDir(env, chain, addr);
      let rows: Transfer[] = [];
      if (seen && rank(seen) >= rank(direction)) {
        rows = (await cachedTransfers(env, chain, addr, direction)).rows;
        stats.cacheHits++;
      } else if (keyed) {
        try {
          const { transfers } = await client.getTransfers(env, chain, addr, direction);
          stats.liveCalls++;
          liveUsed = true;
          await storeTransfers(env, chain, transfers);
          await markExplored(env, chain, addr, direction);
          rows = transfers;
        } catch {
          stale = true;
          rows = (await cachedTransfers(env, chain, addr, direction)).rows;
        }
      } else {
        stale = true;
        rows = (await cachedTransfers(env, chain, addr, direction)).rows;
      }
      if (rows.length === 0) continue;
      empty = false;
      // Highest-value first so the fanout cap keeps what matters.
      // Already-recorded edges are skipped before the cap: a re-fetched
      // edge (e.g. SRC->A seen again while expanding A) must not consume
      // a slot meant for genuine discoveries, nor count as dropped.
      const key = (t: Transfer): string =>
        `${t.hash}|${t.from.toLowerCase()}|${t.to.toLowerCase()}`;
      const freshEdges = [...rows]
        .filter((t) => keep(t, opts) && !edges.has(key(t)))
        .sort((a, b) => num(b.value) - num(a.value));
      const kept = freshEdges.slice(0, fanout);
      const dropped = freshEdges.length - kept.length;
      if (dropped > 0) truncatedNodes.push({ address: addr, dropped });
      for (const t of kept) {
        const from = t.from.toLowerCase();
        const to = t.to.toLowerCase();
        // New by construction (pre-filtered above); kept as a guard.
        if (!edges.has(key(t))) {
          edges.set(key(t), {
            from,
            to,
            hash: t.hash,
            asset: t.asset ?? '',
            value: String(t.value ?? ''),
            blockNumber: parseInt(t.blockNum ?? '0x0', 16) || 0,
            hop: level + 1,
            dir: from === addr ? 'out' : 'in',
          });
        }
        link(from, to);
        link(to, from);
        for (const n of [from, to]) {
          if (!nodes.has(n)) {
            nodes.set(n, { depth: level + 1 });
            next.push(n);
          }
        }
      }
    }
    frontier = next;
  }

  const edgeList = [...edges.values()];
  const out1 = edgeList.filter((e) => e.hop === 1 && e.from === src);
  const out2 = edgeList.filter((e) => e.hop === 2 && e.dir === 'out');
  const in1 = edgeList.filter((e) => e.hop === 1 && e.to === src);
  const in2 = edgeList.filter((e) => e.hop === 2 && e.dir === 'in');

  let pathsTruncated = false;
  const pathsOut: string[][] = [];
  for (const a of out1) {
    pathsOut.push([src, a.to]);
    for (const b of out2.filter((e) => e.from === a.to)) {
      if (pathsOut.length >= MAX_PATHS_PER_SIDE) {
        pathsTruncated = true;
        break;
      }
      pathsOut.push([src, a.to, b.to]);
    }
    if (pathsTruncated || pathsOut.length >= MAX_PATHS_PER_SIDE) {
      pathsTruncated = pathsOut.length >= MAX_PATHS_PER_SIDE;
      break;
    }
  }
  const pathsIn: string[][] = [];
  for (const a of in1) {
    pathsIn.push([a.from, src]);
    for (const b of in2.filter((e) => e.to === a.from)) {
      if (pathsIn.length >= MAX_PATHS_PER_SIDE) {
        pathsTruncated = true;
        break;
      }
      pathsIn.push([b.from, a.from, src]);
    }
    if (pathsTruncated || pathsIn.length >= MAX_PATHS_PER_SIDE) {
      pathsTruncated = pathsIn.length >= MAX_PATHS_PER_SIDE;
      break;
    }
  }

  const shared: TraceResult['shared'] = [];
  for (const [addr, neighbors] of adjacency) {
    if (addr === src || neighbors.size < 2) continue;
    shared.push({ address: addr, labels: [], via: [...neighbors].sort() });
  }

  const labeled: TraceNode[] = [];
  for (const [address, meta] of nodes) {
    const labels = await riskLabels(env, address);
    labeled.push({ address, depth: meta.depth, labels });
  }
  const byAddr = new Map(labeled.map((n) => [n.address, n.labels]));
  for (const s of shared) s.labels = byAddr.get(s.address) ?? [];

  return {
    result: {
      nodes: labeled,
      edges: edgeList,
      pathsOut,
      pathsIn,
      shared,
      truncatedNodes,
      pathsTruncated,
      stats,
    },
    liveUsed,
    stale,
    empty,
  };
}
