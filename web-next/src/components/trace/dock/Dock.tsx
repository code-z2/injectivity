import { ChevronUp, Maximize2, Minimize2, RotateCw, X } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { KnownLabel } from "@/lib/api";
import { cn, short } from "@/lib/utils";
import { RoleDot } from "../AddressCard";
import { TokenIcon } from "../TokenIcon";
import { nameFromLabel, roleFromLabel } from "../types";
import type { Counterparty, LedgerRow, LedgerStatus } from "../useLedger";
import { FilterChip, Option } from "./FilterChip";
import {
  activeCount,
  applyFilters,
  NO_FILTERS,
  tokenKey,
  type Filters,
  type Range,
  type RoleFilter,
  type Sort,
} from "./filters";
import { LedgerRowView } from "./LedgerRowView";
import { SpoofTag } from "./SpoofTag";
import { spoofOf } from "./spoof";

// The bottom dock: the active address's ledger, every transfer in and out.
// It floats at the bottom centre at macOS-dock width, leaving room for the
// address chain (left) and the AI dock (right). Three detents: collapsed
// (header strip with counts, All/In/Out and any active filters), half,
// and full (covers the canvas and slides under the address chain). Drag
// the header to resize; it snaps to the nearest detent. Filters are chips
// that open small popovers. Rows are windowed, so long ledgers stay light,
// and more pages load as you near the end.

type Detent = "collapsed" | "half" | "full";

const RAIL_W = 340; // address chain column
const SIDE_ROOM = 360; // keep clear on both sides (chain left, AI dock right)
const MAX_W = 880;
const MIN_W = 600; // narrowest dock that still fits a full row
const GAP = 12;
const ROW_H = 52;
const HEADER_H = 60;
const CHIPS_H = 44;
const EASE = [0.22, 1, 0.36, 1] as const;

function useViewport() {
  const [v, setV] = useState(() => ({ w: innerWidth, h: innerHeight }));
  useEffect(() => {
    const on = () => setV({ w: innerWidth, h: innerHeight });
    addEventListener("resize", on);
    return () => removeEventListener("resize", on);
  }, []);
  return v;
}

export function Dock({
  chain,
  address,
  rows,
  counterparties,
  labels,
  status,
  error,
  onLoadMore,
  onRetry,
  onHoverCounterparty,
}: {
  chain: string;
  /** The active address; filters reset when it changes. */
  address: string;
  rows: LedgerRow[];
  counterparties: Counterparty[];
  labels: Record<string, KnownLabel>;
  status: LedgerStatus;
  error: string;
  onLoadMore: () => void;
  onRetry: () => void;
  onHoverCounterparty: (address: string | null) => void;
}) {
  const reduce = useReducedMotion();
  const { w: vw, h: vh } = useViewport();
  const [detent, setDetent] = useState<Detent>("half");
  const [dragH, setDragH] = useState<number | null>(null);
  const [f, setF] = useState<Filters>(NO_FILTERS);
  const set = (patch: Partial<Filters>) => setF((x) => ({ ...x, ...patch }));
  useEffect(() => setF(NO_FILTERS), [address]);

  const shown = useMemo(() => applyFilters(rows, f, labels), [rows, f, labels]);
  const active = activeCount(f);
  const showChips = detent !== "collapsed" || active > 0;

  const collapsedH = HEADER_H + (active > 0 ? CHIPS_H : 0);
  const heights: Record<Detent, number> = {
    collapsed: collapsedH,
    half: Math.max(collapsedH + 160, Math.round(vh * 0.46)),
    full: vh - GAP * 2,
  };
  const full = detent === "full";
  // Between the side columns on wide screens; edge to edge when there is
  // not room for a comfortable row (the chain then sits above it).
  const between = Math.min(MAX_W, vw - SIDE_ROOM * 2 - 48);
  const dockW = between >= MIN_W ? between : vw - GAP * 2;
  const width = full ? vw - GAP * 2 : dockW;
  const height = dragH ?? heights[detent];
  const padLeft = full && vw > RAIL_W + 520 ? RAIL_W - GAP : 0;

  // Drag the header to resize; release snaps to the nearest detent.
  const drag = useRef<{ y: number; h: number } | null>(null);
  function onPointerDown(e: React.PointerEvent) {
    if ((e.target as HTMLElement).closest("button")) return;
    drag.current = { y: e.clientY, h: height };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }
  function onPointerMove(e: React.PointerEvent) {
    if (!drag.current) return;
    const h = drag.current.h + (drag.current.y - e.clientY);
    setDragH(Math.min(heights.full, Math.max(heights.collapsed, h)));
  }
  function onPointerUp() {
    if (!drag.current) return;
    drag.current = null;
    if (dragH !== null) {
      const near = (Object.keys(heights) as Detent[]).reduce((a, b) =>
        Math.abs(heights[b] - dragH) < Math.abs(heights[a] - dragH) ? b : a,
      );
      setDetent(near);
    }
    setDragH(null);
  }

  return (
    <motion.section
      aria-label="Transfers"
      className="@container absolute bottom-3 left-1/2 z-10 flex flex-col overflow-hidden rounded-[22px] border border-white bg-white/80 shadow-console backdrop-blur-xl"
      initial={false}
      animate={{ width, height, x: "-50%", paddingLeft: padLeft }}
      transition={
        dragH !== null || reduce
          ? { duration: 0 }
          : { duration: 0.5, ease: EASE }
      }
    >
      <header
        className="relative flex shrink-0 cursor-grab touch-none items-center gap-3 px-4 select-none active:cursor-grabbing"
        style={{ height: HEADER_H }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onDoubleClick={() => setDetent(full ? "half" : "full")}
      >
        <span
          aria-hidden
          className="absolute top-1.5 left-1/2 h-1 w-9 -translate-x-1/2 rounded-full bg-ink/10"
        />
        <div className="min-w-0 flex-1">
          <h2 className="text-[13.5px] font-medium text-ink">Transfers</h2>
          <p className="truncate text-[11.5px] text-faint tabular-nums">
            {summary(
              rows.length,
              shown.length,
              counterparties.length,
              status,
              active > 0 || f.dir !== "all",
            )}
          </p>
        </div>
        <Segmented value={f.dir} onChange={(dir) => set({ dir })} />
        <div className="flex items-center">
          <IconButton
            label={detent === "collapsed" ? "Expand" : "Collapse"}
            onClick={() =>
              setDetent(detent === "collapsed" ? "half" : "collapsed")
            }
          >
            <ChevronUp
              className={cn(
                "size-4 transition-transform duration-300",
                detent !== "collapsed" && "rotate-180",
              )}
            />
          </IconButton>
          <IconButton
            label={full ? "Exit full screen" : "Full screen"}
            onClick={() => setDetent(full ? "half" : "full")}
          >
            {full ? (
              <Minimize2 className="size-3.5" />
            ) : (
              <Maximize2 className="size-3.5" />
            )}
          </IconButton>
        </div>
      </header>

      {showChips && (
        <div
          className="flex shrink-0 items-center gap-1.5 overflow-x-auto px-4 pb-3"
          style={{ height: CHIPS_H }}
        >
          <Chips
            f={f}
            set={set}
            rows={rows}
            counterparties={counterparties}
            labels={labels}
            chain={chain}
            onlyActive={detent === "collapsed"}
          />
          {active > 0 && (
            <button
              onClick={() =>
                setF((x) => ({ ...NO_FILTERS, dir: x.dir, sort: x.sort }))
              }
              className="flex h-7 shrink-0 items-center gap-1 rounded-full px-2 text-[12px] text-muted hover:text-ink"
            >
              <X className="size-3" />
              Clear
            </button>
          )}
        </div>
      )}

      {detent !== "collapsed" && (
        <List
          rows={shown}
          chain={chain}
          labels={labels}
          status={status}
          error={error}
          loaded={rows.length}
          onLoadMore={onLoadMore}
          onRetry={onRetry}
          onHover={onHoverCounterparty}
          autoLoad={active === 0 && f.dir === "all"}
        />
      )}
    </motion.section>
  );
}

function summary(
  loaded: number,
  shown: number,
  cps: number,
  status: LedgerStatus,
  filtered: boolean,
): string {
  if (status === "loading") return "Loading transfers…";
  if (status === "error" && loaded === 0) return "Couldn't load transfers";
  const more = status === "done" ? "" : "+";
  const n = (x: number) => x.toLocaleString("en-US");
  const total = `${n(loaded)}${more} transfers`;
  const head = filtered ? `${n(shown)} of ${total}` : total;
  return `${head} · ${n(cps)} counterparties`;
}

function Segmented({
  value,
  onChange,
}: {
  value: Filters["dir"];
  onChange: (v: Filters["dir"]) => void;
}) {
  const opts = [
    ["all", "All"],
    ["in", "In"],
    ["out", "Out"],
  ] as const;
  return (
    <div className="flex rounded-full bg-ink/[0.05] p-0.5">
      {opts.map(([v, label]) => (
        <button
          key={v}
          onClick={() => onChange(v)}
          aria-pressed={value === v}
          className={cn(
            "relative h-7 rounded-full px-3 text-[12px] font-medium transition-colors duration-200",
            value === v ? "text-ink" : "text-muted hover:text-ink-soft",
          )}
        >
          {value === v && (
            <motion.span
              layoutId="dock-dir-pill"
              className="absolute inset-0 rounded-full bg-surface shadow-hairline"
              transition={{ duration: 0.25, ease: EASE }}
            />
          )}
          <span className="relative">{label}</span>
        </button>
      ))}
    </div>
  );
}

function IconButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      aria-label={label}
      title={label}
      onClick={onClick}
      className="flex size-8 items-center justify-center rounded-full text-faint transition-colors hover:bg-ink/5 hover:text-ink"
    >
      {children}
    </button>
  );
}

const RANGES: [Range, string][] = [
  ["all", "All time"],
  ["24h", "Last 24h"],
  ["7d", "Last 7 days"],
  ["30d", "Last 30 days"],
];
const ROLES: [RoleFilter, string][] = [
  ["attacker", "Exploiter"],
  ["victim", "Victim"],
  ["labelled", "Labelled"],
  ["unlabelled", "Unlabelled"],
];
const SORTS: [Sort, string][] = [
  ["newest", "Newest"],
  ["oldest", "Oldest"],
  ["amount", "Amount"],
  ["token", "Token"],
];

function Chips({
  f,
  set,
  rows,
  counterparties,
  labels,
  chain,
  onlyActive,
}: {
  f: Filters;
  set: (p: Partial<Filters>) => void;
  rows: LedgerRow[];
  counterparties: Counterparty[];
  labels: Record<string, KnownLabel>;
  chain: string;
  onlyActive: boolean;
}) {
  const tokens = useMemo(() => {
    const m = new Map<
      string,
      { key: string; asset: string; contract: string | null; n: number }
    >();
    for (const r of rows) {
      const k = tokenKey(r);
      const t = m.get(k) ?? {
        key: k,
        asset: r.asset,
        contract: r.contract,
        n: 0,
      };
      t.n++;
      m.set(k, t);
    }
    return [...m.values()].sort((a, b) => b.n - a.n);
  }, [rows]);
  const toggle = <T,>(list: T[], v: T) =>
    list.includes(v) ? list.filter((x) => x !== v) : [...list, v];
  const [minText, setMinText] = useState(f.min?.toString() ?? "");
  useEffect(() => setMinText(f.min?.toString() ?? ""), [f.min]);
  const show = (on: boolean) => !onlyActive || on;
  const tokenValue =
    f.tokens.length === 1
      ? tokens.find((t) => t.key === f.tokens[0])?.asset
      : f.tokens.length
        ? `${f.tokens.length}`
        : undefined;

  return (
    <>
      {show(f.range !== "all") && (
        <FilterChip
          label="Time"
          value={
            f.range !== "all"
              ? RANGES.find((r) => r[0] === f.range)?.[1]
              : undefined
          }
          active={f.range !== "all"}
        >
          {RANGES.map(([v, label]) => (
            <Option
              key={v}
              selected={f.range === v}
              onSelect={() => set({ range: v })}
            >
              {label}
            </Option>
          ))}
        </FilterChip>
      )}
      {show(f.tokens.length > 0) && (
        <FilterChip
          label="Token"
          value={tokenValue}
          active={f.tokens.length > 0}
        >
          {tokens.length === 0 && <Empty>No tokens yet</Empty>}
          {tokens.map((t) => (
            <Option
              key={t.key}
              selected={f.tokens.includes(t.key)}
              onSelect={() => set({ tokens: toggle(f.tokens, t.key) })}
            >
              <TokenIcon
                chain={chain}
                contract={t.contract}
                direction="in"
                className="size-4"
              />
              <span className="truncate">{t.asset}</span>
              {spoofOf(t.asset) && <SpoofTag imitates={spoofOf(t.asset)!} />}
              <span className="ml-auto text-[11.5px] text-faint tabular-nums">
                {t.n}
              </span>
            </Option>
          ))}
        </FilterChip>
      )}
      {show(f.roles.length > 0) && (
        <FilterChip
          label="Role"
          value={
            f.roles.length === 1
              ? ROLES.find((r) => r[0] === f.roles[0])?.[1]
              : f.roles.length
                ? `${f.roles.length}`
                : undefined
          }
          active={f.roles.length > 0}
        >
          {ROLES.map(([v, label]) => (
            <Option
              key={v}
              selected={f.roles.includes(v)}
              onSelect={() => set({ roles: toggle(f.roles, v) })}
            >
              {(v === "attacker" || v === "victim") && <RoleDot role={v} />}
              {label}
            </Option>
          ))}
        </FilterChip>
      )}
      {show(Boolean(f.counterparty)) && (
        <FilterChip
          label="Counterparty"
          value={f.counterparty ? short(f.counterparty) : undefined}
          active={Boolean(f.counterparty)}
        >
          {counterparties.length === 0 && <Empty>No counterparties yet</Empty>}
          {counterparties.slice(0, 60).map((c) => {
            const l = labels[c.address];
            return (
              <Option
                key={c.address}
                selected={f.counterparty === c.address}
                onSelect={() =>
                  set({
                    counterparty:
                      f.counterparty === c.address ? null : c.address,
                  })
                }
              >
                <RoleDot role={roleFromLabel(l)} />
                <span className="font-mono text-[12px]">
                  {short(c.address)}
                </span>
                <span className="truncate text-[12px] text-muted">
                  {nameFromLabel(l)}
                </span>
                <span className="ml-auto text-[11.5px] text-faint tabular-nums">
                  {c.inCount + c.outCount}
                </span>
              </Option>
            );
          })}
        </FilterChip>
      )}
      {show(f.min !== null) && (
        <FilterChip
          label="Min amount"
          value={f.min !== null ? `≥ ${f.min}` : undefined}
          active={f.min !== null}
        >
          <form
            className="flex items-center gap-2 p-1.5"
            onSubmit={(e) => {
              e.preventDefault();
              const n = Number(minText);
              set({ min: minText.trim() && Number.isFinite(n) ? n : null });
            }}
          >
            <input
              value={minText}
              onChange={(e) => setMinText(e.target.value)}
              inputMode="decimal"
              placeholder="e.g. 1000"
              className="h-8 w-32 rounded-lg border border-line bg-surface px-2.5 text-[13px] outline-none focus:border-ion-400"
            />
            <button className="h-8 rounded-lg bg-ink px-3 text-[12.5px] font-medium text-white">
              Apply
            </button>
          </form>
        </FilterChip>
      )}
      {show(f.sort !== "newest") && (
        <FilterChip
          label="Sort"
          value={SORTS.find((s) => s[0] === f.sort)?.[1]}
          active={f.sort !== "newest"}
        >
          {SORTS.map(([v, label]) => (
            <Option
              key={v}
              selected={f.sort === v}
              onSelect={() => set({ sort: v })}
            >
              {label}
            </Option>
          ))}
        </FilterChip>
      )}
    </>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="px-2.5 py-2 text-[12.5px] text-faint">{children}</p>;
}

function List({
  rows,
  chain,
  labels,
  status,
  error,
  loaded,
  onLoadMore,
  onRetry,
  onHover,
  autoLoad,
}: {
  rows: LedgerRow[];
  chain: string;
  labels: Record<string, KnownLabel>;
  status: LedgerStatus;
  error: string;
  loaded: number;
  onLoadMore: () => void;
  onRetry: () => void;
  onHover: (a: string | null) => void;
  /** Load the next page on scrolling near the end. Off while filtered, so
   * a narrow filter can't page through an entire history on its own. */
  autoLoad: boolean;
}) {
  // Callback ref: the scroller mounts only after the first page arrives.
  const [el, setEl] = useState<HTMLDivElement | null>(null);
  const [top, setTop] = useState(0);
  const [h, setH] = useState(400);

  useEffect(() => {
    if (!el) return;
    const ro = new ResizeObserver(() => setH(el.clientHeight));
    ro.observe(el);
    return () => ro.disconnect();
  }, [el]);

  // Near the end of an unfiltered list: load on.
  useEffect(() => {
    const end = rows.length * ROW_H;
    if (autoLoad && status === "ready" && top + h > end - ROW_H * 6)
      onLoadMore();
  }, [autoLoad, top, h, rows.length, status, onLoadMore]);

  if (status === "loading") return <Skeleton />;
  if (status === "error" && loaded === 0) {
    return (
      <Notice
        text="Couldn't load transfers."
        detail={error}
        onRetry={onRetry}
      />
    );
  }

  const first = Math.max(0, Math.floor(top / ROW_H) - 6);
  const last = Math.min(rows.length, Math.ceil((top + h) / ROW_H) + 6);

  return (
    <div
      ref={setEl}
      onScroll={(e) => setTop(e.currentTarget.scrollTop)}
      className="relative min-h-0 flex-1 overflow-y-auto px-1.5 pb-2"
    >
      {rows.length === 0 && status === "done" ? (
        <Notice text="No transfers match these filters." />
      ) : (
        <div className="relative" style={{ height: rows.length * ROW_H }}>
          {rows.slice(first, last).map((r, k) => (
            <LedgerRowView
              key={r.id}
              row={r}
              chain={chain}
              label={labels[r.counterparty]}
              onHover={onHover}
              style={{ top: (first + k) * ROW_H }}
            />
          ))}
        </div>
      )}
      <Footer
        status={status}
        onLoadMore={onLoadMore}
        onRetry={onRetry}
        loaded={loaded}
      />
    </div>
  );
}

function Footer({
  status,
  loaded,
  onLoadMore,
  onRetry,
}: {
  status: LedgerStatus;
  loaded: number;
  onLoadMore: () => void;
  onRetry: () => void;
}) {
  const base =
    "flex h-11 items-center justify-center gap-2 text-[12px] text-faint";
  if (status === "more")
    return <p className={cn(base, "t-shimmer")}>Loading more…</p>;
  if (status === "ready")
    return (
      <div className={base}>
        <button
          onClick={onLoadMore}
          className="rounded-full px-3 py-1 hover:bg-ink/5 hover:text-ink"
        >
          Load more
        </button>
      </div>
    );
  if (status === "error")
    return (
      <div className={base}>
        Couldn't load more.
        <button
          onClick={onRetry}
          className="flex items-center gap-1 rounded-full px-2 py-1 text-ink-soft hover:bg-ink/5"
        >
          <RotateCw className="size-3" /> Retry
        </button>
      </div>
    );
  return (
    <p className={base}>
      All {loaded.toLocaleString("en-US")} transfers loaded
    </p>
  );
}

function Skeleton() {
  return (
    <div className="flex-1 space-y-1 overflow-hidden px-4 pt-1">
      {Array.from({ length: 6 }, (_, i) => (
        <div
          key={i}
          className="flex h-[44px] items-center gap-3"
          style={{ opacity: 1 - i * 0.14 }}
        >
          <span className="size-7 animate-pulse rounded-full bg-ink/[0.06]" />
          <span className="h-3 w-40 animate-pulse rounded-full bg-ink/[0.06]" />
          <span className="ml-auto h-3 w-24 animate-pulse rounded-full bg-ink/[0.06]" />
        </div>
      ))}
    </div>
  );
}

function Notice({
  text,
  detail,
  onRetry,
}: {
  text: string;
  detail?: string;
  onRetry?: () => void;
}) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-1 py-10 text-center">
      <p className="text-[13px] text-ink-soft">{text}</p>
      {detail && <p className="font-mono text-[11px] text-faint">{detail}</p>}
      {onRetry && (
        <button
          onClick={onRetry}
          className="mt-2 flex items-center gap-1.5 rounded-full bg-ink px-3 py-1.5 text-[12px] font-medium text-white"
        >
          <RotateCw className="size-3" /> Retry
        </button>
      )}
    </div>
  );
}
