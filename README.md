# Intel Terminal

Intel Terminal is an AI-powered security investigation terminal for EVM
blockchains. It answers a single question with evidence: is this wallet
connected to something malicious, and how confident should you be?

You begin with nothing more than a wallet address or an ENS name. From there,
the terminal traces where funds have flowed, checks every counterparty
against sanctions lists and a curated dataset of DeFi exploits, maps the
network of connected wallets as an interactive graph, and lets you
interrogate the whole picture through a conversational agent that backs every
claim with citations. Completed investigations become reports you can keep
and share as PDFs.

The live product is at [intel-terminal.pages.dev](https://intel-terminal.pages.dev),
backed by an API at [intel-terminal-api.anyaogupeter601.workers.dev](https://intel-terminal-api.anyaogupeter601.workers.dev).

## Why this exists

A block explorer tells you exactly what happened inside one transaction, and
for many jobs that is enough. But anyone investigating a wallet — whether
before accepting funds, reviewing a counterparty, or researching an incident —
is really asking about relationships. Has this wallet been transacting with
sanctioned addresses or known hackers? Did its funds pass through the victim
of a major exploit? And when a connection shows up, is it a direct and proven
link, or just a shared counterparty two hops away that could easily mean
nothing?

That last distinction is where most tooling falls short, and it is the idea
Intel Terminal is built around. A direct appearance on a sanctions list or in
the exploit dataset is marked **verified**. A wallet that has simply
transacted with a verified address is marked **inferred**, shown in its own
separate section, and always presented alongside the wallet the association
runs through and a clear statement that association on its own proves
nothing. The two categories are never mixed — not on screen, not in the API,
and not in anything the AI writes.

The machine-generated content is held to the same standard. Draft findings
are re-checked against the actual trace data and risk matches before anything
is kept, claims the evidence cannot support are removed, and the report
discloses how much was removed. Every investigation therefore arrives with
both its conclusions and the limits of what it covered.

## What it gives you

**A starting point that asks almost nothing of you.** The front page is a
single search. You paste an address or a name like `vitalik.eth`, or you pick
up a thread from the quick list of major exploits — including the Binance
incident — and jump straight to an attacker's trail. Every investigation gets
its own shareable link, so you can send someone exactly what you are seeing.

**A trace view built for following money.** The investigation page maps the
wallet's network as an interactive graph you can expand hop by hop, with a
transfer ledger beneath it. Transfers arrive ranked by value with balances
shown in dollars, known services and routers labeled, and dust, spoof tokens,
and internal transfers filtered or flagged so the noise stays out of your
way. You can string wallets together into a multi-hop path and open each
step's own ledger, and everything links out to the block explorer so any
detail can be checked independently. A profile view summarizes each wallet's
top counterparties and current holdings.

**A conversational agent that shows its work.** Beside the graph, you can
simply ask about the investigation in plain language. The agent thinks out
loud as it works, pulls on-chain evidence through its tools, and answers with
citations attached to its claims. Short briefs on individual wallets stream in
as they are written. When the work is done, the agent compiles a full
post-mortem report that only you can open, with a PDF version you can pass
around. For quicker questions, a one-shot investigation mode gives you a
single validated report without the back-and-forth.

**A risk assessment that keeps its categories apart.** Verified matches list
the exact list, role, and version behind each one. Inferred associations show
the intermediate wallet and carry the reminder that they are leads, not
verdicts. When nothing is found, the terminal says so directly and tells you
how many counterparties it screened, so a clean result reads as the outcome
of work rather than the absence of it.

**Your model, your data source, your theme.** The Settings dialog lets you
choose the chain, point the terminal at your own RPC endpoint for chain reads
and name resolution, and plug in your own OpenAI-compatible model with your
own key and reasoning effort — while the safety checks always keep running on
the service's own model. A probe tells you what your model supports without
ever exposing the key. The interface comes in light and dark and follows your
system unless you override it.

**Work you can keep and share.** One-shot investigations download as
structured PDFs covering the graph, the fund-flow paths, the risk split, and
the findings with their sources. Agent post-mortems open as full report
pages with PDFs of their own.

## Where it runs and what sits underneath

Intel Terminal runs on Cloudflare: a Worker and database serve the API, and
Pages hosts the front end. On-chain data is fetched on demand when you
investigate something and then cached, so repeat lookups are instant and
nothing polls the chain in the background.

The terminal's judgments rest on its lists, which are curated under a strict
rule: every exploit row must name both attacker and victim with complete
addresses on a named chain, and rows that cannot meet that bar are kept out
of the dataset rather than approximated into it. The sanctions data tracks
123 EVM addresses with the upstream source recorded per entry, 903 flagged
addresses are indexed in total, and well-known protocol contracts are
verified against their on-chain code — so any match or label can be traced
back to where it came from.

## Repository map

| Component | What lives there |
| --- | --- |
| [Web app](web/) | The landing, the trace view with its graph and ledger, the agent panel, the report pages, settings, and theming |
| [Web routes](web/src/routes/) | `/` for the landing, `/investigate/$chain/$target` for shareable investigations, `/report/$key` for private post-mortems |
| [API Worker](workers/api/) | Hono routes, Alchemy clients, the trace engine, risk assessment, the agent loop, the investigation pipeline, and PDF export |
| [API routes](workers/api/src/routes/) | `address` for intel and history, `trace` for fund flows, `agent` for sessions and summaries, `reports` for saved reports and PDFs, `exploits` for dataset search, `models` for custom-model probing, `profile` for profiles and balances |
| [Investigative agent](workers/api/src/agent/) | The multi-step loop with chain, docs, local, and memory tools, a fact ledger with a verification gate, per-session state, and post-mortem rendering |
| [Model layer](workers/api/src/llm/) | Per-role server models, visitor custom-model configuration, OpenAI-compatible adapters, and capability probing |
| [Seed data](data/seeds/) | `exploits.json` for curated EVM DeFi hacks, `ofac.json` for sanctioned addresses, `protocols.json` for verified protocol contracts, plus the wider working sets |
| [API SQL](workers/api/sql/) | `schema.sql` and `seed.sql`, the source of truth, while `migrations/` holds what has already been applied to D1 |
| [API tests](workers/api/test/) | Sixty-plus contract and regression tests — trace caps, risk match types, cache behavior, agent loop, memory, ledger, sessions — run with `bun test` and fully offline by construction |
| [Design](docs/DESIGN.md) | The scoped work plan across infrastructure, API, language model, UI, integration, and tests, with completion criteria for each part |
| [Build log](docs/system.md) | A running record of what was built, how it was built, and what each piece unlocked |

## Running it locally

You need [bun](https://bun.sh) and [wrangler](https://developers.cloudflare.com/workers/wrangler/).
Before anything remote, check that `wrangler whoami` shows the Cloudflare
account you intend to deploy with.

Start the API first. The commands below install dependencies, create and seed
a local database, and serve the API on port 8787:

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

Opening `http://127.0.0.1:5173` lands you on the search page. From there you
can start from an address, a name, or the exploit quick list, then pick a
chain, set a custom RPC, add your own model, or switch themes from Settings.
Agent conversations also run locally, so the full loop works without any
remote resources. The local database ships with the full set of flagged
addresses, so risk screening works immediately; transfer history accumulates
the first time you look addresses up with a key configured and stays cached
afterwards.

## Checking the work

The API suite is the quality gate and runs anywhere without secrets:

```sh
cd workers/api
bun run check    # typecheck with tsc
bun test         # contract and regression tests — no live keys, ever
bun run int1     # the full end-to-end loop: fixtures, lookup, trace, screen, export
```

Tests build an in-memory database from the committed schema and seed, and
they reach the network through clients that throw on any live call, so a test
that accidentally goes live fails instead of passing quietly. Checks against
the real Alchemy and model APIs — including the agent chat and eval scripts —
are manual-only and sit behind explicit opt-in flags.

For the web app:

```sh
cd web
bun run check    # typecheck with tsc
bun run build    # production build
```

## Deploying it

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
so a match seen in production can always be traced back to the list entry
behind it.

## A note on limits

Two design boundaries are worth stating plainly. Traces are bounded in depth
and in counterparties per step, so a clean result means nothing was found
within those bounds rather than certifying an address as safe. And an
inferred association is a lead for further work, never evidence of wrongdoing
on its own — exchanges, bridges, and widely used services share
counterparties with countless innocent users every day, which is exactly why
the product keeps inference visibly separate from verification.
