// Persisted client settings (localStorage): investigation chain, custom
// RPC per chain, and the optional BYO model configuration. Everything here is
// an override layer — an empty value always means "use the service default".
// One external store so the console, settings sheet and terminal stay in sync.
import { useSyncExternalStore } from "react";
import type { Chain } from "./api";

export type Effort = "low" | "medium" | "high";

export interface Settings {
  chain: Chain;
  /** Custom RPC per chain; lookups for that chain go through it. */
  rpcUrls: Partial<Record<Chain, string>>;
  /** Older builds' ENS-only mainnet RPC. Kept for ENS (it may not serve
   * transfers, so it never becomes a lookup RPC); no longer editable. */
  ensRpcUrl?: string;
  modelKey: string;
  model: string;
  effort: Effort;
}

const SLOT = "intel-terminal:settings";

export const DEFAULT_SETTINGS: Settings = {
  chain: "ethereum",
  rpcUrls: {},
  modelKey: "",
  model: "",
  effort: "medium",
};

function read(): Settings {
  try {
    const raw = localStorage.getItem(SLOT);
    if (!raw) return { ...DEFAULT_SETTINGS };
    return { ...DEFAULT_SETTINGS, ...(JSON.parse(raw) as Partial<Settings>) };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

let current = read();
const listeners = new Set<() => void>();

export function loadSettings(): Settings {
  return current;
}

export function saveSettings(patch: Partial<Settings>): void {
  current = { ...current, ...patch };
  try {
    localStorage.setItem(SLOT, JSON.stringify(current));
  } catch {
    // Private mode / blocked storage: keep the in-memory value.
  }
  listeners.forEach((l) => l());
}

function subscribe(l: () => void): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}

export function useSettings(): Settings {
  return useSyncExternalStore(subscribe, loadSettings, loadSettings);
}

export const HTTPS_URL_RE = /^https:\/\/\S+$/;

/** The usable custom RPC for a chain ("" when unset or not https). */
export function customRpc(chain: Chain, s: Settings = current): string {
  const v = s.rpcUrls[chain]?.trim() ?? "";
  return HTTPS_URL_RE.test(v) ? v : "";
}

export function saveRpc(chain: Chain, url: string): void {
  saveSettings({ rpcUrls: { ...current.rpcUrls, [chain]: url } });
}
