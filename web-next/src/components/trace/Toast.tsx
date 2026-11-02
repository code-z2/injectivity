import { AnimatePresence, motion } from "motion/react";
import { useEffect } from "react";

// A quiet toast, bottom centre: one line and an optional action (Undo).
// Rises in with a soft blur, faster out than in (transitions.dev toast).
export interface ToastMessage {
  id: number;
  text: string;
  action?: { label: string; run: () => void };
}

const SHOW_MS = 5000;

export function Toast({
  toast,
  onDone,
}: {
  toast: ToastMessage | null;
  onDone: () => void;
}) {
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(onDone, SHOW_MS);
    return () => clearTimeout(t);
  }, [toast, onDone]);

  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 bottom-6 z-50 flex justify-center"
    >
      <AnimatePresence mode="wait">
        {toast && (
          <motion.div
            key={toast.id}
            initial={{ opacity: 0, y: 12, filter: "blur(2px)" }}
            animate={{
              opacity: 1,
              y: 0,
              filter: "blur(0px)",
              transition: { duration: 0.4, ease: [0.22, 1, 0.36, 1] },
            }}
            exit={{
              opacity: 0,
              y: 8,
              filter: "blur(2px)",
              transition: { duration: 0.25, ease: [0.22, 1, 0.36, 1] },
            }}
            className="pointer-events-auto flex h-10 items-center gap-3 rounded-full bg-ink pr-1.5 pl-4 text-[13px] text-white shadow-float"
          >
            {toast.text}
            {toast.action ? (
              <button
                onClick={() => {
                  toast.action?.run();
                  onDone();
                }}
                className="h-7 rounded-full bg-white/12 px-3 text-[12.5px] font-medium transition-colors hover:bg-white/20"
              >
                {toast.action.label}
              </button>
            ) : (
              <span className="w-2.5" />
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
