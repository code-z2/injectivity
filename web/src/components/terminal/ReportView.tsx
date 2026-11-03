import { Check, Download } from "lucide-react";
import { useEffect, useState } from "react";
import { fetchReport, reportPdfUrl, type StoredReport } from "@/lib/api";
import { txUrl } from "@/lib/explorer";
import { short } from "@/lib/utils";
import { ErrorLine, linkCls, SectionLabel, Status, Tag } from "./ui";

const SAVE_SLOT = "intel-terminal:saved-reports";
interface SavedEntry {
  id: number;
  address: string;
  chain: string;
  savedAt: string;
}

function readSaved(): SavedEntry[] {
  try {
    return JSON.parse(localStorage.getItem(SAVE_SLOT) ?? "[]") as SavedEntry[];
  } catch {
    return [];
  }
}

export function ReportView({
  reportId,
  chain,
}: {
  reportId: number;
  chain: string;
}) {
  const [currentId, setCurrentId] = useState(reportId);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [doc, setDoc] = useState<StoredReport | null>(null);
  const [saved, setSaved] = useState<SavedEntry[]>(readSaved);
  const savedHere = saved.some((s) => s.id === currentId);

  useEffect(() => setCurrentId(reportId), [reportId]);

  useEffect(() => {
    let live = true;
    setLoading(true);
    setError("");
    setDoc(null);
    fetchReport(currentId)
      .then((d) => live && setDoc(d))
      .catch(() => live && setError("Could not load that report."))
      .finally(() => live && setLoading(false));
    return () => {
      live = false;
    };
  }, [currentId]);

  function save() {
    if (!doc || savedHere) return;
    const entry: SavedEntry = {
      id: currentId,
      address: doc.address ?? chain,
      chain: doc.chain ?? chain,
      savedAt: new Date().toISOString().slice(0, 10),
    };
    const next = [entry, ...saved].slice(0, 50);
    setSaved(next);
    try {
      localStorage.setItem(SAVE_SLOT, JSON.stringify(next));
    } catch {
      // Storage blocked: keep the in-session list.
    }
  }

  return (
    <div className="mt-5 border-t border-line pt-5">
      {loading && <Status text="Loading report…" />}
      {error && <ErrorLine>{error}</ErrorLine>}

      {doc && (
        <>
          <p className="text-[15px] leading-[1.6] text-ink">
            {doc.report.summary}
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <a
              href={reportPdfUrl(currentId)}
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-9 items-center gap-1.5 rounded-full bg-ink px-4 text-[13px] font-medium text-white transition-colors hover:bg-ink-soft"
            >
              <Download className="size-4" />
              Download PDF
            </a>
            <button
              onClick={save}
              className="inline-flex h-9 items-center gap-1.5 rounded-full border border-line px-4 text-[13px] font-medium text-ink-soft transition-colors hover:border-line-strong hover:text-ink"
            >
              {savedHere && <Check className="size-4 text-clean" />}
              {savedHere ? "Saved" : "Save locally"}
            </button>
          </div>

          <div className="mt-5 space-y-2.5">
            {doc.report.findings.map((f, i) => (
              <div
                key={i}
                className="rounded-2xl border border-line px-4 py-3.5"
              >
                <div className="flex gap-1.5">
                  <Tag
                    tone={f.verdict === "verified" ? "verified" : "inferred"}
                  >
                    {f.verdict}
                  </Tag>
                  <Tag tone="neutral">{f.confidence}</Tag>
                </div>
                <p className="mt-2 text-[14px] leading-[1.55] text-ink">
                  {f.claim}
                </p>
                {f.evidence.txHashes.map((h) => (
                  <p key={h} className="mt-1 font-mono text-[12px] text-muted">
                    tx{" "}
                    <a
                      href={txUrl(chain, h)}
                      target="_blank"
                      rel="noreferrer"
                      className={linkCls}
                    >
                      {short(h, 8, 6)}
                    </a>
                  </p>
                ))}
                {f.evidence.listRefs.length > 0 && (
                  <p className="mt-1 font-mono text-[12px] text-muted">
                    lists: {f.evidence.listRefs.join(", ")}
                  </p>
                )}
              </div>
            ))}
          </div>

          <SectionLabel className="mt-6">Open questions</SectionLabel>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-[14px] text-ink-soft marker:text-faint">
            {doc.report.uncertainty.map((u, i) => (
              <li key={i}>{u}</li>
            ))}
          </ul>

          <SectionLabel className="mt-6">Next checks</SectionLabel>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-[14px] text-ink-soft marker:text-faint">
            {doc.report.nextChecks.map((n, i) => (
              <li key={i}>{n}</li>
            ))}
          </ul>

          {saved.length > 0 && (
            <>
              <SectionLabel className="mt-6">Saved reports</SectionLabel>
              <div className="mt-2 divide-y divide-line">
                {saved.map((s) => (
                  <div
                    key={s.id}
                    className="flex items-center justify-between py-2 text-[13px]"
                  >
                    <button
                      onClick={() => setCurrentId(s.id)}
                      className={`${linkCls} font-mono`}
                    >
                      #{s.id} {short(s.address, 8, 6)}
                    </button>
                    <span className="text-muted">
                      {s.chain} · {s.savedAt}
                    </span>
                  </div>
                ))}
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
