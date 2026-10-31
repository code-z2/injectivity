<template>
  <span v-bind="stylex.attrs(styles.badge, tone)">
    <span v-bind="stylex.attrs(styles.dot, tone)" />
    {{ text }}
  </span>
</template>

<script setup lang="ts">
import * as stylex from "@stylexjs/stylex";
import { styles } from "./RiskBadge.styles";
import { computed } from "vue";

const props = defineProps<{ level: "verified" | "inferred" | "none" }>();

const text = computed(() =>
  props.level === "verified"
    ? "Verified threat"
    : props.level === "inferred"
      ? "Inferred link"
      : "No flags",
);

const tone = computed(() =>
  props.level === "verified"
    ? styles.verified
    : props.level === "inferred"
      ? styles.inferred
      : styles.clean,
);
</script>
