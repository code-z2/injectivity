<template>
  <div v-bind="stylex.attrs(styles.stage)">
    <div v-bind="stylex.attrs(styles.wash)"></div>

    <header v-bind="stylex.attrs(styles.topbar)">
      <span v-bind="stylex.attrs(styles.brand)">
        <span v-bind="stylex.attrs(styles.mark)"></span>
        Intel Terminal
      </span>
      <SettingsMenu :settings="current" @change="update" />
    </header>

    <main v-bind="stylex.attrs(styles.center)" class="vt-enter">
      <h1 v-bind="stylex.attrs(styles.headline)">
        Trace any wallet.<br />No wallet needed.
      </h1>
      <p v-bind="stylex.attrs(styles.sub)">
        Paste an ENS name or a 0x address. Funds, risk and hidden links surface
        in seconds — with verified facts kept apart from inference.
      </p>

      <form v-bind="stylex.attrs(styles.console)" @submit.prevent="go">
        <select
          v-model="current.chain"
          v-bind="stylex.attrs(styles.chain)"
          aria-label="Chain"
          @change="persist"
        >
          <option v-for="c in CHAINS" :key="c" :value="c">{{ c }}</option>
        </select>
        <input
          v-model="query"
          v-bind="stylex.attrs(styles.input)"
          placeholder="Enter an ENS name or wallet address"
          spellcheck="false"
          autocomplete="off"
          aria-label="ENS name or wallet address"
        />
        <button
          type="submit"
          v-bind="stylex.attrs(styles.go)"
          :disabled="!query.trim()"
        >
          Trace
        </button>
      </form>

      <div v-bind="stylex.attrs(styles.examples)">
        <button
          v-for="ex in EXAMPLES"
          :key="ex.value"
          v-bind="stylex.attrs(styles.chip)"
          @click="pick(ex.value, ex.chain)"
        >
          {{ ex.label }}
        </button>
      </div>
    </main>

    <footer v-bind="stylex.attrs(styles.strip)">
      <span>866 flagged addresses indexed</span>
      <span>depth-2 fund-flow mesh</span>
      <span>verified vs inferred, always separate</span>
      <span>reports as PDF</span>
    </footer>
  </div>
</template>

<script setup lang="ts">
import * as stylex from "@stylexjs/stylex";
import { reactive, ref } from "vue";
import { CHAINS } from "../api";
import { loadSettings, saveSettings, type Settings } from "../settings";
import SettingsMenu from "./SettingsMenu.vue";
import { styles } from "./LandingConsole.styles";

const emitFn = defineEmits<{ search: [query: string, chain: string] }>();

const EXAMPLES = [
  { label: "vitalik.eth", value: "vitalik.eth", chain: "ethereum" },
  {
    label: "KelpDAO hacker 0x8B1b…D3b",
    value: "0x8B1b6c9A6DB1304000412dd21Ae6A70a82d60D3b",
    chain: "ethereum",
  },
] as const;

const current = reactive(loadSettings());
const query = ref("");

function persist(): void {
  saveSettings({ ...current });
}

function update(next: Settings): void {
  Object.assign(current, next);
}

function go(): void {
  const q = query.value.trim();
  if (!q) return;
  persist();
  emitFn("search", q, current.chain);
}

function pick(value: string, chain: string): void {
  query.value = value;
  current.chain = chain as typeof current.chain;
  go();
}

defineExpose({ settings: current });
</script>
