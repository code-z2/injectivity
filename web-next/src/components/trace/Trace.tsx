import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Chain, KnownLabel } from "@/lib/api";
import { looksLikeEns, resolveEns } from "@/lib/ens";
import { takePreloaded } from "@/lib/preload";
import { SUGGESTIONS } from "@/lib/suggestions";
import { ADDRESS_RE } from "@/lib/utils";
import { AddressChain, type Flash } from "./AddressChain";
import { CounterpartyPicks } from "./CounterpartyPicks";
import { Dock } from "./dock/Dock";
import { Toast, type ToastMessage } from "./Toast";
import { nameFromLabel, roleFromLabel, type ChainLink } from "./types";
import { useLedger } from "./useLedger";

// The trace page (phase 2). Left: the user-built address chain; selecting
// a link makes it active. Bottom: the dock, the active address's ledger.
// Centre: for now, its unique counterparties as chips (the globe will take
// this place); clicking one follows it, cutting any links after the active
// one (undoable). Each link's menu copies its address or detaches it.

export function Trace({ chain, target }: { chain: Chain; target: string }) {
  const [root, setRoot] = useState<string | null>(() =>
    ADDRESS_RE.test(target)
      ? target.toLowerCase()
      : (takePreloaded(chain, target)?.address ?? null),
  );
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (root || !looksLikeEns(target)) {
      if (!root) setFailed(true);
      return;
    }
    let live = true;
    resolveEns(target)
      .then((a) => live && setRoot(a.toLowerCase()))
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
    };
  }, [root, target]);

  return (
    <main className="relative h-svh w-full overflow-hidden bg-canvas">
      <h1 className="sr-only">Trace of {target}</h1>
      {root ? (
        <Workspace
          key={root}
          chain={chain}
          root={root}
          ens={looksLikeEns(target) ? target : undefined}
        />
      ) : (
        <p className="absolute top-6 left-6 text-[13px] text-faint">
          {failed ? `Couldn't resolve ${target}.` : `Resolving ${target}…`}
        </p>
      )}
    </main>
  );
}

function Workspace({
  chain,
  root,
  ens,
}: {
  chain: Chain;
  root: string;
  ens?: string;
}) {
  const [links, setLinks] = useState<ChainLink[]>(() => {
    const known = SUGGESTIONS.find((s) => s.address.toLowerCase() === root);
    return [
      {
        address: root,
        role: known ? "attacker" : "normal",
        label: known?.label,
        ens,
      },
    ];
  });
  const [selected, setSelected] = useState(0);
  const [flash, setFlash] = useState<Flash>();
  const [lit, setLit] = useState<string | null>(null);
  const [toast, setToast] = useState<ToastMessage | null>(null);
  const [known, setKnown] = useState<Record<string, KnownLabel>>({});
  const toastId = useRef(0);

  const active = links[Math.min(selected, links.length - 1)]!;
  const ledger = useLedger(chain, active.address);

  // Remember every label the ledger has found, for the chain's badges.
  useEffect(() => {
    setKnown((k) => ({ ...k, ...ledger.labels }));
  }, [ledger.labels]);

  const shownLinks = useMemo(
    () =>
      links.map((l) => {
        const k = known[l.address];
        if (!k || l.label) return l;
        return { ...l, role: roleFromLabel(k), label: nameFromLabel(k) };
      }),
    [links, known],
  );

  const say = (text: string, action?: ToastMessage["action"]) =>
    setToast({ id: ++toastId.current, text, action });
  const clearToast = useCallback(() => setToast(null), []);

  function restore(prev: ChainLink[], prevSelected: number, cutAt: number) {
    return {
      label: "Undo",
      // Only while the chain still ends where the cut left it.
      run: () =>
        setLinks((ls) => {
          if (ls.length !== cutAt) return ls;
          setSelected(prevSelected);
          return prev;
        }),
    };
  }

  function follow(address: string) {
    if (links.some((l) => l.address === address)) {
      setFlash((f) => ({ address, n: (f?.n ?? 0) + 1 }));
      return;
    }
    const k = known[address] ?? ledger.labels[address];
    const keep = links.slice(0, selected + 1);
    const cut = links.length - keep.length;
    const prev = links;
    const prevSelected = selected;
    setLinks([
      ...keep,
      { address, role: roleFromLabel(k), label: nameFromLabel(k) },
    ]);
    setSelected(keep.length);
    if (cut > 0) {
      say(
        cut === 1 ? "Detached 1 address" : `Detached ${cut} addresses`,
        restore(prev, prevSelected, keep.length + 1),
      );
    }
  }

  function copy(address: string) {
    void navigator.clipboard?.writeText(address).then(
      () => say("Address copied"),
      () => say("Couldn't copy the address"),
    );
  }

  function detach(index: number) {
    if (index < 1) return;
    const prev = links;
    const prevSelected = selected;
    const removed = links.length - index;
    setLinks(links.slice(0, index));
    setSelected((s) => Math.min(s, index - 1));
    say(
      removed === 1 ? "Detached 1 address" : `Detached ${removed} addresses`,
      restore(prev, prevSelected, index),
    );
  }

  return (
    <>
      <aside className="absolute inset-y-0 left-0 z-20 w-[340px] overflow-y-auto px-6 pt-6 pb-24">
        <AddressChain
          links={shownLinks}
          chain={chain}
          flash={flash}
          selected={selected}
          onSelect={setSelected}
          onCopy={copy}
          onDetach={detach}
        />
      </aside>
      <div className="absolute top-6 right-6 left-[360px]">
        <CounterpartyPicks
          counterparties={ledger.counterparties}
          labels={ledger.labels}
          lit={lit}
          detaches={links.length - 1 - selected}
          onFollow={follow}
        />
      </div>
      <Dock
        chain={chain}
        address={active.address}
        rows={ledger.rows}
        counterparties={ledger.counterparties}
        labels={ledger.labels}
        status={ledger.status}
        error={ledger.error}
        onLoadMore={ledger.loadMore}
        onRetry={ledger.retry}
        onHoverCounterparty={setLit}
      />
      <Toast toast={toast} onDone={clearToast} />
    </>
  );
}
