// What real lookups learned about the RPC since the last probe. The API
// client reports failures here as they happen, so the status bar turns
// the moment a lookup is throttled instead of waiting for the next probe.
export type RpcHealth =
  "ok" | "rate-limited" | "unsupported" | "error" | "unavailable";

export interface RpcReport {
  chain: string;
  health: RpcHealth;
  at: number;
}

let last: RpcReport | null = null;
const listeners = new Set<() => void>();

export function reportRpc(chain: string, health: RpcHealth): void {
  last = { chain, health, at: Date.now() };
  listeners.forEach((l) => l());
}

export function lastRpcReport(): RpcReport | null {
  return last;
}

export function onRpcReport(l: () => void): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}

/** Reads the worker's "live fetch failed (alchemy-http-429)" style notes. */
export function healthFromNote(note: string | undefined): RpcHealth | null {
  if (!note) return null;
  if (/429|rate|capacity/i.test(note)) return "rate-limited";
  if (/not found|not supported|-32601/i.test(note)) return "unsupported";
  if (/live fetch failed|alchemy-/i.test(note)) return "error";
  return null;
}
