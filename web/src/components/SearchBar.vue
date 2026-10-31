<template>
  <form v-bind="stylex.attrs(styles.bar)" @submit.prevent="go">
    <select
      v-model="chain"
      v-bind="stylex.attrs(styles.select)"
      aria-label="Chain"
    >
      <option v-for="c in CHAINS" :key="c" :value="c">{{ c }}</option>
    </select>
    <input
      v-model="query"
      v-bind="stylex.attrs(styles.input)"
      placeholder="Paste a wallet address or ENS name"
      spellcheck="false"
      :disabled="busy"
    />
    <button
      type="submit"
      v-bind="stylex.attrs(styles.button)"
      :disabled="busy || !query.trim()"
    >
      {{ busy ? "…" : "Inspect" }}
    </button>
  </form>
</template>

<script setup lang="ts">
import * as stylex from "@stylexjs/stylex";
import { styles } from "./SearchBar.styles";
import { ref } from "vue";
import { CHAINS, type Chain } from "../api";

const props = defineProps<{ busy: boolean }>();
const emit = defineEmits<{ search: [query: string, chain: Chain] }>();

const query = ref("");
const chain = ref<Chain>("ethereum");

function go(): void {
  if (props.busy || !query.value.trim()) return;
  emit("search", query.value.trim(), chain.value);
}
</script>
