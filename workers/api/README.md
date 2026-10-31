# intel-terminal-api (API-1)

Address intelligence Worker. Cache-first (D1), Alchemy live on miss.
No key means D1-only responses with `live: false`. No wallet, ever.

## Endpoints

- `GET /v1/address/:chain/:address`
  → `{ address, chain, live, cached, fetched_at, labels, balances }`.
  `labels` are exact matches from the seeded risk lists
  (OFAC SDN + exploit attackers/victims). Each label hit is logged
  to `risk_hits` with list name + version + `exact`.
- `GET /v1/address/:chain/:address/transfers?direction=in|out|both&pageKey=`
  → `{ address, chain, live, cached, stale?, fetched_at, transfers, pageKey? }`.
  Fresh D1 rows serve without a live call. A miss (or `pageKey`)
  calls `alchemy_getAssetTransfers`, stores rows, then responds.
  Live failure falls back to cache with `stale: true`;
  with no cache and no key it answers 502.
- Validation: `zod` + `@hono/zod-validator`; bad chain/address → `400`
  with field errors (see `src/routes/address.ts`).

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
