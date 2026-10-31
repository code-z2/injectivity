<template>
  <div v-bind="stylex.attrs(styles.box)">
    <div v-bind="stylex.attrs(styles.head)">
      <h2 v-bind="stylex.attrs(styles.title)">Fund-flow mesh</h2>
      <div v-bind="stylex.attrs(styles.controls)">
        <select
          v-model="direction"
          v-bind="stylex.attrs(styles.select)"
          aria-label="Direction"
        >
          <option value="both">in + out</option>
          <option value="out">out</option>
          <option value="in">in</option>
        </select>
        <select
          v-model.number="depth"
          v-bind="stylex.attrs(styles.select)"
          aria-label="Depth"
        >
          <option :value="1">depth 1</option>
          <option :value="2">depth 2</option>
        </select>
        <select
          v-model.number="fanout"
          v-bind="stylex.attrs(styles.select)"
          aria-label="Fanout"
        >
          <option :value="25">fanout 25</option>
          <option :value="50">fanout 50</option>
          <option :value="100">fanout 100</option>
        </select>
        <button
          v-bind="stylex.attrs(styles.button)"
          :disabled="loading"
          @click="trace"
        >
          {{ loading ? "…" : "Trace" }}
        </button>
      </div>
    </div>

    <div ref="canvas" v-bind="stylex.attrs(styles.canvas)"></div>

    <p v-if="loading" v-bind="stylex.attrs(styles.status)">Tracing…</p>
    <p v-if="error" v-bind="stylex.attrs(styles.error)">{{ error }}</p>
    <p v-if="meta" v-bind="stylex.attrs(styles.meta)">{{ meta }}</p>

    <div v-if="selected" v-bind="stylex.attrs(styles.detail)">
      <span
        v-bind="stylex.attrs(styles.tag)"
        :style="{ backgroundColor: selected.color, color: '#0a0e12' }"
        >{{ selected.kind }}</span
      >
      <span v-bind="stylex.attrs()">{{ selected.title }}</span>
      <br />
      <a
        :href="selected.url"
        target="_blank"
        rel="noreferrer"
        v-bind="stylex.attrs(styles.link)"
        >Open in explorer</a
      >
      <span v-if="selected.extra"> · {{ selected.extra }}</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import * as stylex from "@stylexjs/stylex";
import cytoscape, { type Core } from "cytoscape";
import { onBeforeUnmount, onMounted, ref, watch } from "vue";
import { fetchTrace, type TraceDirection, type TraceResult } from "../api";
import { addressUrl, txUrl } from "../explorer";
import { styles } from "./TraceGraph.styles";

const props = defineProps<{ chain: string; address: string }>();

const direction = ref<TraceDirection>("both");
const depth = ref<1 | 2>(2);
const fanout = ref(25);
const loading = ref(false);
const error = ref("");
const meta = ref("");
const selected = ref<{
  kind: string;
  title: string;
  url: string;
  extra: string;
  color: string;
} | null>(null);

const canvas = ref<HTMLElement | null>(null);
let cy: Core | null = null;

function cssVar(name: string, fallback: string): string {
  const v = getComputedStyle(document.documentElement)
    .getPropertyValue(name)
    .trim();
  return v || fallback;
}

function short(a: string): string {
  return a.length > 14 ? `${a.slice(0, 6)}..${a.slice(-4)}` : a;
}

function mountCy(): void {
  if (!canvas.value) return;
  const text = cssVar("--text", "#e6edf3");
  const faint = cssVar("--faint", "#5b6773");
  const verified = cssVar("--verified", "#f04438");
  const inferred = cssVar("--inferred", "#f0b429");
  const accent = cssVar("--accent", "#e8c15a");
  cy = cytoscape({
    container: canvas.value,
    style: [
      {
        selector: "node",
        style: {
          label: "data(label)",
          color: text,
          "font-size": 9,
          "font-family": "monospace",
          "background-color": faint,
          width: 14,
          height: 14,
        },
      },
      {
        selector: "node.verified",
        style: { "background-color": verified, width: 20, height: 20 },
      },
      {
        selector: "node.shared",
        style: { "background-color": inferred, width: 17, height: 17 },
      },
      {
        selector: "node.root",
        style: {
          "background-color": accent,
          "border-width": 2,
          "border-color": text,
          width: 22,
          height: 22,
        },
      },
      {
        selector: "edge",
        style: {
          width: 1,
          "line-color": faint,
          "target-arrow-shape": "triangle",
          "target-arrow-color": faint,
          "curve-style": "bezier",
        },
      },
    ],
  });
  cy.on("tap", "node", (e) => {
    const n = e.target;
    const addr: string = n.data("id");
    const labels: { list_name: string; role: string }[] = n.data("labels");
    selected.value = {
      kind: n.hasClass("root")
        ? "root"
        : n.hasClass("verified")
          ? "verified"
          : n.hasClass("shared")
            ? "shared counterparty"
            : "address",
      title: addr,
      url: addressUrl(props.chain, addr),
      extra:
        labels.length > 0
          ? labels.map((l) => `${l.list_name}/${l.role}`).join(", ")
          : depthLabel(n.data("depth") as number),
      color: n.hasClass("verified")
        ? verified
        : n.hasClass("shared")
          ? inferred
          : accent,
    };
  });
  cy.on("tap", "edge", (e) => {
    const edge = e.target;
    const hash: string = edge.data("hash");
    selected.value = {
      kind: "transfer",
      title: `${short(edge.data("from") as string)} → ${short(edge.data("to") as string)}`,
      url: txUrl(props.chain, hash),
      extra:
        `${(edge.data("asset") as string) || ""} ${(edge.data("value") as string) || ""}`.trim(),
      color: faint,
    };
  });
  cy.on("tap", (e) => {
    if (e.target === cy) selected.value = null;
  });
}

function depthLabel(d: number): string {
  return d === 0 ? "search root" : `hop ${d}`;
}

function renderGraph(result: TraceResult, root: string): void {
  if (!cy) return;
  const sharedIds = new Set(result.shared.map((s) => s.address.toLowerCase()));
  cy.elements().remove();
  cy.add(
    result.nodes.map((n) => {
      const id = n.address.toLowerCase();
      const cls = [id === root ? "root" : ""];
      if (n.labels.length > 0) cls.push("verified");
      else if (sharedIds.has(id) && id !== root) cls.push("shared");
      return {
        data: { id, label: short(id), depth: n.depth, labels: n.labels },
        classes: cls.filter(Boolean).join(" "),
      };
    }),
  );
  cy.add(
    result.edges.map((e, i) => ({
      data: {
        id: `e${i}`,
        source: e.from.toLowerCase(),
        target: e.to.toLowerCase(),
        hash: e.hash,
        from: e.from.toLowerCase(),
        to: e.to.toLowerCase(),
        asset: e.asset,
        value: e.value,
      },
    })),
  );
  cy.layout({
    name: "breadthfirst",
    roots: [root],
    directed: true,
    spacingFactor: 1.25,
    padding: 24,
    animate: false,
  }).run();
  const bits = [
    `${result.nodes.length} nodes`,
    `${result.edges.length} edges`,
    result.live ? "live" : "cached",
  ];
  if (result.pathsTruncated) bits.push("paths truncated at 500/side");
  meta.value = bits.join(" · ");
}

async function trace(): Promise<void> {
  loading.value = true;
  error.value = "";
  selected.value = null;
  meta.value = "";
  try {
    const root = props.address.toLowerCase();
    const result = await fetchTrace(
      props.chain,
      props.address,
      direction.value,
      depth.value,
      fanout.value,
    );
    renderGraph(result, root);
  } catch (e) {
    error.value =
      e instanceof Error && e.message === "api-502"
        ? "Nothing cached to trace and no live key. Look up the address first or enable live."
        : "Trace failed. Is the API running?";
  } finally {
    loading.value = false;
  }
}

onMounted(() => {
  mountCy();
  void trace();
});

onBeforeUnmount(() => {
  cy?.destroy();
  cy = null;
});

watch(
  () => [props.chain, props.address],
  () => {
    void trace();
  },
);
</script>
