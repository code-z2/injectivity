import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Dialog } from "radix-ui";
import { CircleHelp } from "lucide-react";

const KEY = "intel-terminal:home-tutorial:v1";
const STEPS = [
  {
    title: "Follow the money",
    body: "Investigate wallets and exploits, trace fund flows, and research the evidence with an AI agent. Here’s where to start.",
    target: null,
  },
  {
    title: "Enter a target",
    body: "Paste a wallet address, enter an ENS name like vitalik.eth, or search for an exploit by name or technique.",
    target: "search",
  },
  {
    title: "Try a known exploit",
    body: "No address in mind? Choose an example to open an investigation straight away. Searching for an exploit updates this list with matching wallets.",
    target: "examples",
  },
  {
    title: "Make it yours in Settings",
    body: "Use this button to choose your chain, add your own RPC or AI model, and change appearance. The defaults work too—no setup is required.",
    target: "settings",
  },
  {
    title: "Start investigating",
    body: "After entering an address or ENS name, press this arrow or Enter. For an exploit search, Enter opens the first match. Then explore the fund-flow view and ask the agent questions.",
    target: "submit",
  },
] as const;

function seen() {
  try {
    return localStorage.getItem(KEY) === "seen";
  } catch {
    return false;
  }
}

export function Tutorial({ ready }: { ready: boolean }) {
  const [open, setOpen] = useState(false);
  const [settled, setSettled] = useState(false);
  const [step, setStep] = useState(0);
  const replayRef = useRef<HTMLButtonElement>(null);
  const replaying = useRef(false);
  useEffect(() => {
    if (!ready) return;
    // Wait for the landing's chips and examples to settle.
    const timer = window.setTimeout(() => {
      setSettled(true);
      if (!seen()) setOpen(true);
    }, 950);
    return () => clearTimeout(timer);
  }, [ready]);
  function dismiss() {
    try {
      localStorage.setItem(KEY, "seen");
    } catch {
      /* Storage can be disabled; keep the page usable. */
    }
    setOpen(false);
  }
  return (
    <>
      {settled && (
        <button
          ref={replayRef}
          type="button"
          onClick={() => {
            replaying.current = true;
            setStep(0);
            setOpen(true);
          }}
          className="fixed top-5 right-5 z-10 flex items-center gap-1.5 rounded-full border border-glass-edge/70 bg-glass/70 px-3 py-2 text-[12px] text-ink-soft shadow-hairline backdrop-blur-md hover:bg-glass"
        >
          <CircleHelp className="size-3.5" />
          Tutorial
        </button>
      )}
      <Dialog.Root open={open} onOpenChange={(value) => !value && dismiss()}>
        {open && (
          <TourStep
            step={step}
            onBack={() => setStep(step - 1)}
            onNext={() => setStep(step + 1)}
            onDismiss={dismiss}
            onRestoreFocus={() => {
              if (replaying.current) replayRef.current?.focus();
              else
                document
                  .querySelector<HTMLInputElement>('[data-tour="search"]')
                  ?.focus({ preventScroll: true });
            }}
          />
        )}
      </Dialog.Root>
    </>
  );
}

function TourStep({
  step,
  onBack,
  onNext,
  onDismiss,
  onRestoreFocus,
}: {
  step: number;
  onBack: () => void;
  onNext: () => void;
  onDismiss: () => void;
  onRestoreFocus: () => void;
}) {
  const current = STEPS[step];
  const cardRef = useRef<HTMLDivElement>(null);
  const [layout, setLayout] = useState<{
    top: number;
    left: number;
    target: { top: number; left: number; width: number; height: number } | null;
  } | null>(null);
  useLayoutEffect(() => {
    const target = current.target
      ? document.querySelector<HTMLElement>(`[data-tour="${current.target}"]`)
      : null;
    function measure() {
      const width = Math.min(380, innerWidth - 32);
      const height = cardRef.current?.getBoundingClientRect().height ?? 280;
      const rect = target?.getBoundingClientRect();
      setLayout({
        left: Math.max(
          16,
          Math.min(
            innerWidth - width - 16,
            rect
              ? rect.left + rect.width / 2 - width / 2
              : (innerWidth - width) / 2,
          ),
        ),
        top: Math.max(
          16,
          Math.min(
            innerHeight - height - 16,
            rect ? rect.top - height - 24 : (innerHeight - height) / 2,
          ),
        ),
        target: rect
          ? {
              top: rect.top - 6,
              left: rect.left - 6,
              width: rect.width + 12,
              height: rect.height + 12,
            }
          : null,
      });
    }
    measure();
    const observer = new ResizeObserver(measure);
    if (target) observer.observe(target);
    if (cardRef.current) observer.observe(cardRef.current);
    window.addEventListener("resize", measure);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [current]);
  return (
    <Dialog.Portal>
      <Dialog.Overlay className="fixed inset-0 z-50 overflow-hidden">
        {layout?.target ? (
          <div
            aria-hidden
            className="pointer-events-none fixed rounded-2xl border-2 border-ion-400"
            style={{
              ...layout.target,
              boxShadow: "0 0 0 9999px rgb(0 0 0 / 0.48)",
            }}
          />
        ) : (
          <div className="absolute inset-0 bg-black/48" />
        )}
      </Dialog.Overlay>
      <Dialog.Content
        ref={cardRef}
        onPointerDownOutside={(event) => event.preventDefault()}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          onRestoreFocus();
        }}
        className="fixed z-50 max-h-[calc(100svh-32px)] w-[min(380px,calc(100vw-32px))] overflow-y-auto rounded-2xl border border-line bg-surface p-5 text-ink shadow-console outline-none"
        style={{ top: layout?.top ?? 16, left: layout?.left ?? 16 }}
      >
        <div aria-live="polite" aria-atomic="true">
          <p className="mb-3 text-[11px] font-medium tracking-wide text-muted">
            QUICK TOUR · {step + 1} OF {STEPS.length}
          </p>
          <Dialog.Title className="text-lg font-medium tracking-tight">
            {current.title}
          </Dialog.Title>
          <Dialog.Description className="mt-2 text-[13px] leading-relaxed text-ink-soft">
            {current.body}
          </Dialog.Description>
        </div>
        <div className="mt-5 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={onDismiss}
            className="rounded-full px-2 py-2 text-[13px] text-muted hover:text-ink"
          >
            Skip tour
          </button>
          <div className="flex items-center gap-2">
            {step > 0 && (
              <button
                type="button"
                onClick={onBack}
                className="rounded-full px-3 py-2 text-[13px] hover:bg-subtle"
              >
                Back
              </button>
            )}
            <button
              type="button"
              onClick={step === STEPS.length - 1 ? onDismiss : onNext}
              className="rounded-full bg-ink px-4 py-2 text-[13px] font-medium text-on-ink hover:bg-ink-soft"
            >
              {step === STEPS.length - 1 ? "Got it" : "Next"}
            </button>
          </div>
        </div>
      </Dialog.Content>
    </Dialog.Portal>
  );
}
