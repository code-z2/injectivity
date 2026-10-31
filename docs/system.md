# System Log — AI Security Terminal

Living record of what was built. Update on every completed item.

## Entry template
- Item:
- What it is:
- How it was done:
- Why this way:
- Importance:
- Metadata: files, APIs, versions, dates

## Log
- Item: Exploit seed curation v0.1.0
- What it is: 2024-to-date EVM exploit list with hacker vs victim split.
- How it was done: web research across Halborn, Blockscope, ChainHint, SpotOnChain. Saved to data/seeds/exploits.json.
- Why this way: public incident reports carry addresses. Curated local copy keeps provenance and version.
- Importance: feeds API-3 verified screening and hacked-contract edges in the graph.
- Metadata: 5 incidents, 3 with high-confidence EVM addresses, 2 pending. Bybit 0xa4b2…, WazirX 0x6eed…, Radiant 2 addresses, Balancer 3 addresses.
- Item: Exploit seed curation v0.2.0
- What it is: expanded 2024-to-date set from DeFiLlama ledger plus KelpDAO attribution.
- How it was done: pulled https://api.llama.fi/hacks, filtered EVM-relevant names, kept technique and chain per entry.
- Why this way: DeFiLlama is the broadest public ledger. Local copy keeps version and confidence.
- Importance: covers Hyperbridge, KelpDAO/LayerZero, Bitget x2, Tectonic x2, Humanity, AFX, Ostium, Resolv, THORChain, Syscoin, Truebit, IoTeX, Moonwell x2, Gondi, dTRINITY x2, Aave x2, CoWSwap, Across, Avici, Drift, Rhea, Step Finance.
- Metadata: 30 incidents total. Non-EVM marked out-of-scope-note-only. DeFiLlama entries are medium confidence until hacker addresses confirmed via Etherscan labels.
- Item: Exploit seed curation v0.3.0
- What it is: gap fill for Velocity, ZeroLend, YieldBlox, Coldcard, Rain, Rave.
- How it was done: targeted web research, merged into data/seeds/exploits.json.
- Why this way: each missing name resolves differently. Velocity is a rebrand, not a new hack. ZeroLend and YieldBlox have incident writeups. Rain and Rave need distinct handling.
- Importance: stops double counting Velocity/Drift and gives the terminal its first manipulation case (Rave).
- Metadata: 36 incidents. Velocity resolved as Drift rebrand Jul 2026. ZeroLend Feb 2025 Base $371k fake PT-LBTC collateral. YieldBlox Feb 2026 Stellar $10.8M USTRY oracle. Coldcard Jul 2026 BTC $116M weak keys (note only). Rain Aug 2026 Solana $1.1M card programs. RaveDAO Apr 2026 BNB insider manipulation 95-99% drop.
- Item: Exploit seed curation v0.4.0
- What it is: Payy Network Sep 2026 added plus official team sources for the top 8 incidents.
- How it was done: web research for team-published statements, merged official_sources into data/seeds/exploits.json.
- Why this way: team posts are the highest-confidence record of what broke and what was taken.
- Importance: Payy gives the terminal its ZK-verifier case. Official sources let the AI cite teams, not rumors.
- Metadata: 37 incidents. Payy Sep 24 2026 $1.92M, Noir/Barretenberg verifier accepted invalid burn proof, two batches to one wallet, gas via Railgun. Official: @payy_link incident thread plus post-mortem status 2105047468639658317. Also added: Bybit (Ben Zhou + Sygnia/Verichains + Safe + FBI PSA), WazirX (X thread + Jul 21 blog + Liminal post-mortem), Radiant (Oct 18 X post-mortem), Balancer (Nov 3 X + 20% bounty + forum), KelpDAO (Apr 18 X + lawsuit + CCIP migration), Drift/Velocity (Jul 1 rebrand + DFX redemption), Phemex (Jan 23 X + CEO cold-safe note).
- Item: Exploit seed curation v0.5.0
- What it is: team-published sources completed for the remaining 29 entries.
- How it was done: targeted searches per protocol for official X, blogs, post-mortems, advisories. Merged official_sources into data/seeds/exploits.json.
- Why this way: team posts outrank press for root cause and loss figures.
- Importance: every seed entry now carries an official source. AI can cite teams directly.
- Metadata: 37 incidents, zero missing official_sources. BingX (Sep 20 2024 X + CPO Vivien Lin + ShieldX), Moonwell (Aug 27 2026 X + 1-wei caps + forum), Truebit (Jan 8 2026 X + 0x764C...0302EF), IoTeX (Feb 21 2026 X + Raullen Chai bounty), Ostium (Jul 15 X + Jul 30 post-mortem), Resolv (Mar 22/26 X + burn), Humanity (Jun 9 X + Kwok), Tectonic (Aug 30 X + Cronos halt), Gondi (Mar 9 X + compensation), dTRINITY (X + Medium post-mortems), Aave (Chaos Labs CAPO + Aug 2024 periphery note), CoWSwap (Feb 7 2023 X + solver bond), Hyperbridge (Apr 13/16 X), Bitget (Sep 24/26 X + SlowMist/Mandiant zero-day), AFX (Jul 23 X + Goldfeder), Across (Jul 17 X + Risk Labs relayer), Syscoin (Jun 7 X + Jun 15 postmortem), ZeroLend (shutdown post), YieldBlox (Script3 X + bounty), Step (Jan 31 X + shutdown), Rhea (Apr 17 X + returns), THORChain (Sep 28 X + May vault), Rain/Avici (Aug 29 notices + FBI IC3), RaveDAO (denial thread + ZachXBT + exchange probes), Coldcard (Coinkite advisory + TRM sweep).
- Item: Exploit seed curation v0.6.0
- What it is: latest Binance-linked activity added.
- How it was done: pulled Oct 29 2026 outflow reports and Oct 27 Predict.fun coverage.
- Why this way: user flagged an ongoing incident with live addresses. Record it without overstating it.
- Importance: terminal gets a live watch item plus a confirmed Binance-adjacent case.
- Metadata: 39 incidents. Binance-linked wallets Oct 29 2026 $2.77B across 5 chains is UNCONFIRMED, watch only, no official Binance statement. Predict.fun Oct 27 2026 $400k USDT drain is team-confirmed with full reimbursement pledged.
- Item: Full DeFiLlama EVM-DeFi sweep verification v1.0
- What it is: every 2024-to-present EVM DeFi-protocol hack web-checked one by one.
- How it was done: pulled all 1,328 DeFiLlama records, filtered 431 by date, EVM chain, and DeFi-protocol type, merged with curated seeds. Web-verified 238 rows in ~60 search batches. New incidents found mid-sweep were added with sources.
- Why this way: per-item checks beat bulk trust. Negative results recorded as research notes, not guesses.
- Importance: seed is the complete 2024-to-present EVM DeFi hack list with honest verification tiers.
- Metadata: 468 entries. Tiers: 39 curated, 172 listed, 238 web-verified, 1 watch, 18 unreviewed with reasons (GeniusAI, Base Lending, ParticleTrade, AutoChain, MetaSea, Affine, Custom sAVAX, CoW $59k row, DIMO, Asterix, AK1111, ElevateFi, Fractal, Mure, NFTG, Proxy_b7e1, Unverified_35bc, ALP-checked). Scope flags: in, edge, out with reasons. New mid-sweep adds: zkSync $5M airdrop mint, Solv BRO $2.7M, TrustVolumes $6.7M, Versus $11.8M, Alephium $815k, Echo $76.7M notional ($816k realized), Initia $2.7M (edge), Symbiosis syBTC mint, Cysic $10M, Volo $3.5M (edge), SquidSquad $2.84M (watch), Fence/Valinor $1.01M, zkLink Nova $778k, CUT $1.4M, MEV Bot $2M, Hifi $1M governance (Oct 28), Swell key compromise, Ankr ankrFLOW $410k, ETHMACOAPY rounds, Gamdom $2.2M (out), Term Finance $8.5M governance. New attacker/victim addresses: Curio, LiFi, Minterest, ZKSwap, StablR owner, LABUBU, TMX, INK, Hyperbridge clusters, KelpDAO, DRLVaultV3 white-hat, FlashLoopAdapter Safe, Royal, SQ, Numa, IEXCBP, 402bridge, Smoofs set, BoostHook tx, AM/AMT, GoldPesa tx, LAXO, PGNLZ, INK, WhaleBit, Smoofs, Hedgey-era rows.
- Item: EVM-only file curation v1.0
- What it is: data/evm_exploits.json with only EVM-chain entries carrying both hacker and victim addresses.
- How it was done: filtered 468 seeds to 424 EVM candidates (all chains EVM, scope not out, tier not watch). Strict 0x-address validation on both fields. Worthy entries rewritten to a strict schema with split address/label objects.
- Why this way: Vue app requires every Data Type field present with no nulls. Only complete rows qualify.
- Importance: this is the terminal's first query-ready dataset. The audit counts size the remaining address-hunting work.
- Metadata: 424 candidates. Both 4 (Hyperbridge, DRLVaultV3, Hegic old contract, Smoofs). Hacker-only 16. Victim-only 9. Neither 395. 402bridge hacker is 39 chars (partial, excluded). Truebit victim as transcribed is 39 chars (excluded, needs resourcing). KelpDAO victims are descriptive text (excluded). TesseraDAO, MoonHacker, StablR, Hifi, Port3 hackers are partial (excluded).
- Item: Victim-side completion from user submissions
- What it is: hacker addresses for 8 of 9 victim-only rows, AM Token discarded.
- How it was done: user-supplied addresses, txs, and sources verified format-clean; Basescan tx resolved 402bridge attacker as tx From; Arbiscan label confirmed TMX exploiter; Certik blog confirmed Numa Sonic exploiter set; AM Token removed per user instruction.
- Why this way: user is the domain source for these links; verification is format plus independent confirmation where reachable.
- Importance: EVM file grows from 4 to 11 worthy entries in one pass.
- Metadata: 402bridge hacker 0x062F...Cb7b3 from tx From; TMX exploiter 0x763a...12661 Arbiscan-labeled; Numa Arb attacker 0xf031...a688; Numa Sonic wallet 0xEf1d...97674 plus 4 contracts; Ocean attacker plus runner plus tx; Royal attacker plus tx; INK two EOAs plus 7702 authorized plus tx (Oxe typo fixed to 0xe746...); Truebit victim stays excluded at 39 chars; KelpDAO victims stay descriptive; AM Token deleted from seed.
- Item: SQ Protocol completion, file at 12
- What it is: SQ Protocol hacker EOA plus helper contract applied. EVM file rebuilt to 12 worthy entries.
- How it was done: user incident profile verified format-clean, merged, file rebuilt and revalidated.
- Why this way: same strict gate as the other eleven.
- Importance: file target hit. Cross-incident link found: same attacker EOA 0xe746... and helper 0x0ecadd... hit INK Finance May 11 and SQ Protocol May 12, one day apart. First wallet cluster for the mesh graph.
- Metadata: 12 worthy. 423 candidates: both 12, hacker-only 15, victim-only 1 (Truebit, invalid address), neither 395.
- Item: Counterparty hunt via hack-analysis sources
- What it is: victim contracts found for 10 of 15 hacker-only rows, plus a LiFi correction.
- How it was done: per-protocol hack-analysis searches, DarkNavy forensic reports, Etherscan/Arbiscan labels, team post-mortems. Fixed my own errors: the Balancer Vault I first applied was a 39-char variant (replaced with the labeled 40-char address), and LiFi's 0x1231... is the vulnerable Diamond (victim), not the hacker — attacker is 0x7742... plus exploit contract.
- Why this way: hack analyses name the exploited contract; labels confirm it.
- Importance: EVM file jumps from 12 to 23. Only 4 hacker-only rows left.
- Metadata: 423 candidates: both 23, hacker-only 4 (Minterest, Polymarket Nov 2025, Curio, DualPools), victim-only 2 (Polymarket May 2026, Nebula), neither 394. New victims: Bybit cold wallet, WazirX drained wallet, Radiant LendingPool, Balancer Vault, KelpDAO OFT adapter, LABUBU pool plus token, IEXCBP vulnerable contract, WhaleBit staking proxy, ZKSwap L1 bridge, Polymarket CTF pair, Mobius victim plus MBU token. LiFi corrected and completed.
- Item: Final four counterparties resolved
- What it is: Minterest, Curio, and DualPools victims confirmed; Polymarket ruled no-contract by design.
- How it was done: Minterest team post-mortem (USDY market contract 0x9B50... plus exploit tx), DeFiHackLabs Curio PoC (DSChief 0x579A... plus DSPause 0x1e69...), DualPools PoC (vulnerable contract 0x5e5e...), Polymarket VP Eng statement (6-year-old key compromise, no contract flaw).
- Why this way: team post-mortems and PoC interfaces outrank all secondary reporting.
- Importance: hacker-only list is empty except the one entry that correctly has no contract.
- Metadata: 423 candidates: both 26, hacker-only 1 (Polymarket Nov 2025, key compromise by team confirmation), victim-only 2 (Polymarket May 2026, Nebula), neither 394. EVM file at 26 entries, schema clean.
- Item: Per-item chain tagging for graph display
- What it is: every hacker, victim, and tx in data/evm_exploits.json now carries its own chain.
- How it was done: single-chain entries inherit the entry chain. Hyperbridge items set to ethereum per HubSec forensic blocks. Tx strings converted to hash plus chain objects. Schema revalidated clean.
- Why this way: graph rendering needs chain per node and per edge, not per incident.
- Importance: the file is now directly renderable as a multichain graph.
- Metadata: 11 entries, all hackers have address, label, kind, chain. All victims have address, label, chain. All txs have hash and chain. No nulls.
- Item: Exploit seed curation v0.8.0-v0.9.0
- What it is: full DeFiLlama sweep Jan 2024 to present, filtered to EVM-chain DeFi-protocol victims, merged into seed.
- How it was done: pulled all 1,328 DeFiLlama hack records, kept 431 matching date, EVM chain, and DeFi-protocol target type. Merged with 39 curated entries, deduped. Web-checked 32 no-ID rows in 8 batches.
- Why this way: DeFiLlama IDs verify listed protocols by construction. No-ID rows needed per-item internet checks.
- Importance: seed is now the complete EVM-DeFi hack list for the period, with verification tiers the terminal can filter on.
- Metadata: 449 entries. Tiers: 39 curated, 177 listed, 31 web-verified, 1 watch, 201 unreviewed (long tail under ~$500k, checks pending). Scope flags: 20 in, 3 edge (SquidRouterModule, UPCX, AirDAO), 8 out (PlayDapp, Gala, Somesing, Triple-A, NoOnes, EigenLayer, FixedFloat, YO Protocol with reasons), CoW Swap 2026 DNS marked frontend-only. New attacker addresses: Curio 0xdaAa...8cf5, LiFi 0x1231...4eae, Minterest 0x618F...911D, ZKSwap EOA 0x0a65...71a7ba + contract 0x2D31...F613A, StablR owner 0xC73fD562. New incident found: Term Finance $8.5M governance attack Aug 2026 needs its own entry.
- Item: Exploit seed curation v0.7.0
- What it is: deep investigation of Hyperbridge, KelpDAO, and both Aave entries with hacker and contract addresses.
- How it was done: HubSec forensic reports, Polkadot forum investigation, Chainalysis and LayerZero reports, team statements. Merged into data/seeds/exploits.json.
- Why this way: forum and press give loss figures but not addresses. Forensic reports give both sides of each trace.
- Importance: Hyperbridge and KelpDAO become the first fully linked hacker-plus-contract entries. Aave entries correctly record no-attacker vs unpublished-attacker.
- Metadata: Hyperbridge 6 hacker addresses across 2 clusters plus 3 victim contracts. KelpDAO attacker 0x8B1b...60D3b plus OFT adapter victims and exploit tx 0x1ae2...4222. Aave Aug 2024 victim ParaSwapRepayAdapter, attacker unpublished. Aave Mar 2026 no attacker, victims Core and Prime.
- Item: Counterparty hunt batch - Hedgey, Penpie, Truebit, Infini complete, file at 30
- What it is: four neither-rows promoted to both-sides with full addresses; EVM file rebuilt 26 to 30 entries.
- How it was done: per-protocol hack-analysis searches. Hedgey via rekt/Certik/kismp (attacker EOA 0xDed2..., attack contract 0xd818..., Arbitrum exploiter 0xc724..., victim claim contract 0xbc45...). Penpie via kismp/rekt/SolidityScan/Zokyo/Verichains (attackers 0x7a2f.../0x4476.../0xc0Eb..., tx 0x56e0..., victim PendleStaking 0xFF51...). Truebit via rekt/Olympix/SlowMist (attackers 0x6c8e.../0x1de3.../0xc045..., full victim Purchase 0x764C... replacing the excluded 39-char hash). Infini via QuillAudits/ExVul/CertiK/Cyvers (insider EOAs 0xc49b.../0x3ac9..., victim vault 0x9A79... which doubles as attacker-created contract). Rebuild preserved all 26 existing rows (upsert-only) and revalidated strict: no nulls, all addresses full 0x, per-item chains, 64-hex txs.
- Why this way: preserve-then-upsert avoids regressions from prior builder logic I did not author (e.g. DualPools victim 0x5e5e... whose source lives in an earlier session). Strict validator runs before write so a bad row can never land.
- Importance: file grows 26 to 30 renderable graph incidents; validator proved its worth immediately (see Bybit fix).
- Metadata: 423 candidates: both 30, hacker-only 1 (Polymarket Nov 2025), victim-only 2, neither 390. New ids evm-0027 Hedgey, evm-0028 Penpie, evm-0029 Infini, evm-0030 Truebit.
- Item: Radiant full hacker, Minterest victim correction, Bybit tx fix
- What it is: three corrections to existing file rows during the same rebuild.
- How it was done: Radiant gained 5th hacker 0x0fa5... (Etherscan label plus PeckShield Tornado Cash tracking; Mandiant DPRK attribution added); Oct-2024 Radiant V2 duplicate merged into Radiant Capital earlier. Minterest victim corrected from 0x9B50... to 0xfa14... per pcaversaccio reentrancy list victim/exploit split (team post-mortem names both attacker wallet 0x618F... and exploit contract 0x9B50...; victim market is 0xfa14...), full mantle tx 0xb3c4... added. Bybit 63-char truncated tx replaced with full impl-swap hash 0x46de...7882 confirmed via yevm HACK.md (validator rejected the file until fixed).
- Why this way: explicit victim/exploit labeling outranks co-mention in a post-mortem; the validator, not memory, decides writability.
- Importance: Minterest row now tells the true fund-flow shape (wallet to exploit contract to victim market); Bybit row is graph-linkable again.
- Metadata: prior session labeled 0x9B50... as USDY market victim - superseded with rationale recorded here; revisit only with mantlescan tx-internal evidence.
- Item: Neither-batch hunt states (no file change)
- What it is: researched but unpromoted rows with precise next steps.
- How it was done: Tectonic Aug 2026 ($75M TONIC manipulation, Cronos halt/rollback) via sigintzero/TheBlock/Decrypt - attacker addresses unpublished, no team postmortem, victim is Tectonic money-market pools; Tectonic Feb/Nov 2024 rows are distinct incidents, still pending. UPCX: all sources quote truncated 0x4C....3583E, NomosLabs fetch failed twice (521); victim is ProxyAdmin-managed UPC vaults on EVM side pending chain confirmation. Humanity: victim team wallet 0x0fd9... (EOA, drained) recorded, attacker unidentified (DPRK per Quantstamp) - no contract flaw, stays out by design like Polymarket. DualPools: hacker plus malicious contract plus tx confirmed (bsc); victim is the dLINK pool per lunaray but pool address unconfirmed (bscscan 403); prior file victim 0x5e5e... preserved untouched. Polymarket Nov 2025 closed as by-design exclusion (key compromise, no contract).
- Why this way: negative results recorded as research notes with revisit triggers, not guesses.
- Importance: next hunt has exact targets: Resolv plus remaining top-25 attackers, Tectonic/UPCX/DualPools-pool addresses when sources publish, UPCX chain confirmation.
- Metadata: neither 390; biggest lever remains Etherscan label lookup plus post-mortem mining, largest losses first.
- Item: Counterparty hunt batch 2 - Resolv, Sonne, Abracadabra, Ostium, Ronin complete, file at 35
- What it is: five neither-rows promoted to both-sides; EVM file rebuilt 30 to 35 entries.
- How it was done: per-protocol hack-analysis searches. Resolv via rekt (4 attacker wallets plus 2 mint txs) plus thatsrekt dataset commit for full USR Counter victim 0xa27a... (Chainalysis-confirmed). Sonne via team post-mortem plus kismp plus Nefture tracing (2 attacker EOAs, victim market, optimism). Abracadabra Mar-2025 via Extropy plus Three Sigma (attacker, exploit contract, wallet2, CauldronV4 victim, arbitrum; row is the largest of three Spell hacks). Ostium via QuillAudits (attacker trading account plus delegate controller, OLP vault victim, arbitrum; signer compromise). Ronin Aug-2024 via Three Sigma (2 whitehat MEV bot wallets, Bridge v2 victim, 2 txs, ethereum; funds returned). Preserve-then-upsert rebuild; strict validator green before write.
- Why this way: labeled forensic boxes (rekt attacker/victim sections, QuillAudits contract lists, Three Sigma Addresses section) outrank press summaries; dataset commits with Etherscan confirmation close partials.
- Importance: file at 35 renderable incidents across ethereum, arbitrum, optimism, bnb, polygon, base, mantle, sonic; Ronin adds the whitehat-returned shape (honest label, same trace value).
- Metadata: 423 candidates: both 35, hacker-only 1, victim-only 2, neither 385. New ids evm-0031 Resolv USR, evm-0032 Sonne Finance, evm-0033 Abracadabra Spell, evm-0034 Ostium, evm-0035 Ronin Bridge.
- Item: Batch-2 hunt states (no file change)
- What it is: attacker-confirmed rows still missing victims, and rows missing attackers.
- How it was done: GMX attacker 0xdf33... confirmed multi-source (white-hat deal, funds returned); victim GLP/Vault contract pending Halborn detail. UwU attacker 0x841d... via SlowMist; victim sUSDe-pair pools pending; noted second Jun-13 $3.7M hit same attacker. Cork attacker 0xea6f... via MistTrack; victim wstETH:weETH market pending. Versus attackers (EOA plus drainer) via Blockaid; bridge contract pending (shortened link); noted second $7.54M Verus attack later and 75%-returned shape. AFX attackers (Arbitrum receiver 0x2f29... plus Ethereum consolidation 0x6276...) via rekt plus bridge tx via backwardlabs; victim custody-bridge contract pending (bitok page JS-rendered). Matcha/SwapNet victim router 0x6160... on Base confirmed; attacker wallet unpublished (20-user approval drain). Fixed my own apply-script bug (stale loop variable skipped Abracadabra; re-applied and verified).
- Why this way: same rule - record negatives with revisit triggers, never guess.
- Importance: next hunt has exact missing pieces: 6 victim contracts (GMX, UwU, Cork, Versus, AFX, DualPools dLINK pool) plus UPCX/Tectonic/Matcha attackers, then long-tail rows.
- Metadata: neither 385. Out-of-file classes confirmed: Phemex/Bitget/COLDCARD (CEX or non-contract key theft, no victim contract), PlayDapp/Gala/Somesing (scope out, non-DeFi), Solana/Bitcoin/Near/Stellar rows (non-EVM).
- Item: Counterparty hunt batches 3-4 - GMX, UwU, Versus, Prisma, Resupply, Yearn complete, file at 41
- What it is: six more neither-rows promoted; EVM file rebuilt 35 to 41 entries.
- How it was done: GMX via Verichains (attacker plus attack contract plus tx) plus GMX's own subgraph manifest for V1 Vault 0x489e... on Arbitrum; returned-funds white-hat shape noted. UwU via SlowMist labels (attacker, vulnerable contract, 3 attack txs); split Jun-10 ($20M, file row) from Jun-13 ($3.7M same attacker, victim/txs pending). Versus via Blockaid (attacker plus drainer) plus 4-source majority for bridge contract 0x7151... (conflicts recorded); second $7.54M July attack same bridge noted. Prisma via tayvano/ZachXBT research (3 exploiters, #1 attributed) plus rekt/SharkTeam (attack contract) plus kismp (MigrateTroveZap victim). Resupply via QuillAudits labeled boxes (victim, tx, 2 attack contracts, 3 attackers with fund splits). Yearn yETH via QuillAudits/rekt (attacker plus yETH pool).
- Why this way: project-owned artifacts (subgraph manifests) outrank press for contract addresses; labeled forensic boxes outrank narrative for role assignment; same-attacker second incidents get their own rows, never merged.
- Importance: file at 41 renderable incidents; six-figure-plus DeFi loss coverage deepens across lending, bridges, LSTs, stableswaps.
- Metadata: 423 candidates: both 41, hacker-only 1, victim-only 2, neither 379. New ids evm-0036 GMX V1 EVM, evm-0037 UwU Lend, evm-0038 Versus Bridge, evm-0039 PrismaLST, evm-0040 Resupply, evm-0041 Yearn Ether.
- Item: Hunt states round 3 (no file change)
- What it is: settled non-promotions with revisit triggers.
- How it was done: Garden Oct-2025 is solver-layer compromise (EY forensic, protocol unaffected, attacker masked) - same by-design class as Humanity/Polymarket. THORChain May-2026 is malicious node operator via GG20 TSS on native vaults (attacker unpublished, no EVM victim contract) - file-ineligible. Cork vault/PSM address still unconfirmed after 4 analyses (attacker plus tx banked). Matcha/SwapNet attacker unpublished (victim router banked). AFX custody-bridge and DualPools dLINK pool addresses pending (attackers banked). UPCX full address and Tectonic attacker addresses unpublished. UXLINK attacker banked (multisig victim pending, scope edge). Cysic attacker banked (mint contract pending). Yearn resolved fully, no pending.
- Why this way: class-out beats effort-out; every pending has a named next source (tx-internal data, deployment docs, post-mortem publication).
- Importance: hunt backlog is now explicit and ordered: 6 victim contracts (AFX, DualPools, Cork, UPCX-vault-chain, UXLINK-multisig, Cysic-mint) plus 4 unpublished attackers (UPCX, Tectonic, Matcha, Prisma-none-left), then long-tail rows.
- Metadata: 25 rows resolved this hunt (15 promotions: Hedgey, Penpie, Truebit, Infini, Resolv, Sonne, Abracadabra, Ostium, Ronin, GMX, UwU, Versus, Prisma, Resupply, Yearn; 10 settlements: Radiant merge, Minterest correction, Bybit fix, Polymarket/Humanity/Garden by-design, THORChain/Phemex-class/CEX-out, PlayDapp/Gala scope-out, THORChain non-EVM).
- Item: 30-batch hunt - 14 promotions, file at 55, manual pile defined
- What it is: processed the top-30 incomplete list end to end; 14 new file rows; everything else settled or queued for manual.
- How it was done: Zoth via BlockScope labeled boxes; Polter via kismp raw; Term Finance via mehvetero notes plus RockawayX plus BlockSec (merged TermFinance Vaults dup); DeltaPrime via rekt labeled admin boxes; TrustedVolumes via Blockaid plus team X; Velocore via rekt (attacker plus 4 Linea pools); Abracadabra Jan-2024 via rekt plus Halborn (2 cauldrons; distinct row from Mar-2025); Gravity Bridge via Specter plus QuillAudits plus OneSavie (suffix-confirmed victim, marked for manual confirm); Cysic via Foundation plus SlowMist (recipient plus CYS token); 1inch FusionV1 via kismp raw plus Blockaid (operator cluster with TrustedVolumes recorded both ways); X100 via panda-security plus coinlab (RPC-verified); Future Protocol via Verichains labeled boxes; Radiant V2 Jan-2024 via QuillAudits plus rekt plus MetaTrust (same LendingPool as Oct row); Aperture via kismp plus revoke notice. Two silent name-miss applies caught and fixed (Onyx Protocol vs Onyx V2, GANA vs GANA Payment) - match-count guards added to habit.
- Why this way: labeled forensic boxes plus project-owned artifacts first; press only for corroboration; dup rows merged not stacked; second incidents split (UwU Jun-13, Spell Mar-2025 vs Jan-2024, Venus Mar-2026 canonical date).
- Importance: file at 55 renderable incidents; second operator cluster found (1inch Mar-2025 plus TrustedVolumes May-2026); manual pile is now explicit per-row with named next sources.
- Metadata: 422 candidates: both 55, hacker-only 1, victim_only 2, neither 364. New ids evm-0042 Zoth through evm-0055 Aperture.
- Item: Manual pile for user (no file change)
- What it is: rows banked with one side confirmed, queued for manual completion.
- How it was done: attacker-only banked: WOOFi (victim WooPP_v2 done), Moonwell (mMAMO plus mCBTC done), KiloEx (6 chain txs done), Wasabi (wallets plus txs done), Seneca (attacker done, Chamber pending), Onyx V2 (attacker infra done, oTokens pending), Venus Core (attacker plus contract plus tx done, vTHE pending), GANA (12 attacker-side addrs done, staking contract pending), GriffinAI (attacker plus admin plus decoy plus txs done, GAIN BSC token pending), Gamma (attacker plus contract plus tx done, vaults pending), Matcha, Tectonic, UPCX (partial). Victim-only banked: AFX (attackers plus tx done), Cork (attacker plus tx done), UXLINK (attacker done), NEAR Intents (attacker done, returned), DualPools (attackers plus tx done, dLINK pool pending), Cysic mint contract pending. Ruled out: YO (operator misclick, no attacker), Banana/NFPrompt/Remilia/Tapioca/Makina/IoTeX/CrediX/Rho/Bungee/Squid (class-out or unpublished-both-sides, notes in seed).
- Why this way: user asked to finish manually what could not be verified; every pile row names its missing piece and best next source.
- Importance: manual work is bounded and ordered; nothing is silently half-done.
- Metadata: manual pile 25 rows; class-out 11.
- Item: 64-batch hunt - file at 56, batch fully triaged
- What it is: processed the next 64 incomplete rows; 1 promotion (Lazy Summer), rest settled or queued for manual.
- How it was done: Lazy Summer via rekt labeled boxes (attacker EOA + exploit contract + intermediary + tx + 2 vault victims) - file row evm-0056. Venus $902k row reset (Mar-2026 attacker data removed; likely zkSync incident). Fixed another silent name miss (Venus Core vs Venus Core Pool) with row-count prints. Settled skip-class: Binance watch, Bitget/Phemex/NoOnes CEX, Drift/Step/Rhea/YieldBlox/TAC non-EVM, PlayDapp/Gala/Gamee non-DeFi, COLDCARD/Syscoin chain, THORChain/Humanity/Garden/YO/Remilia no-contract class, EigenLayer/NoOnes/zkSync-airdrop/1inch-Oct24 (Lottie frontend) no-contract class, FixedFloat/Triple-A/Somesing scope-out, zkSync row. Banked one-sided: Bunni (attacker + Unichain contract), Crypto DAO (exploiter), BetterBank (2 EOAs + 3 helpers), SquidSquad wallets (pending contract check). Manual pile additions: Tectonic, UPCX, AFX-v, Matcha-a, Cork-v, UXLINK-v, WOOFi-a, Moonwell-a, KiloEx-v, Wasabi-v, Seneca-v, Rho, Tapioca, Makina, IoTeX, CrediX, Bungee, SquidRM, Gamma-v, GriffinAI-v, OnyxV2-v, Venus-vTHE, GANA-v, NEAR-v, Cysic-mint, IoTeX, Shibarium, SUNRAY, Cyrus (loss disputed $5M vs $516k), DualPools pool, zkSync row, 1inch-Oct24 settled.
- Why this way: one search per row maximum at this depth; anything needing explorer access or unpublished addresses goes to manual with named next source; silent name-miss bug now guarded by row-count prints.
- Importance: long tail is now explicit; file holds 56 verified graph-ready incidents; no row is half-done without a next step.
- Metadata: 422 candidates: both 56, hacker_only 1, victim_only 2, neither 363. New id evm-0056 Lazy Summer Protocol.
- Item: 25-batch (65-89) - 7 promotions, file at 63, no skips
- What it is: worked all 25 rows one by one to disposition.
- How it was done: SolvBTC merged into Solv BRO Vault (same Mar-5 incident) via Verichains/DarkNavy (attacker + wallet + wrapper + beacon victim) - file evm-0057. Arcadia V2 via jmcph4 (exploiter + contract + tx + RebalancerSpot victim) - evm-0058. Aztec Connect via rekt (2 attacker EOAs + tx + RollupProcessorV3 impl) - evm-0059. Fake GIWA Bridge via PublicAML/SlowMist (deployer + fake bridge; scammer-infra class, labeled) - evm-0060. Aztec Bridge via rekt (2 attackers + Private Rollup victim; distinct Jun-17 escape-hatch, not Connect) - evm-0061. Dough Finance via Verichains/kismp (attacker + contract + Connector victim) - evm-0062. GemPad via kismp (attacker + contract + tx + proxy/impl victims) - evm-0063. Attacker-banked: Ribbon (exploit + theft addr), TesseraDAO (theft addr), Unizen (3 attackers + contracts + tx), Rari (attacker + tx), OlaXBT (receiving wallet; date fixed to 2025-09-01), uniBTC (exploiter + tx), Payy (cross-incident attacker + ZeroTrace cluster), Dolomite (consolidation wallet). Manual: Hector (insider, chain unclear), FOOM (both unpublished), MEV Bot (unpublished), Mozaic (partial), AARK (unpublished). Settled: Gamdom (hot-wallet, no contract), ETHTrustFund (insider rug), Transit x2 (Tron). Caught another silent name-miss pattern (AARK vs AARK (Aark Digital), Venus Core vs Core Pool) - row-count prints now standard.
- Why this way: one-by-one with no skips per instruction; labeled forensic boxes first; dup rows merged with note; new incidents cross-checked (ZeroTrace cluster, second Aztec attack, Arcadia second-attack note, Rari Dec-2025 new row flagged for next batch).
- Importance: file at 63; Payy-ZeroTrace and Aztec Connect-Bridge are linked incident pairs worth joint graph display.
- Metadata: 421 candidates: both 63, hacker_only 1, victim_only 2, neither 355. New ids evm-0057 Solv through evm-0063 GemPad.
- Item: next-20 hunt - audit repair + 1 promotion, file at 64
- What it is: hunted the next 20; promoted Pike V1; repaired 5 data-integrity failures found by audit.
- How it was done: Pike via Dedaub registry (dead spoke + attacker impl slot) - evm-0064. Audit of all claimed applies found: 1inch Mar-2025 seed data lost (file row already correct; re-applied to seed), Wasabi/Gamma name misses (fixed; Gamma now banked), Zoth Mar-01 and DeltaPrime non-Sep rows contaminated with wrong-incident data (reset), Moonwell bank lost (re-applied), Venus Core Pool name miss (fixed; $902k row reset as possible zkSync incident). Contamination scan: only intentional UwU sharing remains. File revalidated green. Rari Dec-2025 proven distinct incident (multisig takeover, flagged late) - reset wrong attacker. Settled: Initia (Cosmos), Moonwell Lending + Term Apr-2025 (operational, no hacker), Concentric/Grand Base/TMM/Kinto (address-unpublished, manual), Limit Break (user-approval class, manual).
- Why this way: audit before more hunting; name+date-qualified applies with match-count prints; contamination reset rather than patched.
- Importance: seed and file reconciled; file integrity holds at 64; manual pile precise.
- Metadata: 421 candidates: both 64, hacker_only 1, victim_only 2, neither 354. New id evm-0064 Pike V1.
- Item: second next-20 hunt - 20 protocols, 2 promotions, file at 66
- What it is: Initia (non-EVM settled), Rari Dec-2025 (proven distinct incident, reset wrong data), Limit Break (user-approval class, manual), Moonwell Lending (gov misconfig, settled), Notional (victim banked, attackers partial), Concentric (partial, manual), Grand Base (manual), TMM (manual), Term Apr-2025 (operational, settled), Pike V1 (file evm-0064), Kinto (manual), Fetch.ai (partial + NuNet cluster, manual), USDGambit (partial, manual), YOLO (victim banked, whitehat), Moby (manual), XBridge (file evm-0065), Ekubo (manual), CUT Token (file evm-0066, date fixed), Cascade (manual), BlueBerry (whitehat rescue, manual).
- Why this way: one-by-one per instruction; name+date-qualified applies with match-count prints; contamination scan clean (only intentional UwU sharing); file revalidated green each rebuild.
- Importance: file at 66; manual pile precise; clusters noted (Payy-ZeroTrace, Fetch-NuNet, 1inch-TrustedVolumes, Aztec pair).
- Metadata: 421 candidates: both 66, hacker_only 1, victim_only 2, neither 352. New ids evm-0064 Pike V1, evm-0065 XBridge, evm-0066 CUT Token.

## 2026-10-29 — User hunt batch applied (14 rows) + Gamma vault extraction; file 66 -> 75
- What: applied all 14 user-provided address sets to `data/seeds/exploits.json` (WOOFi, Moonwell, Bunni, Crypto DAO, KiloEx, Seneca, Wasabi, BetterBank, Gamma, NEAR, GANA, GriffinAI, Ribbon, TesseraDAO); extracted 4 Gamma vault names+pools from team post-mortem; rebuilt `data/evm_exploits.json` (strict gates pass).
- How: match-count-guarded upserts; Gamma vaults via Medium post-mortem fetch (Vault Address + Pool Address pairs); KiloEx attacker unified to 0x00fac9 across base/bsc/taiko replacing chain-scoped rows with note; full strict rebuild validation (42-char/64-hex/per-item chain).
- Why this way: user data outranks analyst rows; team post-mortem is authoritative for vault list; one-row-per-operator keeps cross-chain traceability.
- Importance: file now 75 renderable EVM incidents with per-item chains; Gamma/Ribbon/Bunni/WOOFi operator clusters complete.
- Metadata: file counts {candidates:421, worthy_both:75, hacker_only:1, victim_only:2, neither:343}. Flags: BetterBank secondary EOA pasted 39-char (kept in seed, excluded from file); Gamma 0x1F1C absent from post-mortem 4-vault list (kept in seed only, role unconfirmed); NEAR victim non-EVM (file-ineligible); KiloEx 0x22c4/0x796f are Base-only victims (bsc/taiko victims still open); Moonwell mMAMO victim chain unconfirmed in row.

## 2026-10-29 — BetterBank victim confirm + Gamma Hypervisor (user)
- What: user confirmed BetterBank 0x165C as THE victim (already file victim — stamped confirmation); added Gamma 0x1F1C as 5th victim labeled Hypervisor (user-provided, absent from post-mortem 4-vault list) to seed + file.
- How: seed note stamp; file victim append; strict revalidation pass.
- Why: user hunt outranks analyst rows; Hypervisor kept labeled-as-provided since team post-mortem names only 4 vaults.
- Metadata: file still 75 rows; Gamma victims 4 -> 5.

## 2026-10-29 — Correction: BetterBank secondary EOA valid
- Correction to prior flag: seed value `0xf3BA…acAE` is 40 hex (valid); earlier 39-char reading came from a mistyped check string, not the stored value. Promoted to file — BetterBank hackers 4 -> 5. No seed edit needed beyond victim-confirmation stamp.

## 2026-10-29 — 25-hunt applied; file 75 -> 87
- What: applied evm-hunt-batch-25 (5 groups x 5). 13 READY: 12 promoted (Kame, RiskOnBlast, Vowcurrency, BasketDAO, LND, Fegex/BSC, Fence Tranche Vault, MOKE, Orange, Hinkal, zkLink Nova, Ajna V2); Holograph seed-only (Operator victim + attacker role unconfirmed). 4 partial banked (Seedify attacker, Demex victim, 42DAO victim+tx, BarnBridge attacker+tx). 3 marked out-of-scope (Polymarket Intl, CoW Swap, AirDAO — frontend/key theft, no victim contract). 5 NOT-FOUND with notes. Fence Finance marked DUP of Tranche Vault.
- How: 5 parallel hunt children (team post-mortem > auditor analysis > Etherscan labels), synthesis verdict table, match-count-guarded apply, strict rebuild validation.
- Why this way: independent hunters per group + no-guess rule (42DAO label withheld, BarnBridge candidate proxy excluded) keep file verified-only.
- Importance: file now 87 renderable EVM incidents; out-of-scope rulings stop repeat hunts on frontend/key-theft rows.
- Metadata: counts {candidates:421, worthy_both:87, hacker_only:1, victim_only:2, neither:331}. Flags: MOKE tier third-party (no team post-mortem); RiskOnBlast is rug class; Fegex ETH/Base instances unconfirmed; OcelotDex chain corrected to ZetaChain.

## 2026-10-29 — Second 25-hunt applied; file 87 -> 102
- What: applied evm-hunt-batch-25b. 15 READY promoted (USPD, Venus Core Pool BSC row, Echo, Alephium Bridge, R0AR, Chainge, Vicuna, LOOPSDAO, Orion, Swan Treasury, Flamincome, Projekt, Silo, Lien, MakerDAO keeper). 4 partial banked (BCE, ChainConnect, Astera.fi, Bloom). 5 out-of-scope (Axelar, Polyhedra, ReHold, Aerodrome, Agentic FoF). Blastoff NOT-FOUND.
- How: same 5-group parallel hunt + synthesis + guarded apply + strict rebuild validation.
- Why this way: no-guess rule held (BCE attacker, Bloom vault kept out); Venus BNB row promoted, zkSync row left split (different incident per evidence).
- Importance: file at 102 renderable EVM incidents, past the 100 mark.
- Metadata: counts {candidates:421, worthy_both:102, hacker_only:1, victim_only:2, neither:316}. Flags: Echo addresses single-source GitHub; R0AR tx is swap leg; Flamincome co-victim in seed; Lien date Jul-24 per Verichains.

## 2026-10-29 — Third 25-hunt applied; file 102 -> 118
- What: applied evm-hunt-batch-25c. 16 promoted (GeniusAI, UtopiaSphere, Zunami, Vestra DAO, Clober, Swarm, Wise V1, Predy, Aurellion, BGM, vETH, Cozy V2 2025 row, Singularity, Tsuru, Ankr ankrFLOW, Edel). SquidMulticall seed-only (victim 39 chars as reported). Flooring/Aethir partial banked. AFI/Clipper/Nexera/Evoq NOT-FOUND. Garden + Predict.fun out-of-scope.
- How: same parallel-hunt + synthesis + guarded apply; fixed seed multi-row matching (Cozy date-split, Garden date-pick) and file chain normalization (bnb chain->bnb etc).
- Why: no-guess rule held (SquidMulticall victim, Evoq 39-char proxy, BGM conflicting ref noted in seed).
- Importance: file at 118 renderable EVM incidents.
- Metadata: counts {candidates:421, worthy_both:118, hacker_only:1, victim_only:2, neither:300}. Flags: GeniusAI tx single-sourced; UtopiaSphere attacker RPC-derived; Zunami 2nd contract in seed; BGM victim-ref conflict; Cozy Sep-2026 row stays separate.

## 2026-10-29 — Fourth 25-hunt applied; file 118 -> 131
- What: applied evm-hunt-batch-25d. 13 promoted (YieldCore, FutureSwap-Arb, Ploutos, Syndicate, Impermax V3 Apr row, SIR, Goldfinch, The Idols, Yearn legacy-TUSD row, Dexodus, TLN, FutureSwap-Eth, dTRINITY dLEND). Sumer seed-only (victim 42 chars as reported). 6 partial banked (ZeroLend, Lava, IPOR tx-missing, Voltage, ParaSwap whitehat-tx, Lumi). Silo V2/Symbiosis NOT-FOUND. Kalax/ZEROBASE out-of-scope. Nov-11 Impermax row flagged erroneous.
- How: same parallel-hunt + synthesis + guarded apply; FutureSwap kept as 2 rows (Arb vs Eth are distinct).
- Why: no-guess rule held (Sumer 42-char victim, FutureSwap-Eth victim labeled uncertain, ParaSwap malicious EOAs unpublished).
- Importance: file at 131 renderable EVM incidents.
- Metadata: counts {candidates:421, worthy_both:131, hacker_only:1, victim_only:2, neither:287}. Flags: Goldfinch borderline (old test contract); Yearn row is legacy iearn TUSD not yETH; TLN loss varies $163K/$280K/$746K.

## 2026-10-29 — Fifth 25-hunt applied; file 131 -> 150
- What: applied evm-hunt-batch-25e. 19 promoted (Spectral, LeadBlock, DGLD, Balancer Aug-30 row, Movie Token, Curve LlamaLend, OpenLeverage, Bankroll Sep-24 row, ZongZiFa, SKP, Convergence, Renegade, Peapods, WUSD, DefiPlaza, Unilend V2, Allbridge, LAXO, BoostHook). Gondi/Fluid partial banked. zkFinance/Demex Perp NOT-FOUND. Polycule out-of-scope. Balancer Sep-09 row flagged possible copycat, kept split.
- How: same parallel-hunt + synthesis + guarded apply; multi-row date matching (Bankroll, Balancer).
- Why: no-guess rule held (Gondi attacker prefix-only, Fluid victim unverified).
- Importance: file at 150 renderable EVM incidents.
- Metadata: counts {candidates:421, worthy_both:150, hacker_only:1, victim_only:2, neither:268}. Flags: Spectral chain Base (seed said Ethereum); Balancer 1-of-5 txs; Curve victim is sDOLA vault (Inverse-framed); DefiPlaza tx is MEV copy; Movie Token date Feb-28 vs Mar-10.

## 2026-10-29 — Sixth 25-hunt applied; file 150 -> 169
- What: applied evm-hunt-batch-25f. 19 promoted (SKYDAO, four.meme Feb row, Yield, Stake DAO Mar-12 row, Denaria, AlpsCon, YIEDL, DBXen, Sharwa Oct-25 row, SynapLogic, ParticleTrade, USM, SubQuery, Meta Pool, Barley, MSCST, Magpie, Fox Market, GoldPesa). Zentra/TUR/ShapeShift partial banked. Pond.fun/Perpy NOT-FOUND. MetaDragon out-of-scope (GameFi).
- How: same parallel-hunt + synthesis + guarded apply; date-split rows (four.meme, Sharwa, Stake DAO).
- Why: no-guess rule held (TUR attacker likely-unconfirmed, Zentra undisclosed).
- Importance: file at 169 renderable EVM incidents.
- Metadata: counts {candidates:421, worthy_both:169, hacker_only:1, victim_only:2, neither:249}. Flags: Magpie row scoped to Ethereum (10-chain seed list trimmed); Yield/USM/MSCST single-sourced; Stake DAO representative tx of dozens; Sharwa 2nd attacker in seed.

## 2026-10-30 — Seventh 25-hunt applied; file 169 -> 184
- What: applied evm-hunt-batch-25g. 15 promoted (Ambient, WXETA, Thetanuts, SteamSwap, Huma, PRXVT, Alkimiya, warp.green, WAX bridge, Affine, UNCX V2, CheckoutPool, BTC24H, Matez, BeatXswap). 5 partial banked (AutoChain tx, Secured Finance, PGNLZ, Ramses, Citadel.one). QuantMaster/OPSEC NOT-FOUND. MetaSea/LayerSwap/StepHeroNFTs out-of-scope.
- How: same parallel-hunt + synthesis + guarded apply; WAX/warp.green rows scoped to EVM chains only.
- Why: no-guess rule held (Ramses per-pool victims, Citadel Redemption addr, OPSEC full triple unpublished).
- Importance: file at 184 renderable EVM incidents.
- Metadata: counts {candidates:421, worthy_both:184, hacker_only:1, victim_only:2, neither:234}. Flags: warp.green/WAX promoted without tx (payout txs unpublished); WXETA BSC-only; Matez copycat label in seed.

## 2026-10-30 — Eighth 25-hunt applied; file 184 -> 200
- What: applied evm-hunt-batch-25h. 16 promoted (Spectra, Kipseli, Dream Health, MainnetSettler, Grizzifi, CoW, dTRINITY sonic, Pythia, Juicebox V3, Nimiq, Bonfire, ether.fi, Usual USD0, Sorra, Mosca2, DoinGud). 5 partial banked (MintRisesPrices, Revert, DIMO, Asterix, EXcommunity). SmartCredit/Wise V2/sAVAX NOT-FOUND. Juice Finance out-of-scope (Munchables-Blast collateral only).
- How: parallel-hunt + synthesis; JSON data file + pre-validation step adopted after repeated heredoc tuple failures.
- Why: no-guess rule held throughout.
- Importance: file at 200 renderable EVM incidents.
- Metadata: counts {candidates:421, worthy_both:200, hacker_only:1, victim_only:2, neither:218}. Flags: dTRINITY sonic row split from dLEND ethereum row; CoW promoted without tx; Sorra full front-end contract recovered from txray.

## 2026-10-30 — Ninth 25-hunt applied; file 200 -> 207
- What: applied evm-hunt-batch-25i. 7 newly promoted (IoTeX, Moonwell Base wrsETH, CoWSwap Feb-2023, AIRWA, Tapioca DAO, Atomic Green, MOBOX). Fence Finance matched existing evm-0082 exactly (same attackers/victim/tx) — no new row. 2 partial banked (Tectonic Aug-2026, Humanity). 1 not-found (Tectonic Feb-2024). 13 scoped out (Phemex/Bitget-x2/Drift/Step/Rhea/THORChain/Syscoin/Across/Rain-YieldBlox/COLDCARD/RaveDAO); Binance-linked kept watch-only per user intent with 3 attackers banked.
- How: overlap pre-check caught Fence dup before apply; alias map for same-name seed rows (Bitget x2, Tectonic x2).
- Why: no-guess rule + dup discipline held.
- Importance: file at 207 renderable EVM incidents; non-EVM backlog nearly disposed.
- Metadata: counts {candidates:421, worthy_both:207, hacker_only:1, victim_only:2, neither:211}. Flags: CoWSwap row is PRE-CUTOFF 2023-02-07 (drop if scope strict); CoW now has 2 rows sharing GPv2Settlement (distinct incidents); attacker kinds defaulted eoa where source unspecified.

## 2026-10-30 — Tenth 25-hunt applied; file 207 -> 218
- What: applied evm-hunt-batch-25j. 11 newly promoted (Hector, Drips, SuperRare, Enjin, Fetch.ai no-tx, Concentric, Shibarium, BitBay no-tx, Panther no-tx, ALP, JokInTheBox). 8 partial banked (SmartCredit empty-second-hunt, Fractal unconfirmed-victim note-only, Velar, Rho single-source hold, Sunray, Moby, Rari Dec-2025, Neutrl). 5 not-found (GPU.NET, Clipper, Proxy_b7e1, QuantMaster 0xb58-prefix, Blastoff). 2 scoped out (dYdX V3 DNS hijack, Neutrl frontend).
- How: same JSON + pre-validation pipeline; NC() lowercases before fix-map (kills BSC/Arbitrum dupes at write time).
- Why: Rho held out on single-source attacker; Fractal unconfirmed victim note-only; no-tx READYs promoted on CoW precedent.
- Importance: file at 218 renderable EVM incidents.
- Metadata: counts {candidates:421, worthy_both:218, hacker_only:1, victim_only:2, neither:200}. Flags: Fetch.ai/Panther/BitBay promoted without tx; Panther victims are Safe + RealityModule; Shibarium chain tag new.

## 2026-10-30 — Eleventh 25-hunt applied; file 218 -> 230
- What: applied evm-hunt-batch-25k. 12 newly promoted (GHT, FixedTokenBSwap, Grand Base, VTSwapHook, Yapeswap, Unistreets, RPP, CrediX sonic, Zentra citrea-new-chain, AARK no-tx, NFPrompt no-tx, Nexera no-tx). NFPrompt/Nexera promoted on CoW precedent despite PARTIAL verdicts (full attacker+victim). Sandbox held (victim chain unconfirmed). 8 seed-only partials/notes (Garden attacker, AutoChain tx artifact, Kinto/ACB victims+txs, UPCX/USDgambit truncated, Monoswap/OPSEC/etc empty). Transit scoped out (TRON-native).
- Why: no-guess rule held; chain-unconfirmed Sandbox stays out of file.
- Importance: file at 230 renderable EVM incidents; citrea chain tag introduced.
- Metadata: counts {candidates:421, worthy_both:230, hacker_only:1, victim_only:2, neither:188}. Flags: AARK also in user manual pile (reconcile); NFPrompt pcov bsc vs seed ethereum; Sandbox chain TBD; AutoChain date typo fixed pre-apply.

## 2026-10-30 — Twelfth 25-hunt applied; file 230 -> 248
- What: applied evm-hunt-batch-25l. 18 newly promoted (Giddy, LML/USDT, Mozaic, Bizness, TMM/USDT, Cyrus, MixedSwapRouter, Ethervista, Bungee, Veil Cash, BlueBerry whitehat-labeled, Rico, Arrakis V1, ElevateFi, APEMAGA, MFT, Lixir, Reddio). 6 seed-only partials (Evoq, Bloom, Swell note-only, Base Lending, Vista, Goose). Tectonic Nov-18 scoped out (no credible incident, likely bad DeFiLlama entry).
- How: operator-link check added to apply (hacker overlap vs file prints OPERATOR-LINK).
- Why: BlueBerry executor labeled whitehat, never attacker; Swell tokens note-only (no confirmed loss); no-guess held.
- Importance: file at 248 renderable EVM incidents; biggest single batch (+18).
- Metadata: counts {candidates:421, worthy_both:248, hacker_only:1, victim_only:2, neither:170}. Flags: Lixir attacker EOA == user-provided Ocean Protocol attacker (cross-incident operator link); Lixir only 1 of 6 vaults named; Cyrus helper kind defaulted eoa; Tectonic 3rd row out.

## 2026-10-30 — Thirteenth 25-hunt applied; file 248 -> 257
- What: applied evm-hunt-batch-25m. 9 newly promoted (Makina, ETHFIN, Float, Ekubo, Aventa, Mure, OTSea, X319, NFTG). ParaSwap HELD (whitehat-frontrunner attribution unresolved — banked only, standing flag preserved). 2 partials banked (Banana Gun 11 EOAs, Moonwell MIP-X43 victim+tx). TAC scoped out (TON-native). 12 not-found (incl. Demex post-mortem-no-addrs, sAVAX 2nd strike, Wise V2 2nd strike).
- How: same JSON + pre-validation pipeline; stray MFT entry + NFTG date typo caught pre-apply.
- Why: verified-vs-inferred split is the core design rule — a maybe-whitehat never enters the file as attacker.
- Importance: file at 257 renderable EVM incidents.
- Metadata: counts {candidates:421, worthy_both:257, hacker_only:1, victim_only:2, neither:161}. Flags: ParaSwap hold; Ekubo vuln-ext note-only; Moonwell overlap check clean.

## 2026-10-30 — Fourteenth 25-hunt applied; file 257 -> 269
- What: applied evm-hunt-batch-25n. 12 newly promoted (RuggedArt, Set ETHMACOAPY, ChiSale, Mosca, Zenterest, Limit Break, WealthManagementV2, SquidRouterModule, Set Protocol 07-30, Startale, FOOM whitehat-labeled, BBT). Set Protocol 2026-10-06 seed row merged as dup (single file row). 6 seed-only partials (Transit proceeds-link, Omnipus, Pond.fun, Cascade laundering wallets, Panoptic whitehat, Symbiosis note-only). Chainflip out (Tron), Unverified_35bc out (no such incident).
- How: seed_name alias for dup-row banking; MEV-bot explicitly excluded from Limit Break attackers.
- Why: dup discipline; whitehat labels; burn-pattern DeaD addr flagged not silently trusted.
- Importance: file at 269 renderable EVM incidents; apechain chain tag introduced.
- Metadata: counts {candidates:421, worthy_both:269, hacker_only:1, victim_only:2, neither:149}. Flags: ChiSale attacker == X319 attacker (operator link); Limit Break DeaD addr role unverified; SquidRouter Arb possible beyond seed chains; Transit Apr/May proceeds link.

## 2026-10-30 — Final 5-hunt applied; file 269 -> 271
- What: applied evm-hunt-final-5. 2 newly promoted (zkSync Airdrop team-sourced, MEV Bot Fallback). EtherVista 2026-10-09 caught as DUP of evm-0239 (identical attacker/router/victim/tx, case-variant rows) — merged. Volo partial banked (EVM exit only). Initia out (cosmos).
- How: same pipeline; dup caught by address comparison, not name.
- Why: machine needs-both pile now exhausted (35 stuck rows hunted 2-3x with nothing publishable).
- Importance: file at 271 renderable EVM incidents; machine curation phase complete.
- Metadata: counts {candidates:421, worthy_both:271, hacker_only:1, victim_only:2, neither:147}. Flags: EtherVista/Ethervista case-variant dup merged; zkSync victims on zksync chain.

## 2026-10-30 — Backlog audit + counter correction
- What: user asked for machine backlog size. Found meta counter stale (421 vs 464 actual seed rows — seed grew via manual adds while counter hardcoded). Only exact-dup group was Venus Core Pool 2026-03-15 x2: proven distinct incidents ($3.7M BSC in file vs $902k unresolved) — renamed latter to 'Venus Core Pool $902k (unresolved)'.
- How: full seed-vs-file recompute; rename preserves both rows.
- Why: hardcoded 421 formula lied; counts must derive from data.
- Importance: honest backlog accounting going forward.
- Metadata: counts {candidates:464, worthy_both:271, holds_both_sides:15, partials_one_side:71, stuck_neither:35, scoped_out:54}. 271+15+71+35+54=446; +18 dup-name rows covered by file = 464.

## 2026-10-30 — OFAC seed in; data prep complete
- What: pulled OFAC sanctioned digital-currency lists (lists branch abad1e7b) for the 4 native EVM assets (ETH/ETC/ARB/BSC) into data/seeds/ofac.json with commit pin + fetch date. Shared addresses merged across assets (one row, multi-chain).
- How: raw JSON arrays validated full-42-char before write; NONE-walk; dup check.
- Why: INFRA-1 requires versioned OFAC + exploit lists with source URLs; USDT/USDC held out (0x entries lack chain attribution — no-guess).
- Importance: risk screening (API-3) now has both verified lists local: OFAC + 271 exploits.
- Metadata: evm_sanctioned count in file meta. Decisions: v1 = 4 native lists; USDT/USDC = next step with chain attribution; entity names omitted (upstream lists are bare addresses — no field, not null).

## 2026-10-31 — INFRA-1 done: local store + seeds
- What: infra/store.py (SQLite schema: seed_versions, risk_lists, addresses, transfers, traces, risk_hits, reports), .env.example, .gitignore. Seed loader pins OFAC commit + exploit generated-date as version rows.
- How: single connect() + seed_all(); mixed-case addresses lowercased at write, matched case-insensitively. Verified in /tmp: 123 OFAC + 752 exploit rows seeded, trace + risk-hit roundtrip, read-only offline reopen identical.
- Why: document-style traces (path JSON) match the file's shape; unified risk_lists table gives API-3 exact-match in one lookup; .env never committed.
- Importance: every later item builds on this store.
- Metadata: risk_lists holds 866 rows (9 shared addresses deduped across incidents — operator links collapse, label keeps last protocol; match unaffected).

## 2026-10-31 — Data-loss incident + master rebuild
- What: rename `mv data/evm_exploits.json data/seeds/exploits.json` overwrote the 464-row master (data/ never committed; no git recovery). Strict 271-row file intact (only misnamed). Rebuilt master.json from DeFiLlama re-pull (687 rows >=2024) + strict overlay (271 full-fidelity) + 9 /tmp hunt files (204 entries) + test-DB risk_lists (866 banked mappings) + dup handling (Venus $902k, EtherVista, Set Protocol, OcelotDex ledger-dup merged, Term/TrustedVolumes date-variants flagged).
- How: /tmp/rebuild_master.py; row validation FULL/TX regex; counts recomputed from data.
- Why: superset rebuild (nothing wrongly excluded); losses isolated to early-batch curation.
- Importance: file untouched; curation partially degraded; new rule adopted (commit safe-point + approval before any mv/rm).
- Metadata: master 764 rows; recovered holds 7/15, partials 29/71, scoped 21/54; ~350 ledger rows unreviewed (never in original 421); early-batch notes/user-only rows need re-entry from conversation on request.

## 2026-10-31 — Safe-point commit + user rows re-entered
- What: committed 19bc129 (strict+master+OFAC+INFRA-1+docs). Re-entered WOOFi (victim+tx), Ribbon (6 addrs), Bunni V2 (hub) from conversation verbatim with re-entry provenance tags.
- How: user-approved commit naming changed files only; fill script asserted address formats.
- Why: safe point before any further moves; user data restored first.
- Importance: your 3 rows are back; Payy/mMamo/UXLINK still need your input (below).
- Metadata: commit 19bc129.

## 2026-10-31 — Manual pile reconciled to 88 + 28 named-lost + scope restored
- What: separated true manual rows from rebuild artifacts using system.md batch logs as evidence. Re-marked 19 documented scope-outs (CoW Swap, AirDAO, ReHold, Agentic FoF, Kalax, ZEROBASE, Polycule, MetaDragon, MetaSea, LayerSwap, StepHeroNFTs, PlayDapp, Gala, Somesing, Gamee, Remilia, EigenLayer, NoOnes, Triple-A). Tagged 11 known-early rows whose data was lost (Seedify, Demex, 42DAO, BarnBridge, BCE, ChainConnect, Astera.fi, Aethir, Lava, SquidMulticall, Holograph).
- How: log-evidence cross-check; scope only where row empty + unique + unfiled; no file rows touched; conflicts kept (Garden, Limit Break, zkSync Airdrop, Moonwell Lending — later evidence wins).
- Why: rebuild mixed 325 unreviewed ledger rows into the pile; the 122 must be membership-accurate for the user's sort.
- Importance: manual pile now 85 classified (7/12/20/46); 28 named rows unrecoverable from data (list in chat report); ~9 early note-only rows unidentifiable from surviving evidence.
- Metadata: scoped count 73; unreviewed rebuild rows 295, quarantined out of manual.

## 2026-10-31 — Manual pile finalized at 95; 122 fully accounted
- What: verified recount (structure-checked): manual 95 = 7 full + 12 attacker-only + 20 victim-only + 56 none. Tagged Polymarket Nov-2025 (logged hacker lost). ZKsync ledger row confirmed same incident via DeFiLlama description, duped out. Axelar/Polyhedra/Aerodrome/Predict Fun scope restored from 25b/25c logs.
- How: log-evidence cross-check + ledger description check; no file rows touched.
- Why: close the 122 with evidence, not estimates.
- Importance: manual pile final and sortable; gap is 27 (4 confirmed-gone + YO ambiguity + ~20 unidentifiable early note-only rows).
- Metadata: file 271 rows (270 names); master 716; scoped 46; unreviewed 284 quarantined.

## 2026-10-31 — API-1 done: address intelligence Worker (offline-verified)
- What: workers/api (TS Worker + D1): GET /v1/address/:chain/:addr (balances when keyed, seed labels always) and /transfers (cache-first, Alchemy getAssetTransfers on miss, stale-cache fallback). D1 schema ports INFRA-1 + fetched_at; seed.sql generated from versioned seeds. tsc --noEmit clean.
- How: esbuild bundle + node:sqlite harness exercising the real handler + real SQL (sandbox blocks loopback listen, so wrangler dev/d1-local can't run here). 7 assertions: listed attacker labels live:false, clean address unlabeled, empty-cache stale response, 400/404 paths, seeded-transfer cache hit, risk-hit logging. 866 risk rows, version pins 123/752.
- Why: Worker-direct (AI Gateway routes AI providers, not data APIs); cache-first keeps $0 idle and offline usable; no-key mode degrades honestly instead of failing.
- Importance: UI-1 can build against this response shape now.
- Metadata: not verified here: live Alchemy calls (no key), wrangler deploy/remote D1 (no account, sandbox listen blocked). node_modules + package-lock untracked, left for commit decision.

## 2026-10-31 — API-1 hardened with alchemy skills; live blocked on key networks
- What: installed alchemyplatform/skills (global; workspace .agents blocked by sandbox). Applied alchemy-api guidance to Worker: 429/5xx exponential backoff with jitter (4 attempts), base-URL and endpoint usage already matched cheat sheet. Re-verified: tsc clean, offline harness green.
- How: CLI doctor showed rpc_data complete, but evm gas smoke tests return NETWORK_NOT_ENABLED for eth/base/bnb — key valid, no networks enabled on the app.
- Why: backoff is mandatory per skill failure-modes; live verification needs a network-enabled key (user dashboard action).
- Importance: API-1 code is skill-aligned; only live-call proof outstanding.
- Metadata: needs ALCHEMY_API_KEY with eth-mainnet enabled (minimum) to complete live verification.

## 2026-10-31 — API-1 migrated to Hono, re-verified
- What: replaced hand-rolled regex router with Hono (cors middleware on /v1/*). Same routes, same status codes, same response shapes.
- How: npm i hono; rewrote src/index.ts only; alchemy.ts/db.ts untouched. Same esbuild + node:sqlite harness, all 7 assertions green.
- Why: CORS for the Pages frontend, validator-ready params for API-2/3, hono/rpc typed client for Vue later. Growth migration, not a fix.
- Importance: UI-1 can call with CORS working; router scales from here.
- Metadata: contract unchanged (balances key stays `tokens`).

## 2026-10-31 — API-1 restructured to Hono factory + stores (knot relay-proxy pattern)
- **What:** Reorganized `workers/api/src` to mirror `~/Developer/knot...rpc_proxy`: `app.ts` (`createApp(options?)` factory with CORS + route mounting), `routes/address.ts` (two endpoints, zod-validated), `stores/risk.ts` (label lookup + `risk_hits`), `stores/transfers.ts` (cache read/write + live fetch + sweep-cap), `alchemy.ts` (`AlchemyClient` class + injectable), `constants/chains.ts`, `types/` (Env, AppType for `hono/rpc`). Deleted dead `src/db.ts`. Added `migrations/0001_initial.sql` + `nodejs_compat` + `migrations_dir` in wrangler.toml. Validation via `zod` + `@hono/zod-validator` (bad chain/address now 400, was 404).
- **How:** Compared knot layout (`src/index.ts` → `createApp`, `utils/*`, `constants/*`, `types/*`); ported modules one at a time; `tsc --noEmit` clean; esbuild bundle; extended `/tmp/verify_api1.mjs` to 8 assertions incl. factory injection test (`createApp({ alchemy: fake })` → `live:true` + row persisted).
- **Why:** Factory + options bag makes routes unit-testable without network/env (matches knot precedent); zod validators replace ad-hoc checks; D1 migrations replace raw schema.sql for deploys.
- **Importance:** API-1 now has the exact seam API-2 (fund-flow tracing, 1–2 hops) needs: `getTransfers` client injectable, cache stores isolated per concern; UI can type its client via `AppType`.
- **Metadata:** offline harness 8/8 passing (`API-1 OFFLINE VERIFIED`); exploit seed 752 rows, OFAC 123; live Alchemy still needs network-enabled key. Note: safe-point commit `3f9775c` accidentally included `workers/api/node_modules` (3106 files) — unstaged via `git rm --cached`, removal commit pending user approval.

## 2026-10-31 — Tooling default bun; git hygiene cleanup
- **What:** `bun` (1.2.19) is now the default JS/TS toolchain. `bun install` migrated `package-lock.json` → `bun.lock`; `package-lock.json` removed. `.gitignore` extended (`node_modules/`, `.wrangler/`, `dist/`, `.dev.vars`, `*.tsbuildinfo`); `workers/api/node_modules` (accidentally committed in `3f9775c`) fully unstaged. README commands switched to `bun`/`bunx`; AGENT.md gained Tooling + Git hygiene rules.
- **How:** `bun install` (auto-migrated lockfile, 110 packages, no changes); `git rm` for package-lock; verified with `bun run check`, `bunx esbuild` bundle, and the 8-assertion offline harness — all green.
- **Why:** Single toolchain, faster installs, one lockfile per package; keeps generated/secret files out of history going forward.
- **Importance:** Prevents a repeat of the 3,106-file node_modules commit; deploy path (`bun run deploy`) matches local dev.
- **Metadata:** hygiene changes staged but NOT committed — commit pending explicit user approval.

## 2026-10-31 — SQL consolidated to workers/api/sql/
- **What:** `schema.sql` + `seed.sql` moved to `workers/api/sql/` (`git mv`, renames staged). References updated: `package.json` migrate/seed scripts, `scripts/make_seed.py` output path, README deploy commands. `migrations/` deliberately left separate.
- **How:** One `git mv` per file with `ls` verification between steps; regenerated seed via `make_seed.py` (123 OFAC + 752 exploit rows, byte-identical content at new path); re-ran offline harness 8/8 green.
- **Why:** Single home for SQL artifacts. `migrations/` stays apart because wrangler auto-applies everything in `migrations_dir` on deploy — seed INSERTs must never become a migration.
- **Importance:** Keeps deploy (`migrations/`) vs dev/seed (`sql/`) concerns from mixing; next reader finds all SQL in one place.
- **Metadata:** safe point `2a8fcc3` (clean tree before moves); commit pending.

## 2026-10-31 — infra/ retired; prettier + format-before-push enforced
- **What:** Deleted `infra/store.py` (+ `__pycache__`, `infra/` dir removed) — zero consumers; schema/seed now owned by `workers/api/sql/` + `make_seed.py` + TS stores. Added prettier (dev dep), `.prettierrc.json` (single-quote, semi, 100-col), `.prettierignore` (excludes generated `sql/seed.sql`, `bun.lock`), `format` / `format:check` scripts. Baseline formatted (4 files). Local pre-push hook blocks unformatted pushes; AGENT.md records the rule.
- **How:** Safe-point commit `ef06131` before deletion; `git rm` + `rmdir` with verification between steps. `bun add -d prettier` needed `--cache-dir /tmp/bun-cache` (sandbox blocks bun's default tempdir). Verified: `format` → `check` clean → esbuild bundle → harness 8/8 green; `git push --dry-run` passes the hook.
- **Why:** One language in the deploy path (TS); Python stays data-side only. Formatting enforced mechanically, not by memory.
- **Importance:** Kills the last duplicate schema; every future push is auto-checked for style.
- **Metadata:** local main 5 ahead of origin/main (nothing pushed); this batch NOT committed — pending approval.

## 2026-10-31 — make_seed ported Python → TypeScript
- **What:** `scripts/make_seed.py` rewritten as `scripts/make_seed.ts` (bun-native, `node:` stdlib only); `.py` deleted. `gen:seed` script added; README updated. `tsconfig` now includes `scripts/**/*.ts` with `@types/node` alongside workers-types. Bonus fix: repo root is derived from the script path instead of the hardcoded `/Users/peter/Developer/...` absolute path the Python version carried.
- **How:** Ported the quoting/row logic 1:1, including a `pyList` helper replicating Python `json.dumps` separators so chain-list columns stay identical. Proved with `diff`: TS output is byte-identical to the Python output (123 OFAC + 752 exploit rows, committed `seed.sql` untouched by regen).
- **Why:** Last Python file in the deploy-adjacent tree; single-language repo (TS + SQL) per the Cloudflare direction — one toolchain, prettier covers the script, typechecker covers it too.
- **Importance:** Removes the "why is there Python here" question for every future reader; seed regen is now `bun run gen:seed`.
- **Metadata:** `bun run check`, `format:check`, `gen:seed` (zero-diff regen) all green. Batch NOT committed — pending approval.
