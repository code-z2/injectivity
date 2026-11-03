import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

export function short(
  v: string | null | undefined,
  head = 6,
  tail = 4,
): string {
  if (!v) return "unknown";
  return v.length > head + tail + 2
    ? `${v.slice(0, head)}…${v.slice(-tail)}`
    : v;
}

export const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;

const NATIVE_SYMBOLS: Record<string, string> = {
  ethereum: "ETH",
  base: "ETH",
  arbitrum: "ETH",
  optimism: "ETH",
  bsc: "BNB",
  polygon: "POL",
};

export function nativeSymbol(chain: string): string {
  return NATIVE_SYMBOLS[chain] ?? "ETH";
}

export function fmtNative(hex: string): string {
  try {
    const wei = BigInt(hex);
    const whole = wei / 10n ** 18n;
    const frac = (wei % 10n ** 18n)
      .toString()
      .padStart(18, "0")
      .replace(/0+$/, "")
      .slice(0, 4);
    return frac ? `${whole}.${frac}` : `${whole}`;
  } catch {
    return hex;
  }
}
