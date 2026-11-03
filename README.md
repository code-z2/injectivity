# Intel Terminal

**Investigate any wallet. No wallet needed.**

Intel Terminal is an AI-powered on-chain security investigation terminal for
EVM chains. Paste a wallet address or an ENS name and it traces fund flows,
screens them against sanctioned and exploit-linked addresses, visualizes the
wallet mesh, and produces a grounded intelligence report — separating verified
malicious activity from inferred association at every step.

Live: [intel-terminal.pages.dev](https://intel-terminal.pages.dev) ·
API: [intel-terminal-api.anyaogupeter601.workers.dev](https://intel-terminal-api.anyaogupeter601.workers.dev)

## Why this exists

Block explorers answer "what happened in this transaction." They do not answer
the question an investigator actually asks: **"is this wallet connected to
something malicious, and how confident should I be?"**

A shared counterparty is not proof of wrongdoing. A direct hit on a sanctions
list is close to it. Most tooling collapses that distinction; Intel Terminal
keeps it structural. Exact list matches are `verified`. One-hop counterparties
of verified addresses are `inferred` — shown in their own section, never mixed
into labels, never exported as verdicts without qualification. The LLM
investigator is bound by the same rule: its draft findings are validated
against the actual trace edges and risk matches, and anything it cannot cite
is stripped before it reaches you, with the strip count reported.

## What you can do

- **Look up any address or ENS name.** Intel, balances, and paginated history,
  cache-first from D1 with live Alchemy fill on miss. No key means D1-only
  responses with `live: false` — never a guess.
- **Trace fund flows.** Bounded BFS to depth 2 across six EVM chains, with
  direction, fanout, value, and asset controls. Shared counterparties are
  detected server-side, not eyeballed in the client.
- **See the mesh.** A Cytoscape wallet graph: verified nodes in red, shared
  counterparties in amber, the searched root boxed. Every node links to its
  explorer page; every edge links to its transaction.
- **Read the risk split.** Verified matches and inferred associations render
  as two distinct sections, with the one-hop path (`via`) shown for each
  inference and a plain-language disclaimer that association is not
  wrongdoing.
- **Get an AI report.** A one-shot grounded investigation: summary, findings
  with verdict/confidence/evidence, open questions, next checks. Streaming is
  status events plus the validated report only — ungrounded draft text never
  reaches the client.
- **Export and save.** Any saved investigation downloads as a four-section
  PDF (graph snapshot, paths, risk split, findings + sources) and can be kept
  in local browser storage.

## What it is not

- **Not a wallet.** Nothing connects, signs, or transacts. There is no
  key custody anywhere in the system.
- **Not a verdict engine.** `inferred` means "one hop from something
  flagged." Treating it as proof of wrongdoing is a misuse of the tool, and
  the UI says so where the inference appears.
- **Not an always-on indexer.** There is no polling and no standing
  infrastructure bill: Alchemy is called on demand and results persist in
  D1/SQLite cache (~$0 idle).
- **Not exhaustive.** Trace depth caps at 2 and fanout caps at 100 per
  expansion; the report states its coverage limits. A clean result means
  "nothing found within these bounds," not "this address is safe."

## How it works

```text
paste address/ENS ─▶ intel + history (D1 cache, Alchemy on miss)
                    ─▶ trace depth≤2 (BFS, cache-first per expansion)
                    ─▶ screen: exact → verified / 1-hop → inferred / else none
                    ─▶ investigate (bundle → Muse → validate → strip → persist)
                    ─▶ report JSON / PDF export
```

The API is a Hono Worker backed by D1. The `reports`, `risk_lists`,
`risk_hits`, `transfers`, `traces`, and `expansions` tables are the whole
memory: an address whose rows are cached is not the same as an address that
was explored, and the schema keeps the two apart. The web app is a React +
TanStack Router + Tailwind front end with no wallet code paths at all.

Model access is bring-your-own-key: `X-Model-Key` per request, service
`MODEL_API_KEY` as fallback, 401 only when neither exists. The default model
is `muse-spark-1.3-contributor` at medium reasoning effort with search
grounding; model and effort are overridable per investigation.

## Repository map

| Component | Purpose |
| --- | --- |
| [Web app](web/) | Spotlight console, investigation terminal, wallet mesh, risk panel, report view, PDF download |
| [API Worker](workers/api/) | Hono routes, Alchemy clients, trace engine, risk assessment, LLM investigation, PDF export |
| [API routes](workers/api/src/routes/) | `address` (intel + history), `trace`, `investigate`, `reports` (JSON/PDF), `agent`, `exploits`, `models`, `profile` |
| [Investigative agent](workers/api/src/agent/) | Multi-step agent loop with tools, fact ledger, and verification gate |
| [Seed data](data/seeds/) | `exploits.json` (strict EVM-only DeFi hacks, hacker + victim required), `ofac.json` (123 sanctioned addresses), `master.json`, `protocols.json` |
| [API SQL](workers/api/sql/) | `schema.sql` + `seed.sql` (source of truth; `migrations/` holds applied D1 migrations) |
| [API tests](workers/api/test/) | Contract + regression suite (`bun test`), offline by construction |
| [Design](docs/DESIGN.md) | Scoped work chunks (INFRA/API/LLM/UI/INT/TST) and completion criteria |
| [Build log](docs/system.md) | Per-completion record: what, how, why, importance |

Seed discipline: every exploit row carries hacker and victim addresses with
full 42-char `0x` form on a named chain — no nulls, no truncation. Single-
sourced or ambiguous attributions are held out of the strict file rather than
guessed into it.

## Local setup

Prerequisites: [bun](https://bun.sh) and [wrangler](https://developers.cloudflare.com/workers/wrangler/)
(`wrangler whoami` must show the deploying account).

```sh
# API: install, migrate + seed local D1, run
cd workers/api
bun install
bun run migrate && bun run seed
printf 'ALCHEMY_API_KEY=...\nMODEL_API_KEY=...\n' > .dev.vars  # gitignored; keys only
bun run dev   # http://127.0.0.1:8787

# Web: install, point at the API, run (separate terminal)
cd web
bun install
VITE_API_BASE=http://127.0.0.1:8787 bun run dev   # http://127.0.0.1:5173
```

The web app opens on a spotlight console: paste an ENS name or address,
open Settings for chain, custom ENS RPC, and model configuration, and Trace
carries you into the terminal. Local D1 starts empty of transfers — lookups
serve the 866 seeded risk rows immediately; fund-flow history fills on first
keyed lookup and persists.

## Checks

```sh
cd workers/api
bun run check    # tsc --noEmit
bun test         # contract + regression suite, no live keys (15+ tests)
bun run int1     # end-to-end loop: fixtures → lookup → trace → screen → export
cd ../../web
bun run check    # tsc --noEmit
bun run build
```

The suite runs fully offline: the test harness builds an in-memory DB from
the committed schema + seed and uses a throwing Alchemy stub, so any live
leak fails loudly. Live checks (Alchemy, Muse) are manual-only and gated
behind explicit env opt-in.

## Deployment and security

Production is Cloudflare: Worker + D1 + Pages ([pages project](https://intel-terminal.pages.dev)).
Remote D1 is created once (`wrangler d1 create intel-terminal`), its id wired
into `workers/api/wrangler.toml`; schema and seed apply with
`wrangler d1 execute intel-terminal --remote --file=./sql/<schema|seed>.sql`.
Secrets (`ALCHEMY_API_KEY`, `MODEL_API_KEY`) are set with `wrangler secret put`
and never enter source control — `.dev.vars` is gitignored.

Keep provider keys out of logs and fixtures. The strict seed files contain
only public attribution data (addresses, tx hashes, published sources).
Risk-list versions are pinned per row so a match can always be traced back to
the list commit it came from.
