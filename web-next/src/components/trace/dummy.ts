import { SUGGESTIONS } from "@/lib/suggestions";
import { ADDRESS_RE } from "@/lib/utils";
import type { AddressRole, ChainLink } from "./types";

// Dummy data for building the trace UI before it is wired to the API.
// Deterministic per address, so the same address always shows the same
// counterparties.

export interface DummyFlow extends ChainLink {
  direction: "in" | "out";
  amount: string;
  asset: string;
  ago: string;
}

function rng(seed: string) {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  let s = h >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const pick = <T>(r: () => number, xs: readonly T[]): T =>
  xs[Math.floor(r() * xs.length)]!;

function fakeAddress(r: () => number): string {
  let s = "0x";
  for (let i = 0; i < 40; i++) s += "0123456789abcdef"[Math.floor(r() * 16)];
  return s;
}

const NAMES: Record<AddressRole, readonly (string | undefined)[]> = {
  attacker: [
    "Exploiter 1",
    "Phishing drainer",
    "Fake airdrop deployer",
    undefined,
  ],
  victim: ["Drained treasury", "Compromised hot wallet", undefined],
  normal: [
    "Uniswap V3: Router",
    "Exchange hot wallet 14",
    "Bridge: deposit contract",
    "OTC desk",
    undefined,
    undefined,
    undefined,
  ],
};
const ENS = ["mira.eth", "kestrel.eth", "0xjun.eth", "vault.eth"];
const ASSETS = ["ETH", "USDC", "USDT", "WETH", "DAI"];

function roleFor(r: () => number): AddressRole {
  const x = r();
  return x < 0.16 ? "attacker" : x < 0.3 ? "victim" : "normal";
}

/** The chain's starting link, from the route target. */
export function dummyRoot(target: string): ChainLink {
  if (ADDRESS_RE.test(target)) {
    const known = SUGGESTIONS.find(
      (x) => x.address.toLowerCase() === target.toLowerCase(),
    );
    return {
      address: target.toLowerCase(),
      role: "attacker",
      label: known?.label ?? "Exploiter 1",
    };
  }
  const r = rng(target);
  return { address: fakeAddress(r), role: "normal", ens: target };
}

/** Counterparties of an address: the fund-flow table rows. */
export function dummyFlows(address: string): DummyFlow[] {
  const r = rng(address);
  const n = 7 + Math.floor(r() * 4);
  return Array.from({ length: n }, (_, i) => {
    const role = roleFor(r);
    const ens = r() < 0.12 ? pick(r, ENS) : undefined;
    return {
      address: fakeAddress(r),
      role,
      label: pick(r, NAMES[role]),
      ens,
      direction: r() < 0.5 ? "in" : "out",
      amount: (r() * (r() < 0.3 ? 900 : 40)).toFixed(r() < 0.5 ? 2 : 4),
      asset: pick(r, ASSETS),
      ago: `${1 + i * 2 + Math.floor(r() * 3)}h ago`,
    };
  });
}
