<template>
  <div v-bind="stylex.attrs(layout.page)">
    <div v-bind="stylex.attrs(layout.wrap)">
      <header v-bind="stylex.attrs(styles.head)">
        <h1 v-bind="stylex.attrs(styles.title)">Intel Terminal</h1>
        <p v-bind="stylex.attrs(styles.sub)">
          On-chain security investigations. Paste an address — no wallet, ever.
        </p>
      </header>

      <SearchBar
        :busy="phase === 'loading' || phase === 'resolving'"
        @search="inspect"
      />

      <p v-if="phase === 'resolving'" v-bind="stylex.attrs(styles.status)">
        Resolving name…
      </p>
      <p v-if="phase === 'loading'" v-bind="stylex.attrs(styles.status)">
        Fetching intel…
      </p>
      <p v-if="error" v-bind="stylex.attrs(styles.error)">{{ error }}</p>

      <section
        v-if="intel"
        v-bind="stylex.attrs([layout.panel, styles.profile])"
      >
        <div v-bind="stylex.attrs(styles.idrow)">
          <div>
            <p v-bind="stylex.attrs(styles.addr, layout.mono)">
              {{ intel.address }}
            </p>
            <p v-bind="stylex.attrs(styles.chainline)">
              {{ intel.chain }} · {{ intel.live ? "live" : "cached" }} ·
              {{ intel.balances ? "balances loaded" : "balances unavailable" }}
            </p>
          </div>
          <RiskBadge :level="intel.risk.level" />
        </div>

        <div v-if="intel.labels.length > 0" v-bind="stylex.attrs(styles.chips)">
          <span
            v-for="l in intel.labels"
            :key="`${l.list_name}/${l.role}`"
            v-bind="stylex.attrs(styles.chip, layout.mono)"
          >
            {{ l.list_name }} / {{ l.role }} — {{ l.label }}
          </span>
        </div>

        <RiskPanel
          :matches="intel.risk.matches"
          :screened="intel.risk.screened"
        />

        <div v-if="intel.balances" v-bind="stylex.attrs(styles.balances)">
          <span v-bind="stylex.attrs(styles.balance, layout.mono)"
            >{{ nativeSymbol(intel.chain) }}
            {{ fmtNative(intel.balances.native) }}</span
          >
          <span v-bind="stylex.attrs(styles.tokencount)"
            >{{ intel.balances.tokens.length }} token(s)</span
          >
        </div>

        <h2 v-bind="stylex.attrs(styles.h2)">History</h2>
        <HistoryTable
          :rows="transfers"
          :self="intel.address"
          :chain="intel.chain"
          :has-more="pageKey !== undefined"
          :loading-more="loadingMore"
          @load-more="more"
        />

        <InvestigatePanel
          :key="intel.address"
          :chain="intel.chain"
          :address="intel.address"
        />
      </section>

      <TraceGraph
        v-if="intel"
        :key="`graph-${intel.address}`"
        :chain="intel.chain"
        :address="intel.address"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import * as stylex from "@stylexjs/stylex";
import { layout, styles } from "./App.styles";
import { ref } from "vue";
import { fetchIntel, fetchTransfers, type Intel, type Transfer } from "./api";
import { looksLikeEns, resolveEns } from "./ens";
import HistoryTable from "./components/HistoryTable.vue";
import InvestigatePanel from "./components/InvestigatePanel.vue";
import RiskBadge from "./components/RiskBadge.vue";
import RiskPanel from "./components/RiskPanel.vue";
import SearchBar from "./components/SearchBar.vue";
import TraceGraph from "./components/TraceGraph.vue";

type Phase = "idle" | "resolving" | "loading" | "ready" | "error";

const phase = ref<Phase>("idle");
const error = ref("");
const intel = ref<Intel | null>(null);
const transfers = ref<Transfer[]>([]);
const pageKey = ref<string | undefined>(undefined);
const loadingMore = ref(false);
const activeChain = ref("ethereum");
const activeAddress = ref("");

async function inspect(query: string, chain: string): Promise<void> {
  phase.value = "resolving";
  error.value = "";
  intel.value = null;
  transfers.value = [];
  pageKey.value = undefined;
  try {
    const address = looksLikeEns(query) ? await resolveEns(query) : query;
    if (!/^0x[0-9a-fA-F]{40}$/.test(address)) throw new Error("bad-address");
    activeChain.value = chain;
    activeAddress.value = address.toLowerCase();
    phase.value = "loading";
    const [info, first] = await Promise.all([
      fetchIntel(chain, address),
      fetchTransfers(chain, address),
    ]);
    intel.value = info;
    transfers.value = first.transfers;
    pageKey.value = first.pageKey;
    phase.value = "ready";
  } catch (e) {
    phase.value = "error";
    error.value =
      e instanceof Error && e.message === "ens-unresolved"
        ? "That name does not resolve on mainnet."
        : e instanceof Error && e.message === "bad-address"
          ? "Enter a 0x address or an ENS name."
          : "Lookup failed. Is the API running?";
  }
}

const NATIVE_SYMBOLS: Record<string, string> = {
  ethereum: "ETH",
  base: "ETH",
  arbitrum: "ETH",
  optimism: "ETH",
  bsc: "BNB",
  polygon: "POL",
};

function nativeSymbol(chain: string): string {
  return NATIVE_SYMBOLS[chain] ?? "ETH";
}

function fmtNative(hex: string): string {
  try {
    const wei = BigInt(hex);
    const whole = wei / 10n ** 18n;
    const frac = (wei % 10n ** 18n)
      .toString()
      .padStart(18, "0")
      .replace(/0+$/, "")
      .slice(0, 4);
    return frac ? `${whole}.${frac}` : `${whole}`;
  } catch {
    return hex;
  }
}

async function more(): Promise<void> {
  if (pageKey.value === undefined || loadingMore.value || !intel.value) return;
  loadingMore.value = true;
  try {
    const next = await fetchTransfers(
      activeChain.value,
      activeAddress.value,
      pageKey.value,
    );
    transfers.value = [...transfers.value, ...next.transfers];
    pageKey.value = next.pageKey;
  } finally {
    loadingMore.value = false;
  }
}
</script>
