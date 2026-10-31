// Live service status for the landing page: the configured mainnet RPC
// (ENS resolution) and the investigation API. Re-checked every minute
// and whenever the RPC setting changes.
import { useEffect, useState } from "react";
import { fetchHealth } from "./api";
import { rpcUrl } from "./ens";
import { useSettings } from "./settings";

export type Health = "checking" | "operational" | "degraded" | "down";
export interface ServiceStatus {
  state: Health;
  ms: number | null;
}

const TIMEOUT = 6000;
const SLOW = 2500; // answered, but slowly → degraded

async function timed(
  fn: (s: AbortSignal) => Promise<boolean>,
): Promise<ServiceStatus> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), TIMEOUT);
  const t0 = performance.now();
  try {
    const ok = await fn(ctl.signal);
    const ms = Math.round(performance.now() - t0);
    if (!ok) return { state: "down", ms };
    return { state: ms > SLOW ? "degraded" : "operational", ms };
  } catch {
    return { state: "down", ms: null };
  } finally {
    clearTimeout(timer);
  }
}

async function pingRpc(signal: AbortSignal): Promise<boolean> {
  const res = await fetch(rpcUrl(), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "eth_chainId",
      params: [],
    }),
    signal,
  });
  if (!res.ok) return false;
  const body = (await res.json()) as { result?: string };
  return typeof body.result === "string";
}

export function useServiceStatus(): {
  rpc: ServiceStatus;
  agent: ServiceStatus;
} {
  const { ensRpcUrl } = useSettings();
  const idle: ServiceStatus = { state: "checking", ms: null };
  const [rpc, setRpc] = useState(idle);
  const [agent, setAgent] = useState(idle);

  useEffect(() => {
    let live = true;
    const check = () => {
      void timed(pingRpc).then((s) => live && setRpc(s));
      void timed(fetchHealth).then((s) => live && setAgent(s));
    };
    check();
    const id = setInterval(check, 60_000);
    return () => {
      live = false;
      clearInterval(id);
    };
  }, [ensRpcUrl]);

  return { rpc, agent };
}
