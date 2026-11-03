import { BorderBeam } from "border-beam";
import { ArrowUp, FileText } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useRef, useState } from "react";
import { useAutoResizeTextarea } from "@/hooks/use-auto-resize-textarea";
import { cn } from "@/lib/utils";

// The agent composer, after the libraries.dev Border Beam chat input: a
// soft card with the field on top and a row of controls under it
// (Generate report on the left, the round Ask button on the right), with
// the beam riding its border the whole time. While the agent works the Ask
// button turns into Stop.

const EASE = [0.23, 1, 0.32, 1] as const;

export function Composer({
  placeholder,
  disabled,
  running,
  canGenerate,
  generating,
  onAsk,
  onStop,
  onGenerate,
}: {
  placeholder: string;
  disabled: boolean;
  running: boolean;
  canGenerate: boolean;
  generating: boolean;
  onAsk: (text: string) => void;
  onStop: () => void;
  onGenerate: () => void;
}) {
  const [value, setValue] = useState("");
  const { textareaRef, adjustHeight } = useAutoResizeTextarea({
    minHeight: 40,
    maxHeight: 160,
  });
  const frame = useRef<HTMLDivElement>(null);
  const canAsk = value.trim().length > 0 && !running && !disabled;

  const submit = () => {
    if (!canAsk) return;
    onAsk(value.trim());
    setValue("");
    adjustHeight(true);
  };

  return (
    <BorderBeam
      borderRadius={20}
      colorVariant="colorful"
      size="md"
      strength={0.85}
      theme="light"
    >
      {/* biome-ignore lint/a11y/useKeyWithClickEvents lint/a11y/noStaticElementInteractions: pointer shortcut to focus the field; the field and buttons are keyboard reachable */}
      <div
        className="cursor-text rounded-[20px] bg-white px-2 pt-1.5 pb-2 shadow-[inset_0_0_0_1px_rgb(11_13_18/0.08),0_1px_2px_rgb(11_13_18/0.04)]"
        onClick={(e) => {
          if (!(e.target as Element).closest("button"))
            textareaRef.current?.focus();
        }}
        ref={frame}
      >
        <textarea
          aria-label="Message"
          className="block w-full resize-none bg-transparent px-2 pt-2 pb-1 text-[13px] leading-5 text-ink outline-none placeholder:text-faint disabled:cursor-not-allowed"
          disabled={disabled}
          onChange={(e) => {
            setValue(e.target.value);
            adjustHeight();
          }}
          onKeyDown={(e) => {
            if (e.nativeEvent.isComposing) return;
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              submit();
            } else if (e.key === "Escape" && running) {
              e.preventDefault();
              onStop();
            }
          }}
          placeholder={placeholder}
          ref={textareaRef}
          rows={1}
          value={value}
        />
        <div className="mt-1 flex items-center gap-2">
          <button
            className={cn(
              "flex h-6 items-center gap-1 rounded-full pr-2 pl-1.5 text-[12px] transition-colors",
              "shadow-[inset_0_0_0_1px_rgb(11_13_18/0.06),inset_0_1px_0_rgb(255_255_255/0.6)]",
              canGenerate && !running
                ? "bg-subtle text-ink-soft hover:bg-line hover:text-ink"
                : "bg-subtle/60 text-faint",
            )}
            disabled={!canGenerate || running}
            onClick={onGenerate}
            type="button"
          >
            <FileText className="size-3.5" />
            {generating ? "Generating report…" : "Generate report"}
          </button>
          <div className="flex-1" />
          <button
            aria-label={running ? "Stop" : "Ask"}
            className={cn(
              "flex size-7 items-center justify-center rounded-full transition-colors",
              running || canAsk
                ? "bg-ink text-white hover:bg-ink-soft"
                : "bg-subtle text-faint shadow-[inset_0_0_0_1px_rgb(11_13_18/0.06)]",
            )}
            disabled={!running && !canAsk}
            onClick={running ? onStop : submit}
            type="button"
          >
            <AnimatePresence initial={false} mode="popLayout">
              <motion.span
                animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
                exit={{ opacity: 0, scale: 0.6, filter: "blur(2px)" }}
                initial={{ opacity: 0, scale: 0.6, filter: "blur(2px)" }}
                key={running ? "stop" : "ask"}
                transition={{ duration: 0.16, ease: EASE }}
              >
                {running ? (
                  <span className="block size-2 rounded-[2px] bg-current" />
                ) : (
                  <ArrowUp className="size-3.5" strokeWidth={2.25} />
                )}
              </motion.span>
            </AnimatePresence>
          </button>
        </div>
      </div>
    </BorderBeam>
  );
}
