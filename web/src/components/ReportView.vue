<template>
  <div v-bind="stylex.attrs(styles.box)">
    <p v-if="loading" v-bind="stylex.attrs(styles.status)">Loading report…</p>
    <p v-if="error" v-bind="stylex.attrs(styles.error)">{{ error }}</p>

    <template v-if="doc">
      <p v-bind="stylex.attrs(styles.summary)">{{ doc.report.summary }}</p>
      <div v-bind="stylex.attrs(styles.actions)">
        <a
          :href="pdfUrl"
          target="_blank"
          rel="noreferrer"
          v-bind="stylex.attrs(styles.link)"
          >Download PDF</a
        >
        <button v-bind="stylex.attrs(styles.button)" @click="save">
          {{ savedHere ? "Saved ✓" : "Save locally" }}
        </button>
      </div>

      <div
        v-for="(f, i) in doc.report.findings"
        :key="i"
        v-bind="stylex.attrs(styles.finding)"
      >
        <span
          v-bind="stylex.attrs(styles.tag)"
          :style="{ backgroundColor: tagColor(f.verdict), color: '#0a0e12' }"
          >{{ f.verdict }}</span
        >
        <span
          v-bind="stylex.attrs(styles.tag)"
          :style="{ backgroundColor: '#5b6773', color: '#fff' }"
          >{{ f.confidence }}</span
        >
        <p v-bind="stylex.attrs(styles.claim)">{{ f.claim }}</p>
        <p
          v-for="h in f.evidence.txHashes"
          :key="h"
          v-bind="stylex.attrs(styles.evidence)"
        >
          tx
          <a
            :href="txUrl(chain, h)"
            target="_blank"
            rel="noreferrer"
            v-bind="stylex.attrs(styles.link)"
            >{{ short(h) }}</a
          >
        </p>
        <p
          v-if="f.evidence.listRefs.length > 0"
          v-bind="stylex.attrs(styles.evidence)"
        >
          lists: {{ f.evidence.listRefs.join(", ") }}
        </p>
      </div>

      <p v-bind="stylex.attrs(styles.head)">Open questions</p>
      <ul v-bind="stylex.attrs(styles.list)">
        <li v-for="(u, i) in doc.report.uncertainty" :key="i">{{ u }}</li>
      </ul>

      <p v-bind="stylex.attrs(styles.head)">Next checks</p>
      <ul v-bind="stylex.attrs(styles.list)">
        <li v-for="(n, i) in doc.report.nextChecks" :key="i">{{ n }}</li>
      </ul>

      <template v-if="saved.length > 0">
        <p v-bind="stylex.attrs(styles.head)">Saved reports</p>
        <div
          v-for="s in saved"
          :key="s.id"
          v-bind="stylex.attrs(styles.savedRow)"
        >
          <a
            href="#"
            @click.prevent="load(s.id)"
            v-bind="stylex.attrs(styles.link)"
            >#{{ s.id }} {{ short(s.address) }}</a
          >
          <span>{{ s.chain }} · {{ s.savedAt }}</span>
        </div>
      </template>
    </template>
  </div>
</template>

<script setup lang="ts">
import * as stylex from "@stylexjs/stylex";
import { computed, onMounted, ref, watch } from "vue";
import { fetchReport, reportPdfUrl, type StoredReport } from "../api";
import { txUrl } from "../explorer";
import { styles } from "./ReportView.styles";

const props = defineProps<{ reportId: number; chain: string }>();

const SAVE_SLOT = "intel-terminal:saved-reports";
interface SavedEntry {
  id: number;
  address: string;
  chain: string;
  savedAt: string;
}

const loading = ref(false);
const error = ref("");
const doc = ref<StoredReport | null>(null);
const currentId = ref(props.reportId);
const saved = ref<SavedEntry[]>(readSaved());

function readSaved(): SavedEntry[] {
  try {
    return JSON.parse(localStorage.getItem(SAVE_SLOT) ?? "[]") as SavedEntry[];
  } catch {
    return [];
  }
}

const pdfUrl = computed(() => reportPdfUrl(currentId.value));
const savedHere = computed(() =>
  saved.value.some((s) => s.id === currentId.value),
);

function tagColor(verdict: string): string {
  return verdict === "verified" ? "#f04438" : "#f0b429";
}

function short(v: string): string {
  return v.length > 18 ? `${v.slice(0, 8)}..${v.slice(-6)}` : v;
}

async function load(id: number): Promise<void> {
  currentId.value = id;
  loading.value = true;
  error.value = "";
  doc.value = null;
  try {
    doc.value = await fetchReport(id);
  } catch {
    error.value = "Could not load that report.";
  } finally {
    loading.value = false;
  }
}

function save(): void {
  if (!doc.value || savedHere.value) return;
  const entry: SavedEntry = {
    id: currentId.value,
    address: doc.value.address ?? props.chain,
    chain: doc.value.chain ?? props.chain,
    savedAt: new Date().toISOString().slice(0, 10),
  };
  saved.value = [entry, ...saved.value].slice(0, 50);
  localStorage.setItem(SAVE_SLOT, JSON.stringify(saved.value));
}

onMounted(() => {
  void load(currentId.value);
});
watch(
  () => props.reportId,
  (id) => {
    void load(id);
  },
);
</script>
