import { ArrowDownLeft, ArrowUpRight } from "lucide-react";
import type { Transfer } from "@/lib/api";
import { addressUrl, txUrl } from "@/lib/explorer";
import { cn, short } from "@/lib/utils";
import { linkCls } from "./ui";

export function HistoryTable({
  rows,
  self,
  chain,
  hasMore,
  loadingMore,
  onLoadMore,
}: {
  rows: Transfer[];
  self: string;
  chain: string;
  hasMore: boolean;
  loadingMore: boolean;
  onLoadMore: () => void;
}) {
  return (
    <div>
      <div className="-mx-2 overflow-x-auto">
        <table className="w-full min-w-[560px] border-collapse text-left">
          <thead>
            <tr className="text-[12px] text-faint">
              {["Direction", "Counterparty", "Asset", "Value", "Tx"].map(
                (h) => (
                  <th
                    key={h}
                    className="border-b border-line px-2 py-2.5 font-medium"
                  >
                    {h}
                  </th>
                ),
              )}
            </tr>
          </thead>
          <tbody>
            {rows.map((t, i) => {
              const out = t.from.toLowerCase() === self;
              const other = out ? t.to : t.from;
              return (
                <tr
                  key={`${t.hash}-${i}`}
                  className="text-[13px] transition-colors duration-150 hover:bg-subtle/70"
                >
                  <td className="border-b border-line/70 px-2 py-2.5">
                    <span
                      className={cn(
                        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium",
                        out
                          ? "bg-subtle text-ink-soft"
                          : "bg-ion-50 text-ion-700",
                      )}
                    >
                      {out ? (
                        <ArrowUpRight className="size-3" />
                      ) : (
                        <ArrowDownLeft className="size-3" />
                      )}
                      {out ? "OUT" : "IN"}
                    </span>
                  </td>
                  <td className="border-b border-line/70 px-2 py-2.5 font-mono text-[12.5px]">
                    <a
                      className={linkCls}
                      href={addressUrl(chain, other)}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {short(other)}
                    </a>
                  </td>
                  <td className="border-b border-line/70 px-2 py-2.5 text-ink-soft">
                    {t.asset || "—"}
                  </td>
                  <td className="border-b border-line/70 px-2 py-2.5 font-mono text-[12.5px]">
                    {t.value || "—"}
                  </td>
                  <td className="border-b border-line/70 px-2 py-2.5 font-mono text-[12.5px]">
                    <a
                      className={linkCls}
                      href={txUrl(chain, t.hash)}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {short(t.hash)}
                    </a>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {hasMore && (
        <button
          onClick={onLoadMore}
          disabled={loadingMore}
          className="mt-3 h-9 rounded-full border border-line px-4 text-[13px] font-medium text-ink-soft transition-colors hover:border-line-strong hover:text-ink disabled:opacity-60"
        >
          {loadingMore ? "Loading…" : "Load more"}
        </button>
      )}
    </div>
  );
}
