import { Link } from "@tanstack/react-router";
import {
  ArrowLeft,
  ArrowUpRight,
  Check,
  Download,
  Flag,
  Link2,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Answer, type OnPreview } from "@/components/trace/agent/Answer";
import { type Reveal, SideCard } from "@/components/trace/agent/SideCard";
import { SourcePreview } from "@/components/trace/agent/SourcePreview";
import type { Source } from "@/lib/agent";
import { CHAIN_META } from "@/lib/chains";
import type { Chain } from "@/lib/api";
import { addressUrl } from "@/lib/explorer";
import {
  fetchReport,
  loadMarks,
  markWrong,
  type Report,
  ReportError,
  reportPdfUrl,
  saveMarks,
} from "@/lib/reports";
import { cn, short } from "@/lib/utils";

// The report page: a generated post-mortem as a reading page. One centred
// column on the dotted canvas, section rail on the left, citation previews
// in a side card beside the column; clicking a chip jumps to its source.
// Any sentence can be marked wrong, which retracts what memory learned
// from it. Opens only where the report was generated; the PDF is
// shareable.

const SECTIONS = [
  ["summary", "Summary"],
  ["timeline", "Timeline"],
  ["how", "How it happened"],
  ["flow", "Where the money went"],
  ["actors", "Actors"],
  ["impact", "Impact"],
  ["assumptions", "Assumptions"],
  ["method", "Method and coverage"],
  ["sources", "Sources"],
] as const;

const COLUMN = 680;
const SPLIT = /(?<=[.!?](?:\s*\[[^\]]+\])*)\s+(?=[A-Z0-9"(])/;
const plain = (s: string) =>
  s.replace(/\s*\[(?:S?\d+)(?:\s*,\s*S?\d+)*\]/g, "").trim();

export function ReportPage({ reportKey }: { reportKey: string }) {
  const [report, setReport] = useState<Report | null>(null);
  const [error, setError] = useState<number | null>(null);

  useEffect(() => {
    let live = true;
    fetchReport(reportKey)
      .then((r) => live && setReport(r))
      .catch(
        (e) => live && setError(e instanceof ReportError ? e.status : 500),
      );
    return () => {
      live = false;
    };
  }, [reportKey]);

  return (
    <main className="relative min-h-svh w-full bg-canvas">
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0"
        style={{
          backgroundImage:
            "radial-gradient(var(--color-dot) 1px, transparent 1px)",
          backgroundSize: "18px 18px",
        }}
      />
      {report ? (
        <ReportView report={report} reportKey={reportKey} />
      ) : (
        <Gate error={error} reportKey={reportKey} />
      )}
    </main>
  );
}

function Gate({
  error,
  reportKey,
}: {
  error: number | null;
  reportKey: string;
}) {
  return (
    <div className="relative mx-auto flex min-h-svh max-w-md flex-col items-center justify-center px-6 text-center">
      {error === null ? (
        <p className="text-shimmer text-[14px]">Opening the report…</p>
      ) : error === 403 ? (
        <>
          <p className="text-[15px] font-medium text-ink">
            This report opens only where it was generated
          </p>
          <p className="mt-2 text-[13px] leading-6 text-muted">
            Reports stay private to the browser that created them. The PDF can
            be shared.
          </p>
          <a
            className="mt-5 flex h-9 items-center gap-2 rounded-full bg-ink px-4 text-[13px] font-medium text-on-ink hover:bg-ink-soft"
            href={reportPdfUrl(reportKey)}
            rel="noopener noreferrer"
            target="_blank"
          >
            <Download className="size-3.5" />
            Open the PDF
          </a>
        </>
      ) : (
        <p className="text-[14px] text-muted">
          {error === 404
            ? "This report doesn't exist."
            : "Couldn't open the report right now."}
        </p>
      )}
    </div>
  );
}

function ReportView({
  report,
  reportKey,
}: {
  report: Report;
  reportKey: string;
}) {
  const pm = report.postMortem;
  const chain = report.chain as Chain;
  const root = report.addresses[0];

  const sources = useMemo(
    () =>
      new Map<string, Source>(
        report.sources.map((s) => [
          String(s.n),
          {
            id: String(s.n),
            kind: s.kind,
            ref: s.ref,
            chain: s.chain,
            title: s.title,
            excerpt: s.excerpt,
            url: s.url,
            page: s.page,
          },
        ]),
      ),
    [report.sources],
  );

  // Citation previews: a side card just right of the column, kept on
  // screen (on narrow screens it covers the column's edge).
  const column = useRef<HTMLDivElement>(null);
  const [reveal, setReveal] = useState<Reveal | null>(null);
  const [cardLeft, setCardLeft] = useState<number | undefined>();
  useEffect(() => {
    const place = () => {
      const r = column.current?.getBoundingClientRect();
      if (!r) return;
      // The column's text ends 24px inside its box.
      const x = r.right - 24 + 20;
      setCardLeft(Math.min(x, innerWidth - 320 - 12));
    };
    place();
    addEventListener("resize", place);
    return () => removeEventListener("resize", place);
  }, []);
  const preview: OnPreview = (p) =>
    setReveal(
      p
        ? {
            key: `sources:${p.key}`,
            anchor: p.rect,
            content: <SourcePreview sources={p.sources} />,
          }
        : null,
    );

  // A chip click jumps to its source in the list.
  const [flash, setFlash] = useState<string | null>(null);
  const cite = (ids: string[]) => {
    const id = ids[0];
    if (!id) return;
    document
      .getElementById(`source-${id}`)
      ?.scrollIntoView({ behavior: "smooth", block: "center" });
    setFlash(id);
    setTimeout(() => setFlash((f) => (f === id ? null : f)), 1600);
  };

  // Sentences the analyst marked wrong (shown struck, kept in the text).
  const [marks, setMarks] = useState<string[]>(() => loadMarks(reportKey));
  const mark = async (sentence: string) => {
    await markWrong(reportKey, sentence);
    setMarks((m) => {
      const next = m.includes(sentence) ? m : [...m, sentence];
      saveMarks(reportKey, next);
      return next;
    });
  };

  const prose = (text: string, size: "lg" | "md" = "md") => (
    <Prose
      marks={marks}
      onCite={cite}
      onMark={mark}
      onPreview={preview}
      size={size}
      sources={sources}
      text={text}
    />
  );

  const active = useActiveSection();

  return (
    <>
      <Header chain={chain} reportKey={reportKey} root={root} />

      <nav className="fixed top-28 left-8 hidden w-44 xl:block">
        <ul className="flex flex-col gap-1">
          {SECTIONS.map(([id, label]) => (
            <li key={id}>
              <a
                className={cn(
                  "block rounded-md px-2 py-1 text-[12.5px] transition-colors",
                  active === id
                    ? "bg-surface text-ink shadow-hairline"
                    : "text-faint hover:text-ink",
                )}
                href={`#${id}`}
              >
                {label}
              </a>
            </li>
          ))}
        </ul>
      </nav>

      <div
        className="relative mx-auto px-6 pt-28 pb-32"
        ref={column}
        style={{ maxWidth: COLUMN + 48 }}
      >
        <p className="text-[12px] text-faint">
          {CHAIN_META[chain]?.label ?? report.chain} · generated{" "}
          {formatDay(report.created_at)} · {report.sources.length} sources
        </p>
        <h1 className="mt-2 text-[30px] leading-[1.15] font-medium tracking-[-0.02em] text-ink">
          {pm.title}
        </h1>

        <Section id="summary" title="Summary">
          {prose(pm.summary, "lg")}
        </Section>

        {pm.timeline.length > 0 && (
          <Section id="timeline" title="Timeline">
            <ol className="relative flex flex-col gap-4 pl-6">
              <span
                aria-hidden
                className="absolute top-2 bottom-2 left-[5px] w-px bg-rope"
              />
              {pm.timeline.map((t, i) => (
                <li className="relative" key={i}>
                  <span className="absolute top-[7px] -left-6 size-[11px] rounded-full border-2 border-canvas bg-ink" />
                  <p className="text-[11.5px] text-faint tabular-nums">
                    {formatWhen(t.at)}
                  </p>
                  {prose(t.event)}
                </li>
              ))}
            </ol>
          </Section>
        )}

        <Section id="how" title="How it happened">
          {prose(pm.how)}
        </Section>
        <Section id="flow" title="Where the money went">
          {prose(pm.fundFlow)}
        </Section>

        {pm.actors.length > 0 && (
          <Section id="actors" title="Actors">
            <ul className="flex flex-col divide-y divide-line rounded-2xl bg-surface px-4 ring-1 ring-line">
              {pm.actors.map((a, i) => (
                <li className="py-3.5" key={i}>
                  <div className="flex items-center gap-2 text-[13px]">
                    <span
                      className={cn(
                        "size-2 shrink-0 rounded-full",
                        roleClass(a.role),
                      )}
                    />
                    <span className="font-medium text-ink">{a.name}</span>
                    <span className="text-faint">{a.role}</span>
                    {/^0x[0-9a-fA-F]{40}$/.test(a.address) && (
                      <a
                        className="ml-auto flex items-center gap-1 font-mono text-[12px] text-muted hover:text-ink"
                        href={addressUrl(chain, a.address)}
                        rel="noopener noreferrer"
                        target="_blank"
                      >
                        {short(a.address)}
                        <ArrowUpRight className="size-3" />
                      </a>
                    )}
                  </div>
                  <div className="mt-1.5 pl-4">{prose(a.basis)}</div>
                </li>
              ))}
            </ul>
          </Section>
        )}

        <Section id="impact" title="Impact">
          {prose(pm.impact)}
        </Section>

        {pm.assumptions.length > 0 && (
          <Section id="assumptions" title="Assumptions">
            <ul className="flex flex-col gap-4">
              {pm.assumptions.map((a, i) => (
                <li className="border-l-2 border-line pl-4" key={i}>
                  {prose(a.statement)}
                  <div className="mt-1 flex gap-2">
                    <span className="mt-[3px] shrink-0 text-[11.5px] text-faint">
                      Basis
                    </span>
                    {prose(a.basis)}
                  </div>
                </li>
              ))}
            </ul>
          </Section>
        )}

        <Section id="method" title="Method and coverage">
          {prose(pm.method)}
        </Section>

        <Section id="sources" title="Sources">
          <ol className="flex flex-col gap-1">
            {report.sources.map((s) => (
              <li
                className={cn(
                  "scroll-mt-32 rounded-xl px-3 py-2.5 transition-colors duration-500",
                  flash === String(s.n) ? "bg-ion-50" : "bg-transparent",
                )}
                id={`source-${s.n}`}
                key={s.n}
              >
                <div className="flex items-baseline gap-3">
                  <span className="w-6 shrink-0 text-right text-[12px] text-faint tabular-nums">
                    {s.n}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-[13px] text-ink">
                        {s.title}
                      </span>
                      <span className="shrink-0 text-[11px] text-faint">
                        {KIND[s.kind]}
                      </span>
                      {s.url && (
                        <a
                          className="ml-auto shrink-0 text-faint hover:text-ink"
                          href={s.url}
                          rel="noopener noreferrer"
                          target="_blank"
                        >
                          <ArrowUpRight className="size-3.5" />
                          <span className="sr-only">Open source</span>
                        </a>
                      )}
                    </div>
                    <p className="mt-0.5 line-clamp-2 text-[12px] leading-5 [overflow-wrap:anywhere] text-muted">
                      {s.excerpt}
                    </p>
                  </div>
                </div>
              </li>
            ))}
          </ol>
        </Section>
      </div>

      <SideCard left={cardLeft} reveal={reveal} />
    </>
  );
}

function Header({
  chain,
  root,
  reportKey,
}: {
  chain: Chain;
  root: string | undefined;
  reportKey: string;
}) {
  const [copied, setCopied] = useState(false);
  const copy = () =>
    navigator.clipboard?.writeText(reportPdfUrl(reportKey)).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  return (
    <header className="fixed inset-x-0 top-0 z-30 flex items-center gap-2 px-6 py-4">
      {root ? (
        <Link
          className="flex h-9 items-center gap-2 rounded-full bg-surface/80 px-3.5 text-[13px] text-ink-soft shadow-hairline backdrop-blur-xl hover:text-ink"
          params={{ chain, target: root }}
          to="/investigate/$chain/$target"
        >
          <ArrowLeft className="size-3.5" />
          Back to trace
        </Link>
      ) : (
        <span />
      )}
      <div className="flex-1" />
      <ThemeToggle className="size-9 bg-surface/80 shadow-hairline backdrop-blur-xl" />
      <button
        className="flex h-9 items-center gap-2 rounded-full bg-surface/80 px-3.5 text-[13px] text-ink-soft shadow-hairline backdrop-blur-xl hover:text-ink"
        onClick={copy}
        type="button"
      >
        {copied ? (
          <Check className="size-3.5" />
        ) : (
          <Link2 className="size-3.5" />
        )}
        {copied ? "Copied" : "Copy PDF link"}
      </button>
      <a
        className="flex h-9 items-center gap-2 rounded-full bg-ink px-4 text-[13px] font-medium text-on-ink hover:bg-ink-soft"
        href={reportPdfUrl(reportKey)}
        rel="noopener noreferrer"
        target="_blank"
      >
        <Download className="size-3.5" />
        PDF
      </a>
    </header>
  );
}

function Section({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="mt-12 scroll-mt-28" data-section={id} id={id}>
      <h2 className="mb-3 text-[12px] font-medium tracking-[0.04em] text-faint uppercase">
        {title}
      </h2>
      {children}
    </section>
  );
}

/**
 * Cited prose, paragraph by paragraph. Hovering a paragraph shows a flag
 * in the margin; it lists the paragraph's sentences so one can be marked
 * wrong. Marked sentences stay in the text and are listed struck below.
 */
function Prose({
  text,
  sources,
  size,
  marks,
  onMark,
  onPreview,
  onCite,
}: {
  text: string;
  sources: Map<string, Source>;
  size: "lg" | "md";
  marks: string[];
  onMark: (sentence: string) => Promise<void>;
  onPreview: OnPreview;
  onCite: (ids: string[]) => void;
}) {
  const paragraphs = text.split(/\n{2,}/).filter((p) => p.trim());
  const cls =
    size === "lg"
      ? "text-[16px] leading-8 text-ink"
      : "text-[14.5px] leading-7 text-ink-soft";
  return (
    <div className="flex flex-col gap-3">
      {paragraphs.map((p, i) => (
        <Flaggable key={i} marks={marks} onMark={onMark} text={p}>
          <Answer
            onCite={onCite}
            onPreview={onPreview}
            prose={cls}
            sources={sources}
            text={p}
          />
        </Flaggable>
      ))}
    </div>
  );
}

function Flaggable({
  text,
  marks,
  onMark,
  children,
}: {
  text: string;
  marks: string[];
  onMark: (sentence: string) => Promise<void>;
  children: ReactNode;
}) {
  const sentences = text
    .split(SPLIT)
    .map(plain)
    .filter((s) => s.length > 3);
  const marked = sentences.filter((s) => marks.includes(s));
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  return (
    <div className="group relative">
      <button
        aria-label="Mark a sentence as wrong"
        className={cn(
          "absolute top-1 -left-8 flex size-6 items-center justify-center rounded-full text-faint transition-opacity hover:bg-surface hover:text-ink",
          open
            ? "opacity-100"
            : "opacity-0 group-hover:opacity-100 focus:opacity-100",
        )}
        onClick={() => setOpen((o) => !o)}
        type="button"
      >
        <Flag className="size-3.5" />
      </button>
      {children}
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            animate={{ height: "auto", opacity: 1 }}
            className="overflow-hidden"
            exit={{ height: 0, opacity: 0 }}
            initial={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            <div className="mt-2 rounded-xl bg-surface p-2 ring-1 ring-line">
              <p className="px-2 pt-1 pb-2 text-[12px] text-muted">
                Which sentence is wrong? What the agent learned from it leaves
                memory.
              </p>
              <ul className="flex flex-col">
                {sentences.map((s) => {
                  const done = marks.includes(s);
                  return (
                    <li key={s}>
                      <button
                        className={cn(
                          "w-full rounded-lg px-2 py-1.5 text-left text-[13px] leading-5 [overflow-wrap:anywhere] transition-colors",
                          done
                            ? "text-faint line-through"
                            : "text-ink-soft hover:bg-subtle hover:text-ink",
                        )}
                        disabled={done || busy !== null}
                        onClick={async () => {
                          setBusy(s);
                          setFailed(false);
                          try {
                            await onMark(s);
                            setOpen(false);
                          } catch {
                            setFailed(true);
                          } finally {
                            setBusy(null);
                          }
                        }}
                        type="button"
                      >
                        {busy === s ? (
                          <span className="text-shimmer">{s}</span>
                        ) : (
                          s
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>
              {failed && (
                <p className="px-2 pt-1 text-[12px] text-muted">
                  Couldn't record that. Try again.
                </p>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      {marked.length > 0 && (
        <ul className="mt-2 flex flex-col gap-1">
          {marked.map((s) => (
            <li className="flex items-baseline gap-2 text-[12px]" key={s}>
              <span className="shrink-0 rounded-full bg-subtle px-2 py-0.5 text-[11px] text-muted">
                Marked wrong · memory corrected
              </span>
              <span className="[overflow-wrap:anywhere] text-faint line-through">
                {s}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** The section in view, for the rail. */
function useActiveSection() {
  const [active, setActive] = useState<string>("summary");
  useEffect(() => {
    const els = [...document.querySelectorAll<HTMLElement>("[data-section]")];
    const io = new IntersectionObserver(
      (entries) => {
        const top = entries
          .filter((e) => e.isIntersecting)
          .sort(
            (a, b) => a.boundingClientRect.top - b.boundingClientRect.top,
          )[0];
        if (top) setActive(top.target.id);
      },
      { rootMargin: "-20% 0px -60% 0px" },
    );
    for (const el of els) io.observe(el);
    return () => io.disconnect();
  }, []);
  return active;
}

const KIND: Record<Source["kind"], string> = {
  tx: "Transfer",
  chain_state: "Chain state",
  contract: "Contract",
  dataset: "Dataset",
  computed: "Computed",
  memory: "Memory",
  document: "Document",
  web: "Web",
};

function roleClass(role: string) {
  const r = role.toLowerCase();
  if (/attack|exploit|hack|thief/.test(r)) return "bg-attacker";
  if (/victim/.test(r)) return "bg-victim";
  return "bg-normal";
}

const formatDay = (iso: string) =>
  new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

function formatWhen(at: string) {
  const d = new Date(at);
  if (Number.isNaN(d.getTime())) return at;
  const day = formatDay(at);
  return /T\d{2}:\d{2}/.test(at)
    ? `${day} · ${d.toISOString().slice(11, 16)} UTC`
    : day;
}
