// Appearance: light, dark or follow the system. The resolved theme is a
// `.dark` class on <html> (set before first paint by the script in
// index.html, so there's no flash); the choice is remembered here.
import { useSyncExternalStore } from "react";

export type ThemeMode = "light" | "dark" | "system";
export type Theme = "light" | "dark";

const SLOT = "intel-terminal:theme";
const media = () => matchMedia("(prefers-color-scheme: dark)");

function readMode(): ThemeMode {
  try {
    const v = localStorage.getItem(SLOT);
    return v === "light" || v === "dark" ? v : "system";
  } catch {
    return "system";
  }
}

let mode: ThemeMode = readMode();
const resolve = (m: ThemeMode): Theme =>
  m === "system" ? (media().matches ? "dark" : "light") : m;
let theme: Theme = resolve(mode);
const listeners = new Set<() => void>();

function apply() {
  theme = resolve(mode);
  const root = document.documentElement;
  root.classList.toggle("dark", theme === "dark");
  root.style.colorScheme = theme;
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute("content", theme === "dark" ? "#0b0d12" : "#f7f8fa");
  for (const l of listeners) l();
}

media().addEventListener("change", () => mode === "system" && apply());

export function setThemeMode(m: ThemeMode) {
  mode = m;
  try {
    if (m === "system") localStorage.removeItem(SLOT);
    else localStorage.setItem(SLOT, m);
  } catch {
    // Not remembered.
  }
  apply();
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

/** The resolved theme (what's on screen). */
export const useTheme = (): Theme =>
  useSyncExternalStore(
    subscribe,
    () => theme,
    () => theme,
  );

/** The chosen mode (light, dark or system). */
export const useThemeMode = (): ThemeMode =>
  useSyncExternalStore(
    subscribe,
    () => mode,
    () => mode,
  );

export const currentTheme = () => theme;
