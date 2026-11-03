// Live service status for the landing page: the RPC that lookups for the
// selected chain actually use (your custom one, else the service's), and
// the investigation API. The RPC is probed through the API every minute
// and whenever the chain or its custom RPC changes; failures from real
// lookups (rpcSignal) update it at once, so a throttled RPC never reads
// as operational.
import { useEffect, useState } from "react";
import { fetchHealth, fetchRpcHealth } from "./api";
import { onRpcReport, lastRpcReport, type RpcHealth } from "./rpcSignal";
import { customRpc, useSettings } from "./settings";

export type Health =
  "checking" | "operational" | "degraded" | "limited" | "unsupported" | "down";
export interface ServiceStatus {
  state: Health;
  ms: number | null;
  custom?: boolean;
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

function fromRpc(h: RpcHealth, ms: number | null): Health {
  if (h === "ok") return ms !== null && ms > SLOW ? "degraded" : "operational";
  if (h === "rate-limited") return "limited";
  if (h === "unsupported") return "unsupported";
  return "down";
}

async function probeRpc(chain: string): Promise<ServiceStatus> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), TIMEOUT + 2000);
  try {
    const r = await fetchRpcHealth(chain, ctl.signal);
    return { state: fromRpc(r.health, r.ms), ms: r.ms, custom: r.custom };
  } catch {
    return { state: "down", ms: null };
  } finally {
    clearTimeout(timer);
  }
}

export function useServiceStatus(): {
  rpc: ServiceStatus;
  agent: ServiceStatus;
} {
  const settings = useSettings();
  const chain = settings.chain;
  const custom = customRpc(chain, settings);
  const idle: ServiceStatus = { state: "checking", ms: null };
  const [rpc, setRpc] = useState(idle);
  const [agent, setAgent] = useState(idle);

  useEffect(() => {
    let live = true;
    setRpc(idle);
    const check = () => {
      void probeRpc(chain).then((s) => live && setRpc(s));
      void timed(fetchHealth).then((s) => live && setAgent(s));
    };
    check();
    const id = setInterval(check, 60_000);
    const off = onRpcReport(() => {
      const r = lastRpcReport();
      if (!live || !r || r.chain !== chain) return;
      setRpc((prev) => ({ ...prev, state: fromRpc(r.health, null) }));
    });
    return () => {
      live = false;
      clearInterval(id);
      off();
    };
  }, [chain, custom]); // eslint-disable-line react-hooks/exhaustive-deps

  return { rpc, agent };
}
