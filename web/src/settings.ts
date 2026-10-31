// Persisted client settings (localStorage): investigation chain, ENS RPC
// override, and the optional BYO model configuration. Everything here is
// an override layer — an empty value always means "use the service default".
import type { Chain } from "./api";

export interface Settings {
  chain: Chain;
  ensRpcUrl: string;
  modelKey: string;
  model: string;
  effort: "low" | "medium" | "high";
}

const SLOT = "intel-terminal:settings";

export const DEFAULT_SETTINGS: Settings = {
  chain: "ethereum",
  ensRpcUrl: "",
  modelKey: "",
  model: "",
  effort: "medium",
};

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(SLOT);
    if (!raw) return { ...DEFAULT_SETTINGS };
    return { ...DEFAULT_SETTINGS, ...(JSON.parse(raw) as Partial<Settings>) };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(s: Settings): void {
  localStorage.setItem(SLOT, JSON.stringify(s));
}
