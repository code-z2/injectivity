# Intel Terminal

Intel Terminal is an AI-powered security investigation terminal for EVM
blockchains. It answers a single question with evidence: is this wallet
connected to something malicious, and how confident should you be?

You begin with nothing more than a wallet address or an ENS name. From there,
the terminal traces where funds have flowed, checks every counterparty
against sanctions lists and a curated dataset of DeFi exploits, draws the
network of connected wallets as an interactive graph, and has an AI
investigator write up the findings as a structured report you can download as
a PDF.

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
and not in the AI-written report.

The AI investigator is held to the same standard. It drafts findings from the
evidence bundle, and then the server re-checks every claim against the actual
trace data and risk matches before anything is kept. Claims the evidence
cannot support are removed, and the report discloses how many were removed.
Every investigation therefore arrives with both its conclusions and the
limits of what it covered.

## What it gives you

**A starting point that asks almost nothing of you.** The terminal opens on a
search console. You paste an address or a name like `vitalik.eth`, optionally
choose a chain and adjust the model settings, and press Trace. Name resolution,
balances, transaction history, and the risk profile all load from there.

**Fund-flow tracing across six EVM chains.** From any wallet you can expand
its flows up to two hops in either direction on Ethereum, Base, BSC, Polygon,
Arbitrum, and Optimism, controlling direction, depth, and how many
counterparties to consider at each step. Wallets that sit between the paths
you are tracing are identified during the computation, so the structure you
see reflects the data rather than guesswork.

**A visual map of the wallet network.** The trace renders as an interactive
graph where verified malicious wallets appear in red, shared counterparties
in amber, and the wallet you searched stays boxed so you never lose your
place. Selecting any wallet opens its page on the appropriate block explorer,
and selecting any transfer opens the transaction itself, so every visual
element resolves to something you can independently check.

**A risk assessment that keeps its categories apart.** Verified matches list
the exact list, role, and version behind each one. Inferred associations show
the intermediate wallet and carry the reminder that they are leads, not
verdicts. When nothing is found, the terminal says so directly and tells you
how many counterparties it screened, so a clean result reads as the outcome
of work rather than the absence of it.

**An investigator's write-up, with citations.** One click runs a grounded AI
investigation over the full evidence bundle. The report opens with a summary,
then gives each finding with its verdict, confidence level, and the exact
transaction hashes and list references behind it. Open questions and suggested
next steps close it out. Progress streams while it runs, and only the
validated report is delivered — the model's unapproved drafts are never
shown.

**Work you can keep and share.** Completed investigations are saved and
export as four-section PDF reports covering the graph snapshot, the
fund-flow paths, the verified-versus-inferred risk split, and the findings
with their sources. Saved reports can also be reopened from your browser
later.

## Where it runs and what sits underneath

Intel Terminal runs on Cloudflare: a Worker and a D1 database serve the API,
and Pages hosts the front end. On-chain data is fetched on demand through
Alchemy when you investigate something and then cached, so repeat lookups are
instant and nothing polls the chain in the background.

The terminal's judgments rest on its lists, which are curated under a strict
rule: every exploit row must name both attacker and victim with complete
addresses on a named chain, and rows that cannot meet that bar are kept out
of the dataset rather than approximated into it. The sanctions data tracks
123 EVM addresses with the upstream source recorded per entry, and 866
flagged addresses are indexed in total, so any match can be traced back to
where it came from.

Model access is bring-your-own-key. You may supply your own model key in the
Settings menu, and otherwise the service falls back to its configured key —
you are only asked for one when neither exists. The default model and its
reasoning effort can be adjusted per investigation.

## Repository map

| Component | What lives there |
| --- | --- |
| [Web app](web/) | The search console, the investigation terminal, the wallet mesh graph, the risk panel, the report view, and PDF download |
| [API Worker](workers/api/) | Hono routes, Alchemy clients, the trace engine, risk assessment, the investigation pipeline, and PDF export |
| [API routes](workers/api/src/routes/) | `address` for intel and history, `trace` for fund flows, `investigate` for AI reports, `reports` for saved reports in JSON and PDF, plus `agent`, `exploits`, `models`, and `profile` |
| [Investigative agent](workers/api/src/agent/) | A multi-step agent loop with tools, a fact ledger, and a verification gate for deeper investigations |
| [Seed data](data/seeds/) | `exploits.json` for curated EVM DeFi hacks, `ofac.json` for sanctioned addresses, `master.json` and `protocols.json` for the wider working sets |
| [API SQL](workers/api/sql/) | `schema.sql` and `seed.sql`, the source of truth, while `migrations/` holds what has already been applied to D1 |
| [API tests](workers/api/test/) | The contract and regression suite, run with `bun test` and fully offline by construction |
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

Opening `http://127.0.0.1:5173` lands you on the search console. From there
you can pick a chain, set a custom RPC for name resolution, add your own
model key, and trace your first address. The local database ships with the
full set of flagged addresses, so risk screening works immediately; transfer
history accumulates the first time you look addresses up with a key
configured and stays cached afterwards.

## Checking the work

The API suite is the quality gate and runs anywhere without secrets:

```sh
cd workers/api
bun run check    # typecheck with tsc
bun test         # contract and regression tests — no live keys, ever
bun run int1     # the full end-to-end loop: fixtures, lookup, trace, screen, export
```

Tests build an in-memory database from the committed schema and seed, and
they reach the network through a client that throws on any live call, so a
test that accidentally goes live fails instead of passing quietly. Checks
against the real Alchemy and Muse APIs are manual-only and sit behind an
explicit opt-in flag.

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

Two design boundaries are worth stating plainly. Traces are bounded at two
hops and one hundred counterparties per step, so a clean result means nothing
was found within those bounds rather than certifying an address as safe. And
an inferred association is a lead for further work, never evidence of
wrongdoing on its own — exchanges, bridges, and widely used services share
counterparties with countless innocent users every day, which is exactly why
the product keeps inference visibly separate from verification.
