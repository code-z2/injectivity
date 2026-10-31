<template>
  <div v-bind="stylex.attrs(styles.box)">
    <div v-bind="stylex.attrs(styles.row)">
      <input
        v-model="key"
        type="password"
        v-bind="stylex.attrs(styles.key)"
        placeholder="Optional Muse key override (stored only in this browser)"
        autocomplete="off"
      />
      <button
        v-bind="stylex.attrs(styles.run)"
        :disabled="running"
        @click="run"
      >
        {{ running ? "Investigating…" : "Investigate" }}
      </button>
    </div>
    <p v-if="error" v-bind="stylex.attrs(styles.error)">{{ error }}</p>
    <div v-if="result" v-bind="stylex.attrs(styles.report)">
      <p v-bind="stylex.attrs(styles.summary)">{{ result.summary }}</p>
      <p v-bind="stylex.attrs(styles.meta)">
        {{ result.findingCount }} findings ({{
          result.verdictCounts.verified
        }}
        verified / {{ result.verdictCounts.inferred }} inferred) ·
        {{ result.uncertaintyCount }} open questions ·
        {{ result.nextCheckCount }} next checks
        <span v-if="result.stripped > 0">
          · {{ result.stripped }} draft claim(s) removed for missing
          evidence</span
        >
        <span v-if="result.reportId !== null">
          · report #{{ result.reportId }}</span
        >
      </p>
    </div>
    <ReportView
      v-if="result && result.reportId !== null"
      :report-id="result.reportId"
      :chain="props.chain"
    />
    <p v-else-if="!running" v-bind="stylex.attrs(styles.hint)">
      Findings, uncertainty, and the PDF export render here.
    </p>
  </div>
</template>

<script setup lang="ts">
import * as stylex from "@stylexjs/stylex";
import { styles } from "./InvestigatePanel.styles";
import { ref, watch } from "vue";
import { runInvestigation, type ReportSummary } from "../api";
import { loadSettings, saveSettings } from "../settings";
import ReportView from "./ReportView.vue";

const props = defineProps<{ chain: string; address: string }>();

// One settings source: the panel field mirrors the Settings-menu key;
// model name and reasoning effort come from that same store.
const key = ref<string>(loadSettings().modelKey);
const running = ref(false);
const error = ref("");
const result = ref<ReportSummary | null>(null);

watch(key, (v) => saveSettings({ ...loadSettings(), modelKey: v }));
watch(
  () => props.address,
  () => {
    result.value = null;
    error.value = "";
  },
);

async function run(): Promise<void> {
  running.value = true;
  error.value = "";
  result.value = null;
  try {
    const s = loadSettings();
    result.value = await runInvestigation(
      props.chain,
      props.address,
      key.value.trim(),
      { model: s.model || undefined, effort: s.effort },
    );
  } catch (e) {
    error.value =
      e instanceof Error && e.message === "missing-model-key"
        ? "Add a Muse key to investigate."
        : "Investigation failed. Check the API and try again.";
  } finally {
    running.value = false;
  }
}
</script>
