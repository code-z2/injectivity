# AI Security Terminal — Design Doc (EVM-only v1)

## Goal
Build a local-first EVM investigation terminal. Paste any address or ENS. Trace fund flows. See wallet mesh. Separate verified risk from inferred proximity. Export a PDF report.

## Success Criteria
- Any EVM address resolves to profile, balances, and history from cache or Alchemy.
- Depth-2 trace completes with explicit hop depth and explainable paths.
- Graph shows address, transfer, contract, risk, and context layers.
- Sanctioned addresses flag verified. Neighbors flag inferred only.
- AI explains paths, states uncertainty, and suggests next checks.
- Investigation exports as local PDF with graph, paths, risks, sources.

## Approach
On-demand Alchemy Data APIs with local SQLite cache. No polling. No always-on indexer. Versioned OFAC plus curated exploit lists stored locally. Cytoscape.js for the investigation graph. Local-first reports.

## Steps

### Infrastructure
#### INFRA-1 — Local store and config
Defines: where investigations, caches, and risk lists live.
Will do: SQLite schema for addresses, transfers, traces, risk hits, reports. Seed OFAC and exploit lists with version and source URL. Env config for Alchemy key, chain, rate limits.
Done when: fresh clone seeds lists, runs a trace, reopens it offline from cache.
Blockers: none. Blockees: API-1, API-3, LLM-1, UI-2.

#### INFRA-2 — PDF export path
Defines: client-side report output.
Will do: report template with graph snapshot, paths, risk split, sources. Print-to-PDF from investigation view.
Done when: saved investigation exports a readable PDF with all four sections.
Blockers: UI-2. Blockees: INT-1.

### API
#### API-1 — Address intel and history
Defines: single-address read path.
Will do: `alchemy_getAssetTransfers`, token balances, portfolio lite, paginated history. Cache, retry, rate-limit handling.
Done when: address lookup returns in under 5s warm, cache hit on repeat.
Blockers: INFRA-1. Blockees: API-2, UI-1.

#### API-2 — Multi-hop tracing engine
Defines: bounded fund-flow traversal.
Will do: BFS forward and backward to depth 2. Value and asset filters. High-fanout caps. Shared-counterparty detection. Path serialization for graph and reports.
Done when: high-activity address traces without runaway calls and returns inspectable paths.
Blockers: API-1. Blockees: UI-2, LLM-1.

#### API-3 — Risk screening
Defines: verified vs inferred contract.
Will do: OFAC exact match, exploit-list exact match, inferred proximity rules. Store list name, version, match type on every hit.
Done when: sanctioned address is verified, neighbor is inferred only, styles never mix.
Blockers: INFRA-1. Blockees: UI-3, LLM-1.

### LLM
#### LLM-1 — Investigation assistant
Defines: explanation layer over traces and risk hits.
Will do: path narration, verified vs inferred wording, uncertainty statements, next-check suggestions. Prompt grounded only on trace output and risk hits. Local model or BYO key.
Done when: every claim links to a tx or list entry, and inferred is never stated as proof.
Blockers: API-2, API-3. Blockees: UI-3.

### UI
#### UI-1 — Search and address view
Defines: entry point.
Will do: address and ENS input, profile header, balances, history table, risk badge.
Done when: paste to insight in two clicks with no wallet connect.
Blockers: API-1. Blockees: UI-2.

#### UI-2 — Mesh graph and trace controls
Defines: investigation canvas.
Will do: Cytoscape.js graph with five layers, depth and direction controls, expand and prune, contract toggle, evidence side panel.
Done when: depth-2 trace renders under 500 nodes and each edge traces to its tx.
Blockers: API-2, INFRA-1. Blockees: UI-3, INFRA-2.

#### UI-3 — Risk panel and report view
Defines: trust boundary in the UI.
Will do: separate verified and inferred sections, distinct styles, pattern flags with tx links, local report save.
Done when: users can tell verified from inferred at a glance in review.
Blockers: API-3, LLM-1, UI-2. Blockees: INT-1.

### Integration and tests
#### INT-1 — End-to-end investigation
Defines: full loop proof.
Will do: seed, lookup, trace, screen, explain, export. Fixture with one sanctioned address, one exploit address, one clean address.
Done when: script runs green and PDF contains all expected sections.
Blockers: all above. Blockees: none.

#### TST-1 — Contract and regression suite
Defines: quality gate.
Will do: unit tests for tracing caps, risk match types, cache behavior. Regression on fixtures. No live-key tests in CI.
Done when: suite passes offline and live checks are manual only.
Blockers: API-2, API-3. Blockees: none.

## Validation Plan
- `sqlite3` opens seeded DB and lists OFAC version row.
- Offline trace replay returns identical paths from cache.
- Manual: sanctioned address shows verified style, neighbor shows inferred only.
- Manual: 500-node graph expands, prunes, and links each edge to a tx.
- Manual: PDF export contains graph, paths, risk split, sources.

## Risks / Open Questions
- High-fanout wallets can explode traces. Mitigation: caps and value filters.
- Exploit lists have no canonical source. Mitigation: provenance and version on every entry.
- Alchemy CU burn on deep traces. Mitigation: cache and hop limits.
- Open: local model choice for LLM-1. Default to BYO key until decided.

## Build Workflow
For every item in the order, discuss look and behave first, then complete it as expected.
No code before the discussion for that item closes. See agent rules in AGENT.md. Record each completion in system.md.

## Sources
- https://www.alchemy.com/docs
- https://www.alchemy.com/pricing
- https://docs.goldsky.com/pricing/summary
- https://github.com/0xB10C/ofac-sanctioned-digital-currency-addresses
- https://js.cytoscape.org/
- https://github.com/jacomyal/sigma.js
