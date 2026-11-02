// The research loop: model ↔ tools until the model answers or the budget
// runs out, then one last turn without tools to answer from what it has.
// Built-in search results are filed in the ledger as web sources as they
// arrive. The raw answer goes through the verifier before anyone sees it.
import type { Ledger } from '@/agent/ledger';
import type { Registry } from '@/agent/tools/registry';
import type { ToolContext } from '@/agent/tools/types';
import { verifyText, type Verified } from '@/agent/verify';
import type { ModelAdapter, ModelConfig, ModelTurn, Msg } from '@/llm/adapters';

export interface Budget {
  toolCalls: number;
  ms: number;
}

export const TURN_BUDGET: Budget = { toolCalls: 25, ms: 4 * 60_000 };

export type LoopEvent =
  | { type: 'tool'; name: string; args: Record<string, unknown> }
  | { type: 'tool_done'; name: string; ok: boolean; sources: number }
  | { type: 'search'; results: number }
  | { type: 'thinking' };

export interface LoopResult extends Verified {
  /** The history including this turn (raw model text kept for continuity). */
  messages: Msg[];
  toolCalls: number;
  usage: { input: number; output: number };
  budgetHit: boolean;
}

export async function runResearch(opts: {
  adapter: ModelAdapter;
  cfg: ModelConfig;
  search: boolean;
  system: string;
  messages: Msg[];
  registry: Registry;
  ctx: ToolContext;
  ledger: Ledger;
  budget?: Budget;
  onEvent?: (e: LoopEvent) => void;
  signal?: AbortSignal;
}): Promise<LoopResult> {
  const budget = opts.budget ?? TURN_BUDGET;
  const deadline = Date.now() + budget.ms;
  const messages = [...opts.messages];
  const usage = { input: 0, output: 0 };
  let calls = 0;
  let budgetHit = false;
  let final: ModelTurn | null = null;

  const take = (t: ModelTurn) => {
    usage.input += t.usage.input;
    usage.output += t.usage.output;
    for (const c of t.citations)
      opts.ledger.add({
        kind: 'web',
        ref: c.url,
        title: c.title,
        excerpt: c.quote ?? c.title,
        url: c.url,
      });
    if (t.citations.length) opts.onEvent?.({ type: 'search', results: t.citations.length });
    messages.push(t.message);
  };

  while (!final) {
    if (calls >= budget.toolCalls || Date.now() > deadline) {
      budgetHit = true;
      break;
    }
    opts.onEvent?.({ type: 'thinking' });
    const turn = await opts.adapter.run(opts.cfg, {
      system: opts.system,
      messages,
      tools: opts.registry.specs(),
      search: opts.search,
      maxTokens: 8000,
      signal: opts.signal,
    });
    take(turn);
    if (!turn.toolCalls.length) {
      final = turn;
      break;
    }
    for (const call of turn.toolCalls) {
      if (calls >= budget.toolCalls) {
        messages.push({
          role: 'tool',
          callId: call.id,
          name: call.name,
          result: '{"error":"tool budget reached"}',
        });
        continue;
      }
      calls++;
      opts.onEvent?.({ type: 'tool', name: call.name, args: call.args });
      const before = opts.ledger.size;
      const r = await opts.registry.run(call, opts.ctx, opts.ledger);
      opts.onEvent?.({
        type: 'tool_done',
        name: call.name,
        ok: r.ok,
        sources: opts.ledger.size - before,
      });
      messages.push({ role: 'tool', callId: call.id, name: call.name, result: r.result });
    }
  }

  if (!final) {
    messages.push({
      role: 'user',
      text: 'Research budget reached. Answer now from the evidence gathered so far, and state plainly what was not covered.',
    });
    final = await opts.adapter.run(opts.cfg, {
      system: opts.system,
      messages,
      maxTokens: 8000,
      signal: opts.signal,
    });
    take(final);
  }

  return { ...verifyText(final.text, opts.ledger), messages, toolCalls: calls, usage, budgetHit };
}
