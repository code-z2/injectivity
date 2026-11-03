# Intel Terminal

> [!IMPORTANT]
> **Disclaimer.** Intel Terminal is an investigative aid, not an authority.
>
> - **Not advice.** Nothing it shows is financial, legal, investment or
>   compliance advice, and it does not certify any address as safe or
>   sanctioned. Do your own verification before acting.
> - **Labels and links are not accusations.** An address that transacted with
>   an exploiter is not an exploiter. Exchanges, routers and bridges touch
>   everyone. Attributions come from public sources and can be wrong or out of
>   date.
> - **AI can be wrong.** Answers and reports are written by an AI model
>   (Meta's Muse by default). Every claim is checked against the evidence it
>   cites, but the checks catch unsupported statements, not every mistake.
>   Read the sources.
> - **Coverage is partial.** Traces read a bounded window of each wallet's
>   history on six EVM chains. Funds that leave through a bridge or mixer, or
>   move to a non-EVM chain, end at that point.
> - **Use it responsibly.** Don't use it to harass, dox or make public
>   accusations against individuals. It is provided as is, without warranty,
>   under the [MIT License](LICENSE).

Intel Terminal is an on-chain security investigation workspace. You give it a
wallet, an ENS name or a known exploit. It traces where the money went, names
the protocols it moved through, and works alongside you with an AI researcher
that cites every claim. When you're done, it writes the post-mortem.

**Live:** [intel-terminal.pages.dev](https://intel-terminal.pages.dev)

## Why it exists

When an exploit happens, the facts are scattered across block explorers,
sanctions lists, protocol docs and incident write-ups. Explorers show one
address at a time. Forensic platforms are expensive and closed. AI chat tools
speculate and invent figures. Intel Terminal puts the evidence in one place
and keeps the AI honest: if a claim can't be traced back to a transaction, a
dataset entry or a page it read, it doesn't reach you.

## What you can do

### Start an investigation

Type a wallet address, an ENS name or the name of an exploit on the home page.
Typing a name like `binance` or a technique like `flash loan` searches the
curated exploit dataset, and the attacker addresses appear in the quick list,
one click away. Every investigation has its own link, for example:

```text
https://intel-terminal.pages.dev/investigate/ethereum/vitalik.eth
```

### Follow the money

The trace page centres on a globe of cards: the wallet you're investigating in
front, its counterparties around it, theirs around them, three rings deep.

- **Ranked by value, not noise.** Each wallet's first 5,000 transfers are read,
  including internal ETH movements on Ethereum and Polygon. Address-poisoning
  dust and spoof tokens are set aside, and counterparties are ranked by the
  dollars they moved.
- **Balances that mean something.** Wallet cards show their current balance.
  Shared contracts such as routers and pools show how much moved through them
  with the traced wallet instead, since their balance belongs to everyone.
- **Protocols named.** Known DEX routers, aggregators, bridges and mixers are
  labelled, and verified contracts show their name. These are the end of a
  trail and aren't expanded; bridges and mixers are marked as exits.
- **The full ledger.** The dock underneath lists every transfer, with filters
  for direction, time, token, role, counterparty and amount, and dust hidden by
  default. Every row links to its transaction on the explorer.
- **Your trail.** Double-click a card to follow it. The addresses you follow
  form a chain down the left side, which becomes the investigation's context.

Single-click a card to inspect it: its ledger opens in the dock and a short,
verified summary appears in the agent panel.

### Ask the agent

The agent panel on the right answers plain-language questions about the trace:
who an address is, where funds went, how an exploit worked. It researches with
its own tools: transfers, decoded transactions, balances, contracts, fund
traces, the exploit and sanctions datasets, PDFs, and the web. Each claim
carries a citation chip; hover it to see the evidence. Off-topic requests are
declined.

### Get the report

Press **Generate report** to turn the investigation into a post-mortem: summary,
timeline, how it happened, where the money went, actors, impact, assumptions,
method and numbered sources. There are no speculative next steps; anything
uncertain is stated as an assumption with its basis.

The report page opens only in the browser that generated it. The PDF link can
be shared. If a sentence is wrong, flag it: what the agent learned from it is
removed from its memory.

### Make it yours

In **Settings**:

- **Chain.** Ethereum, Base, BNB Chain, Polygon, Arbitrum or Optimism.
- **Custom RPC.** Your own endpoint for a chain's lookups (an `https` URL).
- **Custom model.** Your own model: base URL, model name, API key and reasoning
  effort. It's checked before use; until it passes, the service model is used.
  Your key stays in your browser.
- **Appearance.** Light, dark or follow your system.

## How it stays grounded

- **Evidence ledger.** Everything the agent looks up becomes a numbered source.
  It may only state what it can cite.
- **Verifier.** Before an answer or report reaches you, every sentence with a
  figure, address or transaction hash is checked against the sources it cites.
  Sentences that don't hold up are removed.
- **Curated memory.** After each report, facts that are verified, new and
  important are kept for future investigations, each with its sources.
  Contradictions are queued, not stored.
- **Curated data.** In `data/seeds/`:
  - `exploits.json`: 272 EVM exploits with attacker and victim addresses,
    exploit transactions, loss, technique and sources.
  - `ofac.json`: 123 OFAC-sanctioned addresses.
  - `protocols.json`: 24 protocol contracts, each verified on-chain.

## Built with Meta's Muse

All of Intel Terminal's AI runs on Meta's **Muse Spark** by default: the scope
check, the research agent and its web search, node summaries, report writing,
and memory curation. Anyone can bring their own OpenAI-compatible key instead.

## Repository

| Path | What's there |
| --- | --- |
| [`web/`](web/) | The app: landing, trace page (globe, dock, address chain), agent panel, report page, settings, themes |
| [`workers/api/`](workers/api/) | The API on Cloudflare Workers: chain lookups, profiles and balances, risk lists, exploit search, reports, PDF export |
| [`workers/api/src/agent/`](workers/api/src/agent/) | The agent: research loop, tools, evidence ledger, verifier, scope gate, report writer, memory, sessions |
| [`workers/api/src/llm/`](workers/api/src/llm/) | Model adapters, per-role configuration and the capability check |
| [`data/seeds/`](data/seeds/) | The curated datasets |
| [`docs/system.md`](docs/system.md) | Build log: what was built, how and why |

## Run it locally

You need [bun](https://bun.sh) and
[wrangler](https://developers.cloudflare.com/workers/wrangler/).

Start the API (creates and seeds a local database, serves on port 8787):

```sh
cd workers/api
bun install
bun run migrate && bun run seed
printf 'ALCHEMY_API_KEY=...\nMODEL_API_KEY=...\n' > .dev.vars   # gitignored
bun run dev
```

`ALCHEMY_API_KEY` needs the six networks enabled in your Alchemy app.
`MODEL_API_KEY` is your Muse key.

Then the web app, in a second terminal:

```sh
cd web
bun install
VITE_API_BASE=http://127.0.0.1:8787 bun run dev
```

Open `http://127.0.0.1:5173`.

## Check it

```sh
cd workers/api
bun run check   # typecheck
bun test        # offline tests: no live keys, no network
```

```sh
cd web
bun run check   # typecheck
bun run build   # production build
```

Live checks against real chains and models are separate scripts you run on
purpose: `bun run agent`, `bun run chat` and `bun run eval` in `workers/api`.

## Deploy it

```sh
cd workers/api
wrangler d1 create intel-terminal                        # once; put the id in wrangler.toml
wrangler d1 migrations apply intel-terminal --remote
wrangler d1 execute intel-terminal --remote --file=./sql/seed.sql
wrangler secret put ALCHEMY_API_KEY
wrangler secret put MODEL_API_KEY
wrangler deploy
```

```sh
cd web
VITE_API_BASE=https://<your-worker>.workers.dev bun run build
wrangler pages deploy dist --project-name=intel-terminal
```

Secrets go through `wrangler secret put` and never enter the repository. The
seed files hold only public attribution data: addresses, transaction hashes
and links to published sources.

## License

[MIT](LICENSE)
