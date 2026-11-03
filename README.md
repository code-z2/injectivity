# Intel Terminal

**Investigate any wallet. No wallet needed.**

Intel Terminal is an AI-powered security investigation terminal for EVM
blockchains. You paste in a wallet address or an ENS name — for example
`vitalik.eth` or `0x8B1b…D3b` — and the terminal tells you what that wallet
has been touching: where its funds came from, where they went, whether any
counterparty appears on sanctions or exploit lists, and how all of it connects
on a visual graph. An AI investigator then reads the whole picture and writes
it up as a structured report you can download as a PDF.

It is built for anyone who needs to answer one question with confidence:
**is this wallet connected to something malicious, and how sure should I be?**

Live product: [intel-terminal.pages.dev](https://intel-terminal.pages.dev) ·
API: [intel-terminal-api.anyaogupeter601.workers.dev](https://intel-terminal-api.anyaogupeter601.workers.dev)

## Why Intel Terminal exists

A block explorer will show you exactly what happened inside a single
transaction. That is useful, but it is not the question an investigator is
actually asking. The real question is about relationships: has this wallet
been transacting with sanctioned addresses, with known hackers, with the
victims of major exploits? And if there is a connection, is it a direct,
proven link — or just a shared counterparty two hops away that could mean
nothing at all?

Most tools blur that distinction. Intel Terminal is built around it. When an
address appears directly on a sanctions list or in our curated exploit
dataset, the terminal marks it **verified**. When an address has simply
transacted with a verified address — one hop away — it is marked **inferred**,
shown in its own separate section, and always accompanied by a plain statement
that association is not wrongdoing. Verified findings and inferred
associations are never mixed together, not in the UI, not in the API, and not
in the AI-generated report.

The AI investigator works under the same rule. It proposes findings, and then
the server checks every single claim against the real trace data and the real
risk matches before anything is kept. Any finding the evidence cannot support
is removed, and the report tells you how many were removed. You always see
the coverage limits of the investigation alongside its conclusions.

## What you can do with it

**Look up any address or ENS name.** Type a 0x address or a name like
`vitalik.eth` into the console and the terminal resolves it, loads its
intelligence profile, token balances, and transaction history. Results come
from a fast local cache first and fill in live on-chain data when it is
missing. If you have not configured an API key, you still get everything the
cache holds — the terminal tells you honestly what is live and what is
cached, and it never invents data it does not have.

**Trace where funds flow.** From any address you can expand a fund-flow trace
up to two hops deep, in either direction, across six EVM chains (Ethereum,
Base, BSC, Polygon, Arbitrum, and Optimism). You control the direction, the
depth, and how many counterparties to consider per step. The detection of
shared counterparties — wallets that sit between the paths you are tracing —
happens on the server, so the graph you see is computed, not eyeballed.

**See the wallet mesh.** The trace renders as an interactive graph. Wallets
that are verified as malicious appear in red. Shared counterparties appear in
amber. The wallet you searched is boxed so you never lose your place. Clicking
any wallet opens its page on the right block explorer; clicking any transfer
opens the transaction itself.

**Read the risk split.** Below the profile, the terminal separates everything
it found into two sections. The verified section lists exact matches against
the sanctions and exploit lists, with the list name and version for each one.
The inferred section lists one-hop associations, shows you exactly which
wallet the association runs through, and reminds you that an association on
its own proves nothing. When nothing is found, the terminal says so plainly
and tells you how many counterparties it screened to reach that conclusion.

**Ask the AI investigator.** With one click, a grounded AI investigation runs
over the full evidence bundle: the trace, the risk matches, and the balances.
You get back a written summary, individual findings each tagged with a verdict
(verified or inferred), a confidence level, and the exact evidence behind
them — transaction hashes and list references you can click and check
yourself. Open questions and recommended next steps come with every report.
The investigation streams its progress and then delivers only the validated
report; the model's unverified draft text is never shown to you.

**Export and keep your work.** Every completed investigation is saved and can
be downloaded as a PDF report with four sections: a snapshot of the fund-flow
graph, the full fund-flow paths, the verified-versus-inferred risk split, and
the findings with their cited sources. You can also keep reports in your
browser's local storage and reopen them later.

## What it is not

Intel Terminal is deliberately narrow about what it claims, and you should
know its boundaries before relying on it.

It is **not a wallet**. Nothing in the product connects to a wallet, asks you
to sign anything, or moves funds. There is no key custody anywhere in the
system, and there never will be.

It is **not a guilt engine**. An inferred association means one thing: this
wallet transacted with a flagged wallet. Exchanges, bridges, and popular
services share counterparties with thousands of innocent users every day.
The product labels inference as inference everywhere it appears.

It is **not an always-on surveillance system**. Nothing polls the chain in
the background. On-chain data is fetched on demand when you investigate
something, and then kept in cache so repeat lookups are instant. The standing
infrastructure cost is effectively zero when nobody is using it.

It is **not exhaustive**. Traces are bounded at two hops and at most one
hundred counterparties per expansion step, and every report states what it
covered. A clean result means nothing was found within those bounds — it is
not a certificate that an address is safe.

## How an investigation flows

When you trace an address, the terminal works through the same pipeline every
time:

1. **Resolve and look up.** ENS names are resolved to addresses, and the
   terminal loads the intelligence profile: exact risk-list matches,
   balances, and cached history.
2. **Trace.** A breadth-first search walks fund flows out to depth two,
   reading cached transfers first and fetching live data only for gaps, only
   when an API key is available.
3. **Screen.** Every address touched is checked against the risk lists. Exact
   matches become verified findings. Direct counterparties of verified
   addresses become inferred findings, each annotated with the verified
   address it runs through. Everything else is left alone.
4. **Investigate.** The evidence bundle — trace edges, risk matches, and
   coverage limits — is sent to the language model with strict instructions
   to cite only what is in the bundle. The server then re-checks every
   finding the model returns, removes anything unsupported, and records how
   much was removed.
5. **Report.** The validated report is stored, shown in full with clickable
   evidence, and made available as a JSON document and as a PDF export.

Model access follows a bring-your-own-key design. You can supply your own
model key per request in the Settings menu, and the service falls back to its
own configured key when you do not. You will only ever be asked for a key
when neither exists. The default model and its reasoning effort are
configurable per investigation.

## The data underneath

The terminal's judgments are only as good as its lists, so the seed data is
curated with strict rules. Every row in the exploit dataset names both the
attacker and the victim with complete, checksummed addresses on a named
chain — rows that cannot meet that bar are held out of the strict file rather
than guessed into it. The sanctions list tracks 123 EVM addresses with the
exact upstream commit each entry came from, so any match can be traced back
to its source. In total, 866 flagged addresses are indexed and served from
the cache from the first lookup.

## Repository map

| Component | What lives there |
| --- | --- |
| [Web app](web/) | The spotlight console, the investigation terminal, the wallet mesh graph, the risk panel, the report view, and PDF download |
| [API Worker](workers/api/) | Hono routes, Alchemy clients, the trace engine, risk assessment, the LLM investigation pipeline, and PDF export |
| [API routes](workers/api/src/routes/) | `address` for intel and history, `trace` for fund flows, `investigate` for AI reports, `reports` for saved reports in JSON and PDF, plus `agent`, `exploits`, `models`, and `profile` |
| [Investigative agent](workers/api/src/agent/) | A multi-step agent loop with tools, a fact ledger, and a verification gate for deeper investigations |
| [Seed data](data/seeds/) | `exploits.json` for curated EVM DeFi hacks, `ofac.json` for sanctioned addresses, `master.json` and `protocols.json` for the wider working sets |
| [API SQL](workers/api/sql/) | `schema.sql` and `seed.sql`, the source of truth — the `migrations/` folder holds the migrations already applied to D1 |
| [API tests](workers/api/test/) | The contract and regression suite, which runs with `bun test` and is fully offline by construction |
| [Design](docs/DESIGN.md) | The scoped work plan (infrastructure, API, LLM, UI, integration, tests) with completion criteria for each piece |
| [Build log](docs/system.md) | A running record of what was built, how, why, and what it unlocked |

## Running it locally

You need [bun](https://bun.sh) and [wrangler](https://developers.cloudflare.com/workers/wrangler/).
Check that `wrangler whoami` shows the Cloudflare account you intend to deploy
with before doing anything remote.

Start the API first. It installs its dependencies, creates and seeds a local
D1 database, and serves on port 8787:

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

Open `http://127.0.0.1:5173`. You land on the spotlight console: paste an ENS
name or an address, open Settings to choose your chain, set a custom RPC for
name resolution, or add your own model key — then press Trace to step into
the terminal. The local database starts with the full set of 866 flagged
addresses but no transfer history, so risk screening works immediately while
fund-flow history fills in the first time you look an address up with a key
configured, and stays cached after that.

## Checking your work

The API suite is the quality gate, and it is designed to run anywhere
without secrets:

```sh
cd workers/api
bun run check    # typecheck with tsc
bun test         # contract and regression tests — no live keys, ever
bun run int1     # the full end-to-end loop: fixtures, lookup, trace, screen, export
```

The tests build an in-memory database from the committed schema and seed and
talk to it through an Alchemy client that throws on any live call, so a test
that accidentally reaches the network fails loudly instead of passing
quietly. Anything that touches the real Alchemy or Muse APIs is manual-only
and sits behind an explicit opt-in flag.

For the web app:

```sh
cd web
bun run check    # typecheck with tsc
bun run build    # production build
```

## Deploying it

Production runs on Cloudflare: a Worker and D1 for the API, Pages for the
front end. The remote database is created once and its id is wired into
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

Secrets are set with `wrangler secret put` and never enter source control —
`.dev.vars` is gitignored. The seed files contain only public attribution
data (addresses, transaction hashes, and links to published sources), and
every risk-list row carries the upstream version it came from, so a match in
production can always be traced back to the list entry behind it.
