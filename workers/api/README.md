# intel-terminal-api (API-1)

Address intelligence Worker. Cache-first (D1), Alchemy live on miss.
No key means D1-only responses with `live: false`. No wallet, ever.

## Endpoints

- `GET /v1/address/:chain/:address`
  → `{ address, chain, live, cached, fetched_at, labels, risk, balances }`.
  `labels` are exact matches from the seeded risk lists
  (OFAC SDN + exploit attackers/victims). `risk` is the API-3 assessment:
  `{ level: verified|inferred|none, matches, screened, source, note? }`.
  Exact hits are `verified` (`match_type: exact`); 1-hop counterparties of
  verified addresses are `inferred` (`match_type: inferred:R1`,
  `rule: R1-direct-counterparty`, verified address in `via`). Inferred never
  appears in `labels`. Counterparties read cache, or fill live once when
  keyed; thin cache + no key → `none` with a note, never a guess. Every hit
  (exact and inferred) is logged to `risk_hits` with list name + version.
- `GET /v1/address/:chain/:address/transfers?direction=in|out|both&pageKey=`
  → `{ address, chain, live, cached, stale?, fetched_at, transfers, pageKey? }`.
  Fresh D1 rows serve without a live call. A miss (or `pageKey`)
  calls `alchemy_getAssetTransfers`, stores rows, then responds.
  Live failure falls back to cache with `stale: true`;
  with no cache and no key it answers 502.
- Validation: `zod` + `@hono/zod-validator`; bad chain/address → `400`
  with field errors (see `src/routes/address.ts`).
- `GET /v1/trace/:chain/:address?direction=both&depth=2&fanout=25&minValue=&asset=`
  → `{ nodes, edges, pathsOut, pathsIn, shared, truncatedNodes, stats }`.
  BFS to depth ≤ 2, cache-first per expansion (an `expansions` table records
  completed visits — a cached row alone doesn't prove an address was
  explored). Fanout cap keeps top-value edges, drops reported per address.
  `shared` lists non-source addresses adjacent to 2+ traced nodes with their
  intermediaries. Repeat traces serve fully from cache (`live: false`).

## Layout (mirrors knot relay-proxy)

- `src/app.ts` — `createApp(options?)` factory; CORS near routes, `hono/rpc`
  client type exported from `src/types/`.
- `src/routes/address.ts` — the two endpoints, thin (parse → store → respond).
- `src/stores/risk.ts` — label lookup + `risk_hits` logging.
- `src/stores/transfers.ts` — cache read/write, sweep-cap, live fetch.
- `src/alchemy.ts` — `AlchemyClient` + `alchemyClient`; inject a fake via
  `createApp({ alchemy })` for offline tests.
- `src/constants/chains.ts`, `src/types/` — chain table, shared env/types.
- `migrations/0001_initial.sql` — D1 schema (wrangler `migrations_dir`).

## Local dev (no Cloudflare account needed)

```bash
bun install
bun run check        # tsc --noEmit
bun run migrate      # schema into local D1 (Miniflare)
bun run gen:seed
bun run seed         # 123 OFAC + 752 exploit screening rows
bun run dev          # http://127.0.0.1:8787
```

Try offline (no `ALCHEMY_API_KEY` in `.dev.vars`): an exploit-listed
attacker address returns its labels with `live: false`.

## Deploy

```bash
bunx wrangler d1 create intel-terminal   # put the id in wrangler.toml
bunx wrangler d1 execute intel-terminal --remote --file=./sql/schema.sql
bunx wrangler d1 execute intel-terminal --remote --file=./sql/seed.sql
bunx wrangler secret put ALCHEMY_API_KEY
bun run deploy
```

## Env

| var                 | default    | meaning                       |
| ------------------- | ---------- | ----------------------------- |
| `ALCHEMY_API_KEY`   | (empty)    | live calls off when empty     |
| `DEFAULT_CHAIN`     | `ethereum` | UI default, not enforced here |
| `CACHE_TTL_SECONDS` | `300`      | D1 transfer freshness         |
| `DB`                | (binding)  | D1 `intel-terminal`           |
