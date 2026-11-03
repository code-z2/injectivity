// Marks a token whose symbol impersonates another (see spoof.ts). Yellow,
// the caution colour (no red), with what it imitates in the tooltip.
export function SpoofTag({ imitates }: { imitates: string }) {
  return (
    <span
      title={`Imitates ${imitates}: the symbol uses look-alike letters from another alphabet`}
      className="ml-1.5 inline-flex h-4 items-center rounded-full bg-victim-soft px-1.5 align-middle font-sans text-[10px] font-medium text-victim-ink"
    >
      Spoof
    </span>
  );
}
