import { txUrl } from "@/lib/explorer";
import type { KnownLabel } from "@/lib/api";
import { cn, short } from "@/lib/utils";
import { RoleDot } from "../AddressCard";
import { EtherscanLogo } from "../EtherscanLogo";
import { TokenIcon } from "../TokenIcon";
import { nameFromLabel, roleFromLabel } from "../types";
import type { LedgerRow } from "../useLedger";
import { fmtAmount, timeAgo } from "./filters";
import { SpoofTag } from "./SpoofTag";
import { spoofOf } from "./spoof";

// One transfer. Three signals agree on direction: "from"/"to" before the
// counterparty, a signed amount (+ green in, − neutral grey out) and the
// token icon (the direction arrow when no icon exists). The whole row
// opens the transaction on Etherscan; the mark appears on hover.
export function LedgerRowView({
  row,
  chain,
  label,
  onHover,
  style,
}: {
  row: LedgerRow;
  chain: string;
  label: KnownLabel | undefined;
  onHover: (counterparty: string | null) => void;
  style?: React.CSSProperties;
}) {
  const inbound = row.direction === "in";
  const name = nameFromLabel(label);
  const spoof = spoofOf(row.asset);
  return (
    <a
      href={txUrl(chain, row.hash)}
      target="_blank"
      rel="noreferrer"
      style={style}
      onMouseEnter={() => onHover(row.counterparty)}
      onMouseLeave={() => onHover(null)}
      className="group/row absolute inset-x-0 flex h-[52px] items-center gap-3 rounded-xl px-3 transition-colors duration-150 hover:bg-ink/[0.03]"
    >
      <TokenIcon
        key={`${chain}:${row.contract ?? row.asset}`}
        chain={chain}
        contract={row.contract}
        direction={row.direction}
        className="size-7 shrink-0"
      />
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <span className="w-7 shrink-0 text-[11.5px] text-faint">
          {inbound ? "from" : "to"}
        </span>
        <RoleDot role={roleFromLabel(label)} />
        <span className="shrink-0 font-mono text-[12.5px] text-ink-soft">
          {short(row.counterparty)}
        </span>
        {name && (
          <span className="min-w-0 truncate text-[12.5px] text-muted @max-[34rem]:hidden">
            {name}
          </span>
        )}
      </div>
      <span
        className={cn(
          "shrink-0 text-right font-mono text-[13px] tabular-nums",
          inbound ? "text-clean" : "text-ink-soft",
        )}
      >
        {inbound ? "+" : "−"}
        {amountText(row)}{" "}
        <span className="text-[12px] opacity-80">{assetText(row)}</span>
        {spoof && <SpoofTag imitates={spoof} />}
      </span>
      <span className="w-[72px] shrink-0 text-right text-[11.5px] text-faint tabular-nums @max-[30rem]:hidden">
        {timeAgo(row.time)}
      </span>
      <span className="flex w-5 shrink-0 justify-end opacity-0 transition-opacity duration-150 group-hover/row:opacity-100">
        <EtherscanLogo className="size-3.5" />
      </span>
    </a>
  );
}

// NFTs come without an amount (and often without a symbol).
const isNft = (r: LedgerRow) =>
  r.category === "erc721" || r.category === "erc1155";
function amountText(r: LedgerRow): string {
  if (r.amount !== null) return fmtAmount(r.amount);
  return r.category === "erc721" ? "1" : "";
}
function assetText(r: LedgerRow): string {
  if (isNft(r) && (!r.asset || r.asset === "Unknown")) return "NFT";
  return r.asset;
}
