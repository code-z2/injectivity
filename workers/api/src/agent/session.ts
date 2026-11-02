// An investigation session: the conversation, its evidence ledger and the
// analyst's workspace. SessionCore holds the logic over a small store
// interface: SQLite in the Durable Object (durable.ts), memory in tests.
import { alchemyClient } from '@/alchemy';
import { checkScope } from '@/agent/gate';
import { curate } from '@/agent/memory/curator';
import { Ledger, type Source } from '@/agent/ledger';
import { type LoopEvent, runResearch } from '@/agent/loop';
import { RESEARCH_PROMPT, SCOPE_DECLINE } from '@/agent/prompts/research';
import {
  finalise,
  type ReportV2,
  SWEEP_PROMPT,
  writePostMortem,
  writerInput,
} from '@/agent/report';
import { Registry } from '@/agent/tools/registry';
import type { Workspace } from '@/agent/tools/types';
import type { Removed } from '@/agent/verify';
import { CHAIN_BASE } from '@/constants/chains';
import { adapterFor, type ModelConfig, type Msg } from '@/llm/adapters';
import { ConfigError, customModel, modelFor } from '@/llm/config';
import { probeModel } from '@/llm/probe';
import type { AlchemyClient, Env } from '@/types';

export interface Entry {
  role: 'user' | 'assistant';
  text: string;
  at: string;
  /** Assistant only: sources cited by the verified text. */
  sources?: string[];
  removed?: number;
  declined?: boolean;
  /** Assistant only: the report this entry announces. */
  reportId?: number;
}

export interface Meta {
  chain: string;
  root: string;
  createdAt: string;
}

export interface SessionState {
  meta: Meta | null;
  messages: Msg[];
  sources: Source[];
  transcript: Entry[];
  workspace: Workspace | null;
}

export interface SessionStore {
  load(): Promise<SessionState>;
  setMeta(meta: Meta): Promise<void>;
  setWorkspace(w: Workspace): Promise<void>;
  append(add: { messages?: Msg[]; sources?: Source[]; transcript?: Entry[] }): Promise<void>;
}

export type SessionEvent =
  | {
      type: 'status';
      stage: 'gate' | 'research' | 'verify' | 'sweep' | 'write' | 'save' | 'memory';
    }
  | { type: 'memory'; added: number; merged: number; conflicts: number; refused: number }
  | { type: 'step'; step: LoopEvent }
  | { type: 'answer'; entry: Entry; sources: Source[]; removed: Removed[] }
  | { type: 'declined'; entry: Entry }
  | { type: 'report'; entry: Entry; reportId: number; title: string; removed: number }
  | { type: 'error'; error: string };

export interface AskOptions {
  model?: { baseUrl?: string; model?: string; key?: string; effort?: string } | null;
  rpcUrl?: string;
  onEvent?: (e: SessionEvent) => void;
  signal?: AbortSignal;
}

/** Older tool results are trimmed in the prompt; their sources stay citable by ID. */
const KEEP_TOOL_CHARS = 1500;

export class SessionCore {
  private busy = false;
  private running: AbortController | null = null;

  constructor(
    private store: SessionStore,
    private env: Env,
    private client: AlchemyClient = alchemyClient,
    private fetchImpl: typeof fetch = fetch,
  ) {}

  async init(chain: string, root: string) {
    const state = await this.store.load();
    if (state.meta) return state.meta;
    const meta = { chain, root: root.toLowerCase(), createdAt: new Date().toISOString() };
    await this.store.setMeta(meta);
    await this.store.setWorkspace({
      chain,
      links: [{ address: meta.root, role: 'normal' }],
      active: meta.root,
    });
    return meta;
  }

  async state() {
    const s = await this.store.load();
    return { meta: s.meta, transcript: s.transcript, sources: s.sources, workspace: s.workspace };
  }

  async setWorkspace(w: Workspace) {
    if (!CHAIN_BASE[w.chain]) throw new ConfigError(`unsupported chain: ${w.chain}`);
    await this.store.setWorkspace({
      chain: w.chain,
      links: (w.links ?? []).slice(0, 50).map((l) => ({
        address: String(l.address).toLowerCase(),
        role: String(l.role ?? 'normal'),
        ...(l.label ? { label: String(l.label).slice(0, 120) } : {}),
      })),
      active: String(w.active ?? '').toLowerCase(),
      inspected: w.inspected ? String(w.inspected).toLowerCase() : null,
    });
  }

  async ask(text: string, opts: AskOptions = {}): Promise<void> {
    const question = text.trim().slice(0, 8000);
    if (!question) return opts.onEvent?.({ type: 'error', error: 'empty message' });
    return this.exclusive(opts, (emit) => this.answer(question, opts, emit));
  }

  /** Generate the post-mortem from this investigation. */
  async report(opts: AskOptions = {}): Promise<void> {
    return this.exclusive(opts, (emit) => this.writeReport(opts, emit));
  }

  private async exclusive(
    opts: AskOptions,
    run: (emit: (e: SessionEvent) => void) => Promise<void>,
  ) {
    const emit = opts.onEvent ?? (() => undefined);
    if (this.busy) return emit({ type: 'error', error: 'still working on the previous request' });
    this.busy = true;
    const controller = new AbortController();
    this.running = controller;
    opts.signal = opts.signal
      ? AbortSignal.any([opts.signal, controller.signal])
      : controller.signal;
    try {
      await run(emit);
    } catch (err) {
      const error = controller.signal.aborted
        ? 'stopped'
        : err instanceof Error
          ? err.message
          : 'unknown error';
      emit({ type: 'error', error });
    } finally {
      this.busy = false;
      this.running = null;
    }
  }

  /** Stop the answer or report in progress; nothing from it is stored. */
  stop() {
    this.running?.abort();
  }

  /** Research model and its capabilities, falling back to the server's when a custom one can't call tools. */
  private async researchModel(env: Env, custom: ModelConfig | null) {
    let cfg = modelFor(env, 'research', custom);
    if (!cfg) throw new Error('no model configured on the server');
    let caps = await probeModel(cfg, this.fetchImpl);
    if (custom && !caps.tools) {
      cfg = modelFor(env, 'research', null);
      if (!cfg) throw new Error('your model has no tool calling and the server has no model');
      caps = await probeModel(cfg, this.fetchImpl);
    }
    return { cfg, caps };
  }

  private async writeReport(opts: AskOptions, emit: (e: SessionEvent) => void) {
    const state = await this.store.load();
    if (!state.meta) throw new Error('session not initialised');
    const env = withRpc(this.env, opts.rpcUrl);
    const custom = customModel((n) => headerOf(opts.model, n));
    const { cfg, caps } = await this.researchModel(env, custom);
    const ledger = new Ledger(state.sources);
    const before = ledger.size;
    const ctx = {
      env,
      client: this.client,
      fetch: this.fetchImpl,
      workspace: state.workspace ?? undefined,
    };

    // 1. Close the gaps a post-mortem needs.
    emit({ type: 'status', stage: 'sweep' });
    await runResearch({
      adapter: adapterFor(cfg.baseUrl, this.fetchImpl),
      cfg,
      search: caps.search,
      system: RESEARCH_PROMPT,
      messages: [...trimHistory(state.messages), { role: 'user', text: SWEEP_PROMPT }],
      registry: new Registry(),
      ctx,
      ledger,
      budget: { toolCalls: 20, ms: 4 * 60_000 },
      onEvent: (step) => emit({ type: 'step', step }),
      signal: opts.signal,
    });

    // 2. Write it from the verified findings and the whole ledger.
    emit({ type: 'status', stage: 'write' });
    const writer = modelFor(env, 'writer', custom) ?? cfg;
    const w = state.workspace;
    const context = [
      `Chain: ${state.meta.chain}. Root address: ${state.meta.root}.`,
      w?.links.length
        ? `The analyst's address chain, root first: ${w.links.map((l) => `${l.address} (${l.role}${l.label ? `, ${l.label}` : ''})`).join(' → ')}.`
        : '',
      `Web search was ${caps.search ? 'available' : 'not available'} during research.`,
    ]
      .filter(Boolean)
      .join('\n');
    const findings = state.transcript
      .filter((e) => e.role === 'assistant' && !e.declined && !e.reportId && e.text)
      .map((e) => e.text);
    const draft = await writePostMortem({
      adapter: adapterFor(writer.baseUrl, this.fetchImpl),
      cfg: writer,
      input: writerInput(findings, ledger, context),
      signal: opts.signal,
    });

    // 3. Verify every field and keep only cited sources.
    emit({ type: 'status', stage: 'verify' });
    const { postMortem, sources, removed } = finalise(draft, ledger);

    emit({ type: 'status', stage: 'save' });
    const body: ReportV2 = {
      version: 2,
      chain: state.meta.chain,
      addresses: w?.links.map((l) => l.address) ?? [state.meta.root],
      postMortem,
      sources,
      meta: { model: writer.model, removed, generatedAt: now() },
    };
    const saved = (await this.env.DB.prepare(
      'INSERT INTO reports (title, body, created_at) VALUES (?,?,?)',
    )
      .bind(postMortem.title, JSON.stringify(body), now())
      .run()) as unknown as { meta?: { last_row_id?: number } };
    const reportId = saved.meta?.last_row_id;
    if (typeof reportId !== 'number') throw new Error('the report could not be saved');
    const entry: Entry = {
      role: 'assistant',
      text: `Report ready: ${postMortem.title}`,
      at: now(),
      reportId,
    };
    await this.store.append({ sources: ledger.all().slice(before), transcript: [entry] });
    emit({ type: 'report', entry, reportId, title: postMortem.title, removed });

    // 4. Keep what's worth remembering (best effort: the report stands either way).
    emit({ type: 'status', stage: 'memory' });
    try {
      const { outcomes, refused } = await curate({
        env: this.env,
        adapter: adapterFor(writer.baseUrl, this.fetchImpl),
        cfg: writer,
        report: body,
        reportId,
      });
      const n = (a: string) => outcomes.filter((o) => o.action === a).length;
      emit({
        type: 'memory',
        added: n('added'),
        merged: n('merged'),
        conflicts: n('conflict'),
        refused: refused.length,
      });
    } catch {
      emit({ type: 'memory', added: 0, merged: 0, conflicts: 0, refused: 0 });
    }
  }

  private async answer(question: string, opts: AskOptions, emit: (e: SessionEvent) => void) {
    const state = await this.store.load();
    if (!state.meta) throw new Error('session not initialised');
    const env = withRpc(this.env, opts.rpcUrl);
    const custom = customModel((n) => headerOf(opts.model, n));
    const userEntry: Entry = { role: 'user', text: question, at: now() };

    emit({ type: 'status', stage: 'gate' });
    const scope = await checkScope(
      modelFor(env, 'gate', null),
      question,
      recent(state.transcript),
      this.fetchImpl,
    );
    if (!scope.inScope) {
      const entry: Entry = { role: 'assistant', text: SCOPE_DECLINE, at: now(), declined: true };
      await this.store.append({ transcript: [userEntry, entry] });
      return emit({ type: 'declined', entry });
    }

    const { cfg, caps } = await this.researchModel(env, custom);

    emit({ type: 'status', stage: 'research' });
    const ledger = new Ledger(state.sources);
    const before = ledger.size;
    const history: Msg[] = [...trimHistory(state.messages), { role: 'user', text: question }];
    const result = await runResearch({
      adapter: adapterFor(cfg.baseUrl, this.fetchImpl),
      cfg,
      search: caps.search,
      system: RESEARCH_PROMPT,
      messages: history,
      registry: new Registry(),
      ctx: {
        env,
        client: this.client,
        fetch: this.fetchImpl,
        workspace: state.workspace ?? undefined,
      },
      ledger,
      onEvent: (step) => emit({ type: 'step', step }),
      signal: opts.signal,
    });

    emit({ type: 'status', stage: 'verify' });
    const entry: Entry = {
      role: 'assistant',
      text: result.text,
      at: now(),
      sources: result.used.map((s) => s.id),
      removed: result.removed.length,
    };
    // Store the new history after the trimmed prefix: the full model turn
    // stays for continuity, older tool output stays trimmed.
    const added = result.messages.slice(history.length - 1);
    await this.store.append({
      messages: added,
      sources: ledger.all().slice(before),
      transcript: [userEntry, entry],
    });
    emit({ type: 'answer', entry, sources: result.used, removed: result.removed });
  }
}

function trimHistory(messages: Msg[]): Msg[] {
  return messages.map((m) =>
    m.role === 'tool' && m.result.length > KEEP_TOOL_CHARS
      ? {
          ...m,
          result: `${m.result.slice(0, KEEP_TOOL_CHARS)}… (trimmed; its sources stay citable by ID)`,
        }
      : m,
  );
}

function recent(transcript: Entry[]): string {
  return transcript
    .slice(-4)
    .map((e) => `${e.role}: ${e.text.slice(0, 400)}`)
    .join('\n');
}

function headerOf(model: AskOptions['model'], name: string): string | undefined {
  if (!model) return undefined;
  const map: Record<string, unknown> = {
    'x-llm-base-url': model.baseUrl,
    'x-llm-model': model.model,
    'x-llm-key': model.key,
    'x-llm-effort': model.effort,
  };
  const v = map[name];
  return typeof v === 'string' ? v : undefined;
}

function withRpc(env: Env, rpcUrl?: string): Env {
  if (!rpcUrl) return env;
  let url: URL;
  try {
    url = new URL(rpcUrl);
  } catch {
    throw new ConfigError('rpcUrl must be a valid https URL');
  }
  if (url.protocol !== 'https:') throw new ConfigError('rpcUrl must be a valid https URL');
  return {
    ...env,
    RPC_URLS: JSON.stringify(Object.fromEntries(Object.keys(CHAIN_BASE).map((k) => [k, url.href]))),
  };
}

const now = () => new Date().toISOString();
