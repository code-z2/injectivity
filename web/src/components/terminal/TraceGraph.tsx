import cytoscape, { type Core } from "cytoscape";
import { ExternalLink, Play } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { fetchTrace, type TraceDirection, type TraceResult } from "@/lib/api";
import { addressUrl, txUrl } from "@/lib/explorer";
import { short } from "@/lib/utils";
import {
  ErrorLine,
  linkCls,
  Panel,
  SectionLabel,
  selectCls,
  Status,
} from "./ui";

// Canvas colors mirror the brand tokens in styles.css (Cytoscape cannot
// read CSS variables). Root = Ion, verified = red, shared = amber.
const C = {
  ink: "#0b0d12",
  label: "#3b414b",
  node: "#c3c8d0",
  edge: "#d4d8df",
  verified: "#e5484d",
  inferred: "#c56a06",
  ion: "#2f5bff",
  ionHalo: "#c5d2ff",
};

interface Selected {
  kind: string;
  title: string;
  url: string;
  extra: string;
  color: string;
}

function depthLabel(d: number): string {
  return d === 0 ? "search root" : `hop ${d}`;
}

export function TraceGraph({
  chain,
  address,
}: {
  chain: string;
  address: string;
}) {
  const [direction, setDirection] = useState<TraceDirection>("both");
  const [depth, setDepth] = useState<1 | 2>(2);
  const [fanout, setFanout] = useState(25);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [meta, setMeta] = useState("");
  const [selected, setSelected] = useState<Selected | null>(null);
  const canvas = useRef<HTMLDivElement>(null);
  const cyRef = useRef<Core | null>(null);

  useEffect(() => {
    const cy = cytoscape({
      container: canvas.current,
      wheelSensitivity: 0.25,
      style: [
        {
          selector: "node",
          style: {
            label: "data(label)",
            color: C.label,
            "font-size": 9,
            "font-family": "Geist Mono Variable, ui-monospace, monospace",
            "text-margin-y": -4,
            "background-color": C.node,
            width: 12,
            height: 12,
          },
        },
        {
          selector: "node.verified",
          style: { "background-color": C.verified, width: 18, height: 18 },
        },
        {
          selector: "node.shared",
          style: { "background-color": C.inferred, width: 15, height: 15 },
        },
        {
          selector: "node.root",
          style: {
            "background-color": C.ion,
            "border-width": 5,
            "border-color": C.ionHalo,
            width: 22,
            height: 22,
            color: C.ink,
            "font-weight": 600,
          },
        },
        {
          selector: "node:selected",
          style: { "border-width": 3, "border-color": C.ink },
        },
        {
          selector: "edge",
          style: {
            width: 1,
            "line-color": C.edge,
            "target-arrow-shape": "triangle",
            "target-arrow-color": C.edge,
            "arrow-scale": 0.7,
            "curve-style": "bezier",
          },
        },
        {
          selector: "edge:selected",
          style: { "line-color": C.ion, "target-arrow-color": C.ion, width: 2 },
        },
      ],
    });
    cy.on("tap", "node", (e) => {
      const n = e.target;
      const addr: string = n.data("id");
      const labels: { list_name: string; role: string }[] = n.data("labels");
      setSelected({
        kind: n.hasClass("root")
          ? "root"
          : n.hasClass("verified")
            ? "verified"
            : n.hasClass("shared")
              ? "shared counterparty"
              : "address",
        title: addr,
        url: addressUrl(chain, addr),
        extra:
          labels.length > 0
            ? labels.map((l) => `${l.list_name}/${l.role}`).join(", ")
            : depthLabel(n.data("depth") as number),
        color: n.hasClass("verified")
          ? C.verified
          : n.hasClass("shared")
            ? C.inferred
            : C.ion,
      });
    });
    cy.on("tap", "edge", (e) => {
      const edge = e.target;
      setSelected({
        kind: "transfer",
        title: `${short(edge.data("from") as string)} → ${short(edge.data("to") as string)}`,
        url: txUrl(chain, edge.data("hash") as string),
        extra:
          `${(edge.data("asset") as string) || ""} ${(edge.data("value") as string) || ""}`.trim(),
        color: C.label,
      });
    });
    cy.on("tap", (e) => {
      if (e.target === cy) setSelected(null);
    });
    cyRef.current = cy;
    return () => {
      cy.destroy();
      cyRef.current = null;
    };
  }, [chain]);

  const render = useCallback((result: TraceResult, root: string) => {
    const cy = cyRef.current;
    if (!cy) return;
    const sharedIds = new Set(
      result.shared.map((s) => s.address.toLowerCase()),
    );
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
    setMeta(bits.join(" · "));
  }, []);

  const trace = useCallback(async () => {
    setLoading(true);
    setError("");
    setSelected(null);
    setMeta("");
    try {
      const root = address.toLowerCase();
      render(await fetchTrace(chain, address, direction, depth, fanout), root);
    } catch (e) {
      setError(
        e instanceof Error && e.message === "api-502"
          ? "Nothing cached to trace and no live key. Look up the address first or enable live."
          : "Trace failed. Is the API running?",
      );
    } finally {
      setLoading(false);
    }
  }, [chain, address, direction, depth, fanout, render]);

  // Auto-trace on mount and when the subject changes (controls wait for
  // the Trace button, as before).
  const traceRef = useRef(trace);
  traceRef.current = trace;
  useEffect(() => {
    void traceRef.current();
  }, [chain, address]);

  return (
    <Panel className="mt-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SectionLabel>Fund-flow mesh</SectionLabel>
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={direction}
            onChange={(e) => setDirection(e.target.value as TraceDirection)}
            aria-label="Direction"
            className={selectCls}
          >
            <option value="both">in + out</option>
            <option value="out">out</option>
            <option value="in">in</option>
          </select>
          <select
            value={depth}
            onChange={(e) => setDepth(Number(e.target.value) as 1 | 2)}
            aria-label="Depth"
            className={selectCls}
          >
            <option value={1}>depth 1</option>
            <option value={2}>depth 2</option>
          </select>
          <select
            value={fanout}
            onChange={(e) => setFanout(Number(e.target.value))}
            aria-label="Fanout"
            className={selectCls}
          >
            <option value={25}>fanout 25</option>
            <option value={50}>fanout 50</option>
            <option value={100}>fanout 100</option>
          </select>
          <button
            onClick={() => void trace()}
            disabled={loading}
            className="inline-flex h-8 items-center gap-1.5 rounded-full bg-ink px-3.5 text-[13px] font-medium text-white transition-colors hover:bg-ink-soft disabled:opacity-60"
          >
            <Play className="size-3 fill-current" />
            {loading ? "Tracing" : "Trace"}
          </button>
        </div>
      </div>

      <div
        ref={canvas}
        className="mt-4 h-[460px] rounded-2xl border border-line bg-[radial-gradient(circle,var(--color-line)_1px,transparent_1px)] bg-size-[18px_18px]"
      />

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <div className="space-y-1">
          {loading && <Status text="Tracing…" />}
          {error && <ErrorLine>{error}</ErrorLine>}
          {meta && <p className="text-[12.5px] text-muted">{meta}</p>}
        </div>
        <div className="flex items-center gap-3 text-[12px] text-muted">
          {[
            ["root", C.ion],
            ["verified", C.verified],
            ["shared", C.inferred],
            ["address", C.node],
          ].map(([k, c]) => (
            <span key={k} className="flex items-center gap-1.5">
              <span
                className="size-2 rounded-full"
                style={{ backgroundColor: c }}
              />
              {k}
            </span>
          ))}
        </div>
      </div>

      {selected && (
        <div className="mt-3 rounded-2xl border border-line px-4 py-3 text-[13px]">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className="rounded-full px-2 py-0.5 text-[11px] font-medium text-white"
              style={{ backgroundColor: selected.color }}
            >
              {selected.kind}
            </span>
            <span className="font-mono text-[12.5px] break-all text-ink">
              {selected.title}
            </span>
          </div>
          <p className="mt-1.5 text-muted">
            <a
              href={selected.url}
              target="_blank"
              rel="noreferrer"
              className={`${linkCls} inline-flex items-center gap-1`}
            >
              Open in explorer <ExternalLink className="size-3" />
            </a>
            {selected.extra && <span> · {selected.extra}</span>}
          </p>
        </div>
      )}
    </Panel>
  );
}
