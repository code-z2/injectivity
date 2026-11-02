import { useCallback, useMemo, useRef, useState } from "react";
import type { Chain } from "@/lib/api";
import { AddressChain, type Flash } from "./AddressChain";
import { dummyFlows, dummyRoot, type DummyFlow } from "./dummy";
import { DummyFlowTable } from "./DummyFlowTable";
import { Toast, type ToastMessage } from "./Toast";
import type { ChainLink } from "./types";

// The trace page (phase 2), built up from a blank canvas one piece at a
// time. Left: the user-built address chain. Main: for now, a dummy
// fund-flow table for the chain's newest address; clicking a row follows
// that address and adds it to the chain. Each link's menu copies its
// address or detaches it and everything below (undoable from the toast).
// The old terminal port stays in components/terminal for reference until
// its parts are carried over.

export function Trace({ chain, target }: { chain: Chain; target: string }) {
  const [links, setLinks] = useState<ChainLink[]>(() => [dummyRoot(target)]);
  const [flash, setFlash] = useState<Flash>();
  const [toast, setToast] = useState<ToastMessage | null>(null);
  const toastId = useRef(0);
  const tail = links[links.length - 1]!;
  const flows = useMemo(() => dummyFlows(tail.address), [tail.address]);

  const say = (text: string, action?: ToastMessage["action"]) =>
    setToast({ id: ++toastId.current, text, action });
  const clearToast = useCallback(() => setToast(null), []);

  function follow({ address, role, label, ens }: DummyFlow) {
    if (links.some((l) => l.address === address)) {
      setFlash((f) => ({ address, n: (f?.n ?? 0) + 1 }));
      return;
    }
    setLinks((ls) => [...ls, { address, role, label, ens }]);
  }

  function copy(address: string) {
    void navigator.clipboard?.writeText(address).then(
      () => say("Address copied"),
      () => say("Couldn't copy the address"),
    );
  }

  function detach(index: number) {
    if (index < 1) return;
    const removed = links.slice(index);
    setLinks(links.slice(0, index));
    say(
      removed.length === 1
        ? "Detached 1 address"
        : `Detached ${removed.length} addresses`,
      {
        label: "Undo",
        // Only while the chain still ends where the cut left it.
        run: () =>
          setLinks((ls) => (ls.length === index ? [...ls, ...removed] : ls)),
      },
    );
  }

  return (
    <main className="relative flex h-svh w-full overflow-hidden bg-canvas">
      <h1 className="sr-only">Trace of {target}</h1>
      <aside className="h-full w-[340px] shrink-0 overflow-y-auto px-6 pt-6">
        <AddressChain
          links={links}
          chain={chain}
          flash={flash}
          onCopy={copy}
          onDetach={detach}
        />
      </aside>
      <div className="flex-1 overflow-y-auto px-8 pt-6 pb-10">
        <DummyFlowTable of={tail} flows={flows} onFollow={follow} />
      </div>
      <Toast toast={toast} onDone={clearToast} />
    </main>
  );
}
