import { Eye, EyeOff, Settings2, X } from "lucide-react";
import { motion } from "motion/react";
import { Dialog, Tabs } from "radix-ui";
import { useState, type ReactNode } from "react";
import { CHAINS } from "@/lib/api";
import { CHAIN_META } from "@/lib/chains";
import {
  DEFAULT_SETTINGS,
  saveSettings,
  useSettings,
  type Effort,
} from "@/lib/settings";
import { cn } from "@/lib/utils";
import { ChainDot } from "./ChainPicker";

const EFFORTS: Effort[] = ["low", "medium", "high"];

function Field({
  label,
  hint,
  error,
  children,
}: {
  label: string;
  hint?: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[13px] font-medium text-ink">
        {label}
      </span>
      {children}
      <span
        className={cn(
          "mt-1.5 block text-[12px]",
          error ? "text-verified" : "text-muted",
        )}
      >
        {error ?? hint}
      </span>
    </label>
  );
}

const inputCls =
  "h-10 w-full rounded-xl border border-line bg-surface px-3 text-[14px] text-ink outline-none transition-[border-color,box-shadow] duration-150 placeholder:text-faint focus:border-ion-400 focus:shadow-focus";

// Chain + RPC + model configuration. Changes save as you type; everything
// is an override layer stored only in this browser.
export function SettingsDialog({ trigger }: { trigger?: ReactNode }) {
  const s = useSettings();
  const [showKey, setShowKey] = useState(false);
  const [tab, setTab] = useState<"network" | "model">("network");
  const rpcError =
    s.ensRpcUrl.trim() && !/^https:\/\/\S+$/.test(s.ensRpcUrl.trim())
      ? "Use an https:// URL."
      : undefined;

  return (
    <Dialog.Root>
      <Dialog.Trigger asChild>
        {trigger ?? (
          <button className="flex h-9 items-center gap-2 rounded-full px-3 text-[13px] font-medium text-ink-soft transition-colors duration-150 hover:bg-subtle">
            <Settings2 className="size-4" />
            <span className="hidden sm:inline">Settings</span>
          </button>
        )}
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-ink/20 backdrop-blur-[2px] data-[state=closed]:animate-[fade-out_150ms_ease-out] data-[state=open]:animate-[fade-in_250ms_ease-out]" />
        <Dialog.Content
          className={cn(
            "fixed top-1/2 left-1/2 z-50 w-[calc(100vw-32px)] max-w-[480px] -translate-x-1/2 -translate-y-1/2 rounded-[24px] bg-surface shadow-console outline-none",
            "data-[state=closed]:animate-[modal-out_150ms_var(--ease-smooth-out)] data-[state=open]:animate-[modal-in_250ms_var(--ease-smooth-out)]",
          )}
        >
          <div className="flex items-start justify-between px-6 pt-6">
            <div>
              <Dialog.Title className="text-[17px] font-medium tracking-[-0.01em]">
                Settings
              </Dialog.Title>
              <Dialog.Description className="mt-0.5 text-[13px] text-muted">
                Stored only in this browser. Empty fields use the service
                defaults.
              </Dialog.Description>
            </div>
            <Dialog.Close className="-mt-1 -mr-2 rounded-full p-2 text-faint transition-colors hover:bg-subtle hover:text-ink">
              <X className="size-4" />
              <span className="sr-only">Close</span>
            </Dialog.Close>
          </div>

          <Tabs.Root
            value={tab}
            onValueChange={(v) => setTab(v as typeof tab)}
            className="px-6 pt-5 pb-6"
          >
            <Tabs.List className="flex rounded-full bg-subtle p-1">
              {(["network", "model"] as const).map((t) => (
                <Tabs.Trigger
                  key={t}
                  value={t}
                  className="relative flex-1 rounded-full py-1.5 text-[13px] font-medium text-muted capitalize transition-colors duration-250 data-[state=active]:text-ink"
                >
                  {tab === t && <Pill id="settings-tab-pill" />}
                  <span className="relative">{t}</span>
                </Tabs.Trigger>
              ))}
            </Tabs.List>

            <Tabs.Content
              value="network"
              className="mt-5 space-y-5 outline-none"
            >
              <div>
                <span className="mb-2 block text-[13px] font-medium">
                  Chain
                </span>
                <div className="grid grid-cols-3 gap-2">
                  {CHAINS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => saveSettings({ chain: c })}
                      aria-pressed={s.chain === c}
                      className={cn(
                        "flex items-center gap-2 rounded-xl border px-3 py-2.5 text-left text-[13px] transition-all duration-150",
                        s.chain === c
                          ? "border-ion-600 bg-ion-50 text-ink shadow-[0_0_0_3px_rgb(47_91_255/0.1)]"
                          : "border-line text-ink-soft hover:border-line-strong",
                      )}
                    >
                      <ChainDot chain={c} />
                      {CHAIN_META[c].label}
                    </button>
                  ))}
                </div>
              </div>
              <Field
                label="Custom RPC"
                hint="Mainnet RPC for ENS resolution. Empty uses publicnode."
                error={rpcError}
              >
                <input
                  value={s.ensRpcUrl}
                  onChange={(e) => saveSettings({ ensRpcUrl: e.target.value })}
                  placeholder="https://your-mainnet-rpc.example"
                  spellCheck={false}
                  className={cn(
                    inputCls,
                    "font-mono text-[13px]",
                    rpcError && "border-verified",
                  )}
                />
              </Field>
            </Tabs.Content>

            <Tabs.Content value="model" className="mt-5 space-y-5 outline-none">
              <div className="flex items-center justify-between rounded-xl bg-subtle px-3.5 py-3">
                <div>
                  <p className="text-[13px] font-medium">
                    OpenAI-compatible endpoint
                  </p>
                  <p className="text-[12px] text-muted">
                    Responses API · base URL set on the server
                  </p>
                </div>
                <span className="rounded-full bg-surface px-2 py-0.5 text-[11px] font-medium text-muted shadow-hairline">
                  Server
                </span>
              </div>
              <Field
                label="API key"
                hint="Optional. Sent only with investigations; the service key is used otherwise."
              >
                <div className="relative">
                  <input
                    type={showKey ? "text" : "password"}
                    value={s.modelKey}
                    onChange={(e) => saveSettings({ modelKey: e.target.value })}
                    placeholder="sk-…"
                    autoComplete="off"
                    spellCheck={false}
                    className={cn(inputCls, "pr-10 font-mono text-[13px]")}
                  />
                  <button
                    type="button"
                    onClick={() => setShowKey((v) => !v)}
                    aria-label={showKey ? "Hide key" : "Show key"}
                    className="absolute top-1/2 right-2 -translate-y-1/2 rounded-md p-1.5 text-faint hover:text-ink"
                  >
                    {showKey ? (
                      <EyeOff className="size-4" />
                    ) : (
                      <Eye className="size-4" />
                    )}
                  </button>
                </div>
              </Field>
              <Field label="Model" hint="Empty uses the server default model.">
                <input
                  value={s.model}
                  onChange={(e) => saveSettings({ model: e.target.value })}
                  placeholder="muse-spark-1.3-contributor"
                  spellCheck={false}
                  className={cn(inputCls, "font-mono text-[13px]")}
                />
              </Field>
              <div>
                <span className="mb-2 block text-[13px] font-medium">
                  Reasoning effort
                </span>
                <div className="flex rounded-full bg-subtle p-1">
                  {EFFORTS.map((e) => (
                    <button
                      key={e}
                      type="button"
                      onClick={() => saveSettings({ effort: e })}
                      aria-pressed={s.effort === e}
                      className={cn(
                        "relative flex-1 rounded-full py-1.5 text-[13px] font-medium capitalize transition-colors duration-250",
                        s.effort === e ? "text-ink" : "text-muted",
                      )}
                    >
                      {s.effort === e && <Pill id="effort-pill" />}
                      <span className="relative">{e}</span>
                    </button>
                  ))}
                </div>
              </div>
            </Tabs.Content>

            <div className="mt-6 flex items-center justify-between border-t border-line pt-4">
              <button
                type="button"
                onClick={() => saveSettings({ ...DEFAULT_SETTINGS })}
                className="text-[13px] text-muted transition-colors hover:text-ink"
              >
                Reset to defaults
              </button>
              <Dialog.Close className="h-9 rounded-full bg-ink px-4 text-[13px] font-medium text-white transition-colors hover:bg-ink-soft">
                Done
              </Dialog.Close>
            </div>
          </Tabs.Root>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

// Sliding active pill (transitions.dev tabs-sliding, 250ms smooth-out).
function Pill({ id }: { id: string }) {
  return (
    <motion.span
      layoutId={id}
      transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
      className="absolute inset-0 rounded-full bg-surface shadow-card"
    />
  );
}
