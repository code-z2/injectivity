import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Chain, KnownLabel } from "@/lib/api";
import { looksLikeEns, resolveEns } from "@/lib/ens";
import { takePreloaded } from "@/lib/preload";
import { SUGGESTIONS } from "@/lib/suggestions";
import { ADDRESS_RE } from "@/lib/utils";
import { AddressChain, type Flash } from "./AddressChain";
import { usePrices } from "@/lib/prices";
import { CardGlobe } from "./globe/CardGlobe";
import type { NodeStat } from "./globe/molecule";
import { useOuterRing } from "./globe/useOuterRing";
import { AgentPanel } from "./agent/AgentPanel";
import { Dock } from "./dock/Dock";
import { Toast, type ToastMessage } from "./Toast";
import { nameFromLabel, roleFromLabel, type ChainLink } from "./types";
import { useLedger } from "./useLedger";

// The trace page (phase 2), on a dot-pattern field. Left: the user-built
// address chain; selecting a link makes it active. Centre: the card globe,
// the active address's molecule; clicking a card follows it (cutting any
// links after the active one, undoable) and opens the dock. Bottom: the
// dock, the active address's ledger, floating over the globe. Right: the
// agent panel (node brief, cited conversation, report).

const RING1_MAX = 14; // atoms around the active address
const RING2_PARENTS = 10; // ring-1 addresses whose own counterparties are fetched
const RING3_PARENTS = 10; // ring-2 addresses that grow a third ring

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
      {/* Dot pattern: barely there, just enough texture. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage:
            "radial-gradient(rgb(11 13 18 / 0.06) 1px, transparent 1px)",
          backgroundSize: "18px 18px",
        }}
      />
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
  const [openKey, setOpenKey] = useState(0);
  const [collapseKey, setCollapseKey] = useState(0);
  const [toast, setToast] = useState<ToastMessage | null>(null);
  const [known, setKnown] = useState<Record<string, KnownLabel>>({});
  const toastId = useRef(0);

  const active = links[Math.min(selected, links.length - 1)]!;
  const ledger = useLedger(chain, active.address);
  const fresh = ledger.owner === active.address;
  const ready = fresh && ledger.status !== "loading";

  // Ring 1: the active address's most active counterparties, with the
  // counts and token flows between them (from the loaded ledger).
  const ring1 = useMemo<NodeStat[]>(() => {
    if (!fresh) return [];
    const top = new Map(
      ledger.counterparties.slice(0, RING1_MAX).map((c) => [
        c.address,
        {
          address: c.address,
          inCount: c.inCount,
          outCount: c.outCount,
          flows: [],
        } as NodeStat,
      ]),
    );
    for (const r of ledger.rows) {
      top.get(r.counterparty)?.flows.push({
        contract: r.contract,
        asset: r.asset,
        amount: r.amount,
        category: r.category,
      });
    }
    return [...top.values()];
  }, [fresh, ledger.counterparties, ledger.rows]);
  const prices = usePrices(chain);
  const parents = useMemo(
    () => ring1.slice(0, RING2_PARENTS).map((r) => r.address),
    [ring1],
  );
  const outer2 = useOuterRing(chain, active.address, ready ? parents : [], 4);
  // Ring 3 grows from the most active ring-2 atoms not already placed.
  const parents3 = useMemo(() => {
    const placed = new Set([active.address, ...ring1.map((r) => r.address)]);
    const kids = [...outer2.ring.values()].flat();
    const seen = new Set<string>();
    return kids
      .filter(
        (k) =>
          !placed.has(k.address) && !seen.has(k.address) && seen.add(k.address),
      )
      .sort((a, b) => b.inCount + b.outCount - (a.inCount + a.outCount))
      .slice(0, RING3_PARENTS)
      .map((k) => k.address);
  }, [outer2.ring, ring1, active.address]);
  const outer3 = useOuterRing(
    chain,
    active.address,
    outer2.pending === 0 ? parents3 : [],
    3,
  );
  const globeLabels = useMemo(
    () => ({ ...known, ...ledger.labels, ...outer2.labels, ...outer3.labels }),
    [known, ledger.labels, outer2.labels, outer3.labels],
  );

  // The dock shows the inspected card (a single click), else the active
  // address. Its own ledger loads only while inspecting something else.
  const [inspect, setInspect] = useState<string | null>(null);
  const subject = inspect ?? active.address;
  const other = useLedger(
    chain,
    inspect && inspect !== active.address ? inspect : "",
  );
  const dockLedger = inspect && inspect !== active.address ? other : ledger;
  function inspectCard(address: string) {
    setInspect(address);
    setOpenKey((k) => k + 1);
  }

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

  // Follow one address (ring 1) or a parent and its child (ring 2) from
  // the active link, cutting any links after it.
  function follow(path: string[]) {
    const unseen = path.filter((a) => !links.some((l) => l.address === a));
    if (unseen.length === 0) {
      const address = path[path.length - 1]!;
      setFlash((f) => ({ address, n: (f?.n ?? 0) + 1 }));
      return;
    }
    const keep = links.slice(0, selected + 1);
    const cut = links.length - keep.length;
    const prev = links;
    const prevSelected = selected;
    const added = path
      .filter((a) => !keep.some((l) => l.address === a))
      .map((address) => {
        const k = globeLabels[address];
        return { address, role: roleFromLabel(k), label: nameFromLabel(k) };
      });
    setLinks([...keep, ...added]);
    setSelected(keep.length + added.length - 1);
    setInspect(null);
    setCollapseKey((k) => k + 1);
    if (cut > 0) {
      say(
        cut === 1 ? "Detached 1 address" : `Detached ${cut} addresses`,
        restore(prev, prevSelected, keep.length + added.length),
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
          onSelect={(i) => {
            setSelected(i);
            setInspect(null);
          }}
          onCopy={copy}
          onDetach={detach}
        />
      </aside>
      <div className="absolute inset-0">
        <CardGlobe
          chain={chain}
          active={active.address}
          ring1={ring1}
          ring2={outer2.ring}
          ring3={outer3.ring}
          ready={ready}
          labels={globeLabels}
          prices={prices}
          lit={lit}
          overflow={
            fresh ? Math.max(0, ledger.counterparties.length - RING1_MAX) : 0
          }
          mapping={outer2.pending + outer3.pending}
          inspected={subject}
          onInspect={inspectCard}
          onFollow={follow}
        />
      </div>
      <Dock
        chain={chain}
        address={subject}
        subjectName={nameFromLabel(globeLabels[subject])}
        rows={dockLedger.rows}
        counterparties={dockLedger.counterparties}
        labels={dockLedger.labels}
        status={dockLedger.status}
        error={dockLedger.error}
        onLoadMore={dockLedger.loadMore}
        onRetry={dockLedger.retry}
        onHoverCounterparty={setLit}
        openKey={openKey}
        collapseKey={collapseKey}
      />
      <AgentPanel
        active={active.address}
        chain={chain}
        inspected={inspect}
        inspectedName={
          inspect ? nameFromLabel(globeLabels[inspect]) : undefined
        }
        inspectedRole={roleFromLabel(
          inspect ? globeLabels[inspect] : undefined,
        )}
        links={shownLinks}
        openKey={openKey}
        root={root}
      />
      <Toast toast={toast} onDone={clearToast} />
    </>
  );
}
