# Agent backend rewrite — plan

Status: built (steps 1–8 of the build order, UI excepted). Not yet deployed. See "As built" at the end for where the build differs from this plan.

Replaces the one-shot `POST /v1/investigate` (`workers/api/src/llm/investigate.ts`), which makes one model call over a fixed trace and returns `findings / uncertainty / nextChecks`. Two ideas carry over: **the model proposes, the code disposes** (every cited piece of evidence is checked against real data before it's kept), and the PDF export.

## Goals

- A conversational agent in the trace page's right dock that researches with tools and answers only from evidence.
- A **Generate** action that writes a post-mortem report: plain language, inline citations, concrete assumptions, no next steps, no open questions.
- Curated memory: the agent keeps verified, new, important facts and starts later investigations from them.
- Vendor-agnostic models: any model can be supplied through config.
- Security-terminal topics only.

## Non-goals

- Fine-tuning or training models. "Improves" means better memory and better evals, not new weights.
- Following every address automatically. The user still builds the chain; the agent researches around it.

## Architecture

```
web-next (trace page)
  right dock ── WebSocket ──► Worker (Hono) ──► Investigation Durable Object (one per investigation)
                                                 │
                                                 ├─ scope gate      (server gate model, always)
                                                 ├─ research loop   (research model + tools)
                                                 │    ├─ chain tools     → Alchemy (per-request RPC still honoured)
                                                 │    ├─ local tools     → D1: risk lists, exploits, OFAC, traces, labels
                                                 │    ├─ memory tools    → D1 + Vectorize
                                                 │    ├─ workspace tool  → the chain/inspected address sent by the UI
                                                 │    ├─ document tool   → PDF fetch + text extraction
                                                 │    └─ built-in search → only when the model has it
                                                 ├─ evidence ledger + verifier
                                                 ├─ report writer   (writer model, on Generate)
                                                 └─ curator         (after a report, writes memory)
```

**Why a Durable Object:** a research turn can take minutes and many tool calls, longer than a plain Worker request should hold. The Durable Object keeps the conversation, ledger and budget, streams progress over a WebSocket, and survives reconnects. We use the Cloudflare Agents SDK's base `Agent` class for WebSocket, state and SQLite. We don't use its AI-SDK chat layer, because our own adapters handle models.

## Models

### Adapters (`llm/adapters/`)

One interface:

```ts
interface ModelAdapter {
  run(req: {
    system: string;
    messages: Msg[];               // user / assistant / tool results, normalised
    tools: ToolSpec[];             // JSON-schema tools
    search: boolean;               // turn on built-in search if supported
    effort?: 'low' | 'medium' | 'high';
    schema?: JsonSchema;           // structured output, when supported
    signal: AbortSignal;
  }): AsyncIterable<ModelEvent>;   // text deltas, tool calls, search citations, usage, done
}
```

Four adapters, chosen from the base URL:

| Base URL | Adapter | Built-in search | Effort maps to |
|---|---|---|---|
| `api.meta.ai` (Muse), `api.openai.com` | Responses | `web_search` tool | `reasoning.effort` |
| `api.anthropic.com` | Anthropic Messages | `web_search` tool | effort / thinking |
| `generativelanguage.googleapis.com` | Gemini | Google Search grounding | thinking budget |
| anything else | Chat Completions | OpenRouter web plugin, else none | `reasoning_effort` if accepted |

Search citations from every vendor go into the evidence ledger in the same shape (below).

### Capability probe

`POST /v1/models/probe` runs a tiny tool call, then a tiny search call, and returns `{ tools, search, schema, effort }`. It runs when a custom model is saved and is cached per (base URL, model) for the server models. The agent reads these flags instead of assuming. No search: skip web research and say so in the report. No strict schema: validate the output and retry once.

### Server models (Worker config)

One per role. All default to Muse (`muse-spark-1.3-contributor`, `https://api.meta.ai/v1`) on the existing `MODEL_API_KEY` secret.

| Role | Default effort | Env |
|---|---|---|
| gate | low | `MODEL_GATE_BASE_URL`, `MODEL_GATE_MODEL`, `MODEL_GATE_EFFORT`, `MODEL_GATE_KEY` |
| research | high | `MODEL_RESEARCH_*` |
| writer | high | `MODEL_WRITER_*` |
| summary | low | `MODEL_SUMMARY_*` |

Each role falls back to the existing `MODEL_API_*` values, then to the Muse defaults.

### Custom model (Settings)

One model, used for research and writing. The UI has four fields: **Base URL, Model, Reasoning effort, API key**. It shows the probe's result next to them, e.g. "Tools ✓ · Search ✗".

- Stored only in the browser, next to the custom RPC URLs. Sent per request as `x-llm-base-url`, `x-llm-model`, `x-llm-effort`, `x-llm-key`.
- The server never stores the key. The Durable Object keeps it in memory for the open session only.
- The **scope gate always uses the server gate model**, so a permissive custom model can't bypass the security-only rule.
- Research needs tool calling. If the custom model has no tools, Settings says so and the server models are used.

## Scope gate

Runs on every user message before the research loop, as one cheap structured call: `{ inScope: boolean, reason }`.

- **In scope:** addresses, transactions, contracts, exploits, protocols, laundering, mixers and bridges, sanctions, attribution, incident history, and questions about the current trace or report.
- **Out of scope:** everything else. The reply is a short fixed decline, with no model-written text.

Tools are the second fence: every tool is a security tool, so even an in-scope conversation can't drift far.

## Tools (`agent/tools/`)

Each tool returns data plus **sources**. Every source is added to the ledger and gets a short ID (`S12`) the model must cite.

| Tool | Does | Source kind |
|---|---|---|
| `get_transfers(chain, address, direction, cursor?)` | Ledger page (live, `order: desc`) | `tx` |
| `get_transaction(chain, hash)` | Receipt, logs, decoded transfers, internal calls (`debug_traceTransaction` when available) | `tx` |
| `get_balances(chain, address)` | Native + token balances now | `chain_state` |
| `get_contract(chain, address)` | Verified source/ABI, creator, creation tx (Etherscan API) | `contract` |
| `resolve_ens(name)` / `reverse_ens(address)` | ENS | `chain_state` |
| `trace_funds(chain, address, direction, depth)` | Existing `traceFunds`, bounded | `tx` (per edge) |
| `lookup_labels(chain, addresses[])` | Risk lists, OFAC, known labels | `dataset` |
| `search_exploits(query)` | `data/seeds/exploits.json` rows (in D1) | `dataset` |
| `recall(query)` | Curated memory (see Memory) | `memory` (its own sources travel with it) |
| `workspace()` | The user's chain links, roles, active and inspected address | none (context only) |
| `read_pdf(url, pages?)` | Fetch + extract text (`unpdf`), cite by page | `document` |
| built-in search | Vendor's own web search, only when probed available | `web` |

**Budget per turn:** 25 tool calls, 4 minutes, and a token ceiling. When the budget runs out, the agent answers from what it has and the answer says what wasn't covered.

**Caching:** tool results are cached in D1 by (tool, args), with TTLs: transactions forever, transfers 5 min, labels 1 day, PDFs 1 week.

## Evidence ledger

Per investigation, in the Durable Object's SQLite:

```sql
sources (
  id TEXT PRIMARY KEY,          -- S1, S2, …
  kind TEXT,                    -- tx | chain_state | contract | dataset | memory | document | web
  ref TEXT,                     -- tx hash, address, URL, dataset row id, memory fact id
  chain TEXT,
  title TEXT,
  excerpt TEXT,                 -- the exact text or decoded data the claim rests on
  page INTEGER,                 -- documents
  fetched_at TEXT
)
```

### Verifier (`agent/verify.ts`)

Runs on every chat answer and on the report before anything reaches the user. It extends today's `validateReport`.

- Every factual sentence or claim must cite at least one source ID that exists in the ledger. Uncited or wrongly cited claims are removed, and the count is logged.
- A claim is a **fact** only if it rests on `tx`, `chain_state`, `contract`, an exact `dataset` hit, or two independent `web` sources. Anything else must be labelled an **assumption**, with its reasoning.
- Numbers are checked against the cited source: amounts, dates, hop counts.
- Chat streams answers as they're written but holds a sentence back until it's verified. The report is verified as a whole before it's shown.

## Node summaries

Every card the user inspects (single click on the globe, or selecting a chain link) gets a short summary of its fund movement. This is separate from chat: it doesn't need the research loop, so it's fast and cheap.

**Two layers:**

1. **Facts, computed in code (instant, no model).** Built from the address's ledger:
   - totals in and out per token, with their value (same pricing as the globe, `>$X` when partial)
   - top counterparties with their labels
   - first and last activity
   - risk-list and OFAC hits
   - spoof tokens
   - simple patterns: fan-out or fan-in, peel chain, touches a mixer, bridge or exchange
2. **A two-to-three sentence summary written by a model from those facts only.**
   - No tools and no web. It does use `recall` (a quick D1 lookup) so a known attribution can be named.
   - The verifier checks that every address, amount and date in the summary appears in the facts. Otherwise the summary falls back to the plain facts.

**Model:** the custom model if one is set, otherwise a fourth server role, `summary` (Muse, low effort, `MODEL_SUMMARY_*`).

**Endpoint:** `POST /v1/agent/summary { chain, address }` streams the facts first, then the sentences.
- Cached in D1 by (chain, address, newest tx hash), so it's shared across users and refreshed only when new transfers arrive.
- Inspecting another card aborts the request in flight.

**Coverage:** the summary is written over the transfers loaded so far, and says so as a fact ("across its latest 536 transfers").

**Feeds the agent:** each summary is added to the open session's ledger as context, with its facts as sources. Chat and the final report reuse it instead of re-deriving it.

**Placement in the UI:** the right panel. A node brief card pinned at the top, above the chat. It shows the inspected card, or the active address when nothing is inspected, and is replaced when another card is inspected. It is not posted as a chat message, so the conversation stays clean. An "Ask about this" action puts the address into the chat. The card's exact design is settled when the right panel gets its own design pass.

## Report

Generate asks the writer model for a structured report. It draws on the conversation's ledger, after one final research sweep over the chain links the user built.

```ts
interface PostMortem {
  title: string;                  // "Bybit cold-wallet exploit, February 2025"
  summary: string;                // a few sentences: what, how much, when
  timeline: { at: string; event: string; cites: string[] }[];
  how: Section;                   // mechanism, in plain language
  fundFlow: Section;              // where the money went, hop by hop, where it is now
  actors: { name: string; address?: string; role: string; basis: string; cites: string[] }[];
  impact: Section;                // victims, totals
  assumptions: { statement: string; basis: string; cites: string[] }[];
  method: Section;                // what was analysed, as facts: hops, transfer counts, sources, web or not
  sources: Source[];              // only the cited ones, numbered in order of first use
}
interface Section { body: string } // paragraphs with inline [n] markers
```

- **No next steps, no open questions.** Every unknown becomes either an assumption (stated, with its basis) or a coverage statement in *method* ("funds beyond hop 3 were not followed").
- **Stored** in `reports` as a new envelope `{ version: 2, chain, addresses, postMortem }`. Old rows still render through the legacy path.
- **Rendered** on the report page (the third page, built later) and as a PDF. The renderer in `export/pdf.ts` is rewritten for these sections.

## Memory (`agent/memory/`)

### What gets stored

Only facts that pass all three gates:

1. **Verified:** backed on-chain, or by two independent sources off-chain. Never a model inference or a single web page.
2. **New:** not already stored. Checked by exact key first, then by embedding similarity. A near-duplicate adds a source to the existing fact. A contradiction goes to `memory_conflicts`, not memory.
3. **Important:** the fact is one of these kinds:
   - attribution: the address belongs to an exploiter, exchange, mixer, bridge or protocol
   - a cluster link between addresses
   - an exploit mechanism
   - a laundering pattern
   - a label for a high-volume or high-loss address
   - a correction from the user

   Routine transfers, one-off counterparties, and anything one tool call can recompute are never stored.

### When

The **curator** runs once after a report is generated. It proposes candidate facts from the verified report, the code applies the three gates, and only the survivors are written. Nothing is written mid-chat.

### Tables (D1, migration `0003_agent.sql`)

```sql
memory_facts (
  id INTEGER PRIMARY KEY,
  kind TEXT,          -- attribution | cluster | mechanism | pattern | label | correction
  subject TEXT,       -- address / tx / protocol key, lowercased
  chain TEXT,
  statement TEXT,
  confidence TEXT,    -- high | medium
  status TEXT,        -- active | superseded | retracted
  learned_from INTEGER REFERENCES reports(id),
  created_at TEXT, updated_at TEXT
)
memory_sources   (fact_id, kind, ref, excerpt)        -- provenance, at least one per fact
memory_conflicts (fact_id, candidate, sources_json, created_at)
tool_cache       (key PRIMARY KEY, body, expires_at)
```

A Vectorize index `agent-memory` holds the embedding of each fact's statement, keyed by fact ID. Embeddings come from Workers AI (`@cf/baai/bge-base-en-v1.5`), so memory doesn't depend on whichever chat model is configured.

### Feedback

A "This is wrong" control on a report sentence retracts the facts learned from it and records a `correction`.

## Endpoints

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/v1/agent/sessions` | Create an investigation `{ chain, root }` → `{ id }` |
| `GET` (WS upgrade) | `/v1/agent/sessions/:id` | Chat: user messages, workspace updates in; tokens, tool progress, verified answers out |
| `POST` | `/v1/agent/summary` | Node summary: computed facts, then model sentences (streamed, cached) |
| `POST` | `/v1/agent/sessions/:id/report` | Generate → streams progress, ends with `{ reportId }` |
| `GET` | `/v1/reports/:id` (`?format=pdf`) | Existing route, extended for v2 reports |
| `POST` | `/v1/reports/:id/feedback` | Mark a cited sentence wrong |
| `POST` | `/v1/models/probe` | Capability probe for a custom model |

`POST /v1/investigate` stays until the right dock replaces its last caller, then it's removed together with `llm/investigate.ts` and `llm/instructions.ts`.

## File layout (`workers/api/src/`)

```
agent/
  session.ts          Investigation Durable Object (Agents SDK)
  loop.ts             research loop, budget, streaming
  gate.ts             scope gate
  verify.ts           verifier
  report.ts           writer prompt + PostMortem schema
  prompts/            system prompts per role (plain .ts strings, like instructions.ts today)
  tools/              one file per tool + registry.ts
  memory/             store.ts, curator.ts, recall.ts
llm/
  adapters/           responses.ts, anthropic.ts, gemini.ts, chat.ts, index.ts (pick by URL)
  config.ts           role → model config; header → custom model
  probe.ts
routes/
  agent.ts, models.ts (reports.ts extended)
```

`wrangler.toml` gains: the Durable Object binding and migration, the Vectorize index, the Workers AI binding, and the role vars.

## Testing

- **Unit tests:** adapters (recorded wire fixtures per vendor), verifier, memory gates, gate decline path.
- **Evals:** `test/evals/` with 10 exploits from `exploits.json` whose answers are known (attacker address, loss, mechanism, first laundering hop).
  - A run scores the report on: citations resolve, key facts present, no uncited claims, no next-steps or questions.
  - Run them by hand with `bun run eval`; they cost model calls, so they're not in CI.
  - This is how a prompt or tool change is shown to be better.

## Build order

1. **Fix the transfers cache key** (`(tx_hash, chain)` drops multi-transfer transactions). The agent will cite this data, so it has to be complete.
2. Adapters + config + probe, with Muse as the default. Covered by unit tests.
3. Tools + ledger + verifier, exercised by a CLI script without the UI.
4. Node summaries (facts + summary role + cache). This step needs no session, so it ships early and the globe gets value first.
5. Durable Object session + scope gate + WebSocket chat.
6. Report writer + v2 storage + PDF.
7. Memory: tables, curator, recall, Vectorize.
8. Evals.
9. UI: right dock, custom-model Settings, report page. These are separate design passes, page by page.

## As built (2026-11-02)

Where the implementation differs from the plan above:

- **Durable Object without the Agents SDK.** `agent/durable.ts` is a plain `DurableObject` with the WebSocket hibernation API and SQLite storage (one row per message, source and transcript entry). The session logic lives in `agent/session.ts` (`SessionCore`) so it's testable without wrangler.
- **Report over the WebSocket.** Generate is a `{ type: 'report' }` frame on the session socket, not a POST route. It runs: research sweep (20 tool calls) → writer → per-field verification → save → curator. The client receives `status`/`step` frames, then `report { reportId }`, then `memory { added, merged, conflicts, refused }`.
- **Custom model per frame.** The custom model rides on each `ask`/`report` frame (`model: { baseUrl, model, key, effort }`) along with an optional `rpcUrl`, and is never stored. On plain HTTP routes it's the `x-llm-*` headers.
- **Contracts from Sourcify, not Etherscan.** `get_contract` uses `eth_getCode` plus Sourcify (no key needed). Creator/creation tx are not available.
- **`read_page` tool added.** Muse's built-in search returns URLs without titles or quotes, so the agent reads a page to cite a figure from it. Search results it didn't read can only be cited by URL, for non-numeric context.
- **No ENS tool yet.** The UI already resolves ENS; labels carry names.
- **Memory similarity is lexical.** Exact subject, then word overlap (Jaccard). Vectorize/Workers AI embeddings are not wired: Vectorize has no local mode, and lexical matching covers the subject-keyed facts the curator stores. An embedding index can be added behind `recallFacts`/`writeFact` later.
- **Migrations.** `0003_transfer_uid.sql` (transfers keyed per transfer) and `0004_agent.sql` (exploits, memory, tool cache, node-summary cache).
- **Wrangler 4.** Wrangler 3's bundled esbuild 0.17 is killed by this macOS release (exit 137); v4 builds fine and is required for SQLite Durable Objects anyway.
- **Scripts.** `bun run agent "question" [root]` (research loop on local D1), `bun run chat <root> "q" … [/report]` (talks to a running `wrangler dev` session), `bun run eval [count] [offset]` (end-to-end reports on known exploits, scored).
