<template>
  <div>
    <table v-bind="stylex.attrs(styles.table)">
      <thead>
        <tr>
          <th v-bind="stylex.attrs(styles.th)">Direction</th>
          <th v-bind="stylex.attrs(styles.th)">Counterparty</th>
          <th v-bind="stylex.attrs(styles.th)">Asset</th>
          <th v-bind="stylex.attrs(styles.th)">Value</th>
          <th v-bind="stylex.attrs(styles.th)">Tx</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="t in rows" :key="t.hash" v-bind="stylex.attrs(styles.tr)">
          <td v-bind="stylex.attrs(styles.td)">
            {{ t.from.toLowerCase() === self ? "OUT" : "IN" }}
          </td>
          <td v-bind="stylex.attrs(styles.td, styles.mono)">
            <a
              v-bind="stylex.attrs(styles.link)"
              :href="explorer(t.from.toLowerCase() === self ? t.to : t.from)"
              target="_blank"
              rel="noreferrer"
            >
              {{ short(t.from.toLowerCase() === self ? t.to : t.from) }}
            </a>
          </td>
          <td v-bind="stylex.attrs(styles.td)">{{ t.asset || "—" }}</td>
          <td v-bind="stylex.attrs(styles.td, styles.mono)">
            {{ t.value || "—" }}
          </td>
          <td v-bind="stylex.attrs(styles.td, styles.mono)">
            <a
              v-bind="stylex.attrs(styles.link)"
              :href="explorerTx(t.hash)"
              target="_blank"
              rel="noreferrer"
              >{{ short(t.hash) }}</a
            >
          </td>
        </tr>
      </tbody>
    </table>
    <button
      v-if="hasMore"
      v-bind="stylex.attrs(styles.more)"
      :disabled="loadingMore"
      @click="emit('loadMore')"
    >
      {{ loadingMore ? "Loading…" : "Load more" }}
    </button>
  </div>
</template>

<script setup lang="ts">
import * as stylex from "@stylexjs/stylex";
import { styles } from "./HistoryTable.styles";
import type { Transfer } from "../api";

const props = defineProps<{
  rows: Transfer[];
  self: string;
  chain: string;
  hasMore: boolean;
  loadingMore: boolean;
}>();
const emit = defineEmits<{ loadMore: [] }>();

const EXPLORERS: Record<string, string> = {
  ethereum: "https://etherscan.io",
  base: "https://basescan.org",
  bsc: "https://bscscan.com",
  polygon: "https://polygonscan.com",
  arbitrum: "https://arbiscan.io",
  optimism: "https://optimistic.etherscan.io",
};

function explorer(addr: string): string {
  return `${EXPLORERS[props.chain] ?? EXPLORERS.ethereum}/address/${addr}`;
}
function explorerTx(hash: string): string {
  return `${EXPLORERS[props.chain] ?? EXPLORERS.ethereum}/tx/${hash}`;
}
function short(h: string): string {
  return h.length > 12 ? `${h.slice(0, 6)}…${h.slice(-4)}` : h;
}
</script>
