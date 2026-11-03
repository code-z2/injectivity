# Intel Terminal

Intel Terminal investigates EVM wallets and tells you, with evidence, whether
a wallet is connected to something malicious and how confident you should be.

You start with an address or an ENS name. You trace where its funds have
flowed, check every counterparty against sanctions lists and a curated
dataset of DeFi exploits, explore the wallet network on an interactive graph,
and question a conversational agent that backs every claim with citations.
When you are done, you keep the investigation as a report you can share as a
PDF.

The live product is at [intel-terminal.pages.dev](https://intel-terminal.pages.dev).

## Know before you start

Intel Terminal covers six EVM chains: Ethereum, Base, BSC, Polygon,
Arbitrum, and Optimism. Anything else is rejected with an `unsupported chain`
error.

Traces are bounded at two hops and a capped number of counterparties per
step. A clean result means nothing was found inside those bounds. It does not
certify an address as safe.

A direct appearance on a sanctions list or in the exploit dataset is marked
**verified**. A wallet that has only transacted with a verified address is
marked **inferred**, and inference is never evidence of wrongdoing on its
own — exchanges, bridges, and widely used services share counterparties with
countless innocent users every day.

Nothing here connects to a wallet or asks you to sign anything. There is no
key custody anywhere in the product.

## Trace a wallet

Open the home page and enter an ENS name or wallet address in the field that
reads *Enter an ENS name or wallet address*. Press **Trace**. The terminal
resolves the name, loads balances, history, and the risk profile, and opens
the investigation page.

If you do not have an address yet, search the exploit quick list instead —
it covers major incidents including Binance — and jump straight to an
attacker's trail. Try this copy-pasteable example:

```text
https://intel-terminal.pages.dev/investigate/ethereum/vitalik.eth
```

Every investigation gets its own link in that form, so you can send someone
exactly what you are seeing.

If the name or address is malformed you get a validation error before
anything runs. If the chain in the link is not one of the six, the page does
not render and reports `unsupported chain`.

## Follow the money across hops

The investigation page maps the wallet's network as a graph you expand hop
by hop, with a transfer ledger underneath. Transfers arrive ranked by value
with balances in dollars, known services and routers labeled, and dust,
spoof tokens, and internal transfers filtered or flagged so noise stays out
of your way.

Select wallets to string them into a multi-hop path and open each step's own
ledger. Select any address to open it on the right block explorer; select any
transfer to open the transaction itself. A profile view summarizes each
wallet's top counterparties and current holdings.

If there is nothing cached to trace and no live key is configured, the trace
controls tell you so instead of rendering an empty graph.

## Ask the agent about what you see

The agent panel beside the graph answers plain-language questions about the
investigation. It thinks out loud while it works, pulls on-chain evidence
through its tools, and attaches citations to its claims. Short briefs on
individual wallets stream in as they are written.

For a quicker answer, the one-shot investigation mode returns a single
validated report without the back-and-forth: a written summary, findings with
verdicts, confidence levels, and the transaction hashes and list references
behind them, plus open questions and suggested next checks. Anything the
evidence cannot support is removed before delivery, and the report states how
much was removed.

When the work is done, the agent compiles a post-mortem report. It opens
only in the browser that generated it; the PDF link can be shared freely.

If the model call fails you get a plain failure message, not a partial
report. If no model key exists anywhere — yours or the service's — the
investigation tells you a key is required instead of running blind.

## Share what you found

One-shot investigations download as structured PDFs covering the graph, the
fund-flow paths, the verified-versus-inferred risk split, and the findings
with their sources. Agent post-mortems open as full report pages with PDFs
of their own, and saved reports can be reopened from your browser later.

## Bring your own model and RPC

Open **Settings** to point the terminal at your own infrastructure:

- **Chain** — which of the six networks you investigate.
- **Custom RPC** — your own endpoint for chain reads and name resolution.
  It must be a valid `https` URL; anything else is rejected with an
  `x-rpc-url must be a valid https URL` error. The terminal health-checks it
  live per chain.
- **Custom model** — your own OpenAI-compatible model: base URL, model name,
  key, and reasoning effort. All three of base URL, model, and key are
  required together; a partial entry is rejected with a message saying
  exactly that. Your model handles research, writing, and summaries; the
  safety checks always keep running on the service model.
- **Appearance** — light, dark, or follow your system.

A probe action reports what your custom model supports without ever showing
the key back to you.

## Where your data comes from

The terminal's judgments rest on its lists. Every exploit row names both
attacker and victim with complete addresses on a named chain; rows that
cannot meet that bar stay out of the dataset instead of being approximated
in. Sanctions data tracks 123 EVM addresses with the upstream source recorded
per entry, 903 flagged addresses are indexed in total, and well-known
protocol contracts are checked against their on-chain code. Any match or
label traces back to where it came from.

On-chain reads happen on demand when you investigate and are cached
afterwards, so repeat lookups come from cache and nothing polls the chain in
the background. Model access is bring-your-own-key with a service fallback:
you are asked for a key only when neither yours nor the service's exists.

## Repository map

| Component | What lives there |
| --- | --- |
| [Web app](web/) | The landing, the investigation page with graph and ledger, the agent panel, report pages, settings, and themes |
| [Web routes](web/src/routes/) | `/` for the landing, `/investigate/$chain/$target` for shareable investigations, `/report/$key` for private post-mortems |
| [API Worker](workers/api/) | Routes, chain clients, the trace engine, risk assessment, the agent loop, the investigation pipeline, and PDF export |
| [Investigative agent](workers/api/src/agent/) | The multi-step loop, its tools, the fact ledger, per-session state, and post-mortem rendering |
| [Seed data](data/seeds/) | `exploits.json` for curated EVM DeFi hacks, `ofac.json` for sanctioned addresses, `protocols.json` for verified protocol contracts, plus the wider working sets |
| [API SQL](workers/api/sql/) | `schema.sql` and `seed.sql`, the source of truth, while `migrations/` holds what is already applied remotely |
| [API tests](workers/api/test/) | Sixty-plus contract and regression tests, run with `bun test` and fully offline by construction |
| [Design](docs/DESIGN.md) | The scoped work plan across infrastructure, API, language model, UI, integration, and tests |
| [Build log](docs/system.md) | A running record of what was built, how it was built, and what each piece unlocked |

## Run it locally

You need [bun](https://bun.sh) and [wrangler](https://developers.cloudflare.com/workers/wrangler/).
Before anything remote, check that `wrangler whoami` shows the Cloudflare
account you intend to deploy with.

Start the API first. These commands install dependencies, create and seed a
local database, and serve the API on port 8787:

```sh
cd workers/api
bun install
bun run migrate && bun run seed
printf 'ALCHEMY_API_KEY=...\nMODEL_API_KEY=...\n' > .dev.vars  # gitignored; keys only
bun run dev
```

Then start the web app in a second terminal, pointed at that local API:

```sh
cd web
bun install
VITE_API_BASE=http://127.0.0.1:8787 bun run dev
```

Open `http://127.0.0.1:5173`. The local database ships with the full set of
flagged addresses, so risk screening works immediately. Transfer history
accumulates the first time you look addresses up with a key configured and
stays cached afterwards. Agent conversations also run locally, so the full
loop works without remote resources.

## Check the work

The API suite runs anywhere without secrets:

```sh
cd workers/api
bun run check    # typecheck with tsc
bun test         # contract and regression tests — no live keys, ever
bun run int1     # the full end-to-end loop: fixtures, lookup, trace, screen, export
```

Tests use a database built from the committed schema and seed, and they
reach the network through clients that throw on any live call, so a test
that accidentally goes live fails instead of passing quietly. Checks against
real chain and model APIs — including the agent chat and eval scripts — are
manual-only and sit behind explicit opt-in flags.

For the web app:

```sh
cd web
bun run check    # typecheck with tsc
bun run build    # production build
```

## Deploy it

The remote database is created once and its id is recorded in
`workers/api/wrangler.toml`:

```sh
cd workers/api
wrangler d1 create intel-terminal
wrangler d1 execute intel-terminal --remote --file=./sql/schema.sql
wrangler d1 execute intel-terminal --remote --file=./sql/seed.sql
wrangler secret put ALCHEMY_API_KEY
wrangler secret put MODEL_API_KEY
wrangler deploy
```

Then build the web app against the deployed API and publish it:

```sh
cd web
VITE_API_BASE=https://<your-worker>.workers.dev bun run build
wrangler pages deploy dist --project-name=intel-terminal
```

Secrets are set with `wrangler secret put` and never enter source control,
since `.dev.vars` is gitignored. The seed files contain only public
attribution data — addresses, transaction hashes, and links to published
sources — and every risk-list row carries the upstream version it came from,
so a match seen in production traces back to the list entry behind it.
