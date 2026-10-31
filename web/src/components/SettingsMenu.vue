<template>
  <div v-bind="stylex.attrs(styles.wrap)">
    <button v-bind="stylex.attrs(styles.toggle)" @click="open = !open">
      Settings
    </button>
    <div v-if="open" v-bind="stylex.attrs(styles.panel)">
      <p v-bind="stylex.attrs(styles.title)">Chain and model</p>

      <label v-bind="stylex.attrs(styles.label)" for="sm-chain">Chain</label>
      <select
        id="sm-chain"
        :value="settings.chain"
        v-bind="stylex.attrs(styles.field)"
        @change="set('chain', ($event.target as HTMLSelectElement).value)"
      >
        <option v-for="c in CHAINS" :key="c" :value="c">{{ c }}</option>
      </select>

      <label v-bind="stylex.attrs(styles.label)" for="sm-rpc">
        Custom RPC (ENS resolution)
      </label>
      <input
        id="sm-rpc"
        :value="settings.ensRpcUrl"
        v-bind="stylex.attrs(styles.field)"
        placeholder="https://your-mainnet-rpc.example"
        spellcheck="false"
        @input="set('ensRpcUrl', ($event.target as HTMLInputElement).value)"
      />
      <p v-bind="stylex.attrs(styles.hint)">
        Empty uses the built-in public RPC. Stored only in this browser.
      </p>

      <label v-bind="stylex.attrs(styles.label)" for="sm-key">
        Model key (BYO, optional)
      </label>
      <input
        id="sm-key"
        :value="settings.modelKey"
        type="password"
        v-bind="stylex.attrs(styles.field)"
        placeholder="Leave empty to use the service key"
        autocomplete="off"
        @input="set('modelKey', ($event.target as HTMLInputElement).value)"
      />

      <label v-bind="stylex.attrs(styles.label)" for="sm-model">Model</label>
      <input
        id="sm-model"
        :value="settings.model"
        v-bind="stylex.attrs(styles.field)"
        placeholder="muse-spark-1.3-contributor"
        spellcheck="false"
        @input="set('model', ($event.target as HTMLInputElement).value)"
      />

      <label v-bind="stylex.attrs(styles.label)" for="sm-effort">
        Reasoning effort
      </label>
      <select
        id="sm-effort"
        :value="settings.effort"
        v-bind="stylex.attrs(styles.field)"
        @change="set('effort', ($event.target as HTMLSelectElement).value)"
      >
        <option value="low">low</option>
        <option value="medium">medium</option>
        <option value="high">high</option>
      </select>
    </div>
  </div>
</template>

<script setup lang="ts">
import * as stylex from "@stylexjs/stylex";
import { ref } from "vue";
import { CHAINS } from "../api";
import { saveSettings, type Settings } from "../settings";
import { styles } from "./SettingsMenu.styles";

const props = defineProps<{ settings: Settings }>();
const emitFn = defineEmits<{ change: [settings: Settings] }>();
const open = ref(false);

function set<K extends keyof Settings>(key: K, value: string): void {
  const next = { ...props.settings, [key]: value } as Settings;
  saveSettings(next);
  emitFn("change", next);
}
</script>
