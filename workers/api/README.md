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

## Local dev (no Cloudflare account needed)

```bash
npm install
npm run check        # tsc --noEmit
npm run migrate      # schema into local D1 (Miniflare)
python3 scripts/make_seed.py
npm run seed         # 123 OFAC + 752 exploit screening rows
npm run dev          # http://127.0.0.1:8787
```

Try offline (no `ALCHEMY_API_KEY` in `.dev.vars`): an exploit-listed
attacker address returns its labels with `live: false`.

## Deploy

```bash
npx wrangler d1 create intel-terminal   # put the id in wrangler.toml
npx wrangler d1 execute intel-terminal --remote --file=./schema.sql
npx wrangler d1 execute intel-terminal --remote --file=./seed.sql
npx wrangler secret put ALCHEMY_API_KEY
npm run deploy
```

## Env

| var | default | meaning |
|---|---|---|
| `ALCHEMY_API_KEY` | (empty) | live calls off when empty |
| `DEFAULT_CHAIN` | `ethereum` | UI default, not enforced here |
| `CACHE_TTL_SECONDS` | `300` | D1 transfer freshness |
| `DB` | (binding) | D1 `intel-terminal` |
