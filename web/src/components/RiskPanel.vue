<template>
  <div v-bind="stylex.attrs(styles.box)">
    <h2 v-bind="stylex.attrs(styles.title)">Risk assessment</h2>

    <div
      v-if="verified.length > 0"
      v-bind="stylex.attrs([styles.section, styles.verifiedBox])"
    >
      <p v-bind="stylex.attrs([styles.head, styles.headVerified])">
        Verified — {{ verified.length }}
      </p>
      <p
        v-for="m in verified"
        :key="`${m.list_name}/${m.role}`"
        v-bind="stylex.attrs(styles.match)"
      >
        {{ m.list_name }} / {{ m.role }} — {{ m.label }}
        <span v-bind="stylex.attrs(styles.sub)">({{ m.version }})</span>
      </p>
    </div>

    <div
      v-if="inferred.length > 0"
      v-bind="stylex.attrs([styles.section, styles.inferredBox])"
    >
      <p v-bind="stylex.attrs([styles.head, styles.headInferred])">
        Inferred association — {{ inferred.length }}
      </p>
      <p
        v-for="m in inferred"
        :key="`${m.list_name}/${m.role}/${m.via}`"
        v-bind="stylex.attrs(styles.match)"
      >
        {{ m.list_name }} / {{ m.role }}
        <span v-bind="stylex.attrs(styles.sub)">via {{ short(m.via) }}</span>
      </p>
      <p v-bind="stylex.attrs(styles.disclaimer)">
        One hop from a flagged address. Association is not wrongdoing.
      </p>
    </div>

    <div
      v-if="verified.length === 0 && inferred.length === 0"
      v-bind="stylex.attrs([styles.section, styles.cleanBox])"
    >
      <p v-bind="stylex.attrs([styles.head, styles.headClean])">
        No risk matches
      </p>
      <p v-bind="stylex.attrs(styles.match)">
        Screened {{ screened }} counterparties, nothing flagged.
      </p>
    </div>
  </div>
</template>

<script setup lang="ts">
import * as stylex from "@stylexjs/stylex";
import { computed } from "vue";
import type { RiskMatch } from "../api";
import { styles } from "./RiskPanel.styles";

const props = defineProps<{ matches: RiskMatch[]; screened: number }>();

const verified = computed(() =>
  props.matches.filter((m) => m.match_type === "exact"),
);
const inferred = computed(() =>
  props.matches.filter((m) => m.match_type !== "exact"),
);

function short(v: string | null): string {
  if (!v) return "unknown";
  return v.length > 14 ? `${v.slice(0, 6)}..${v.slice(-4)}` : v;
}
</script>
