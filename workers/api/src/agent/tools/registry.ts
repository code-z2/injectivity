// Tool registry: runs a model's tool call, files each item's source in the
// ledger, and returns what the model sees, every item tagged with its
// source ID. Errors come back as text so the model can adjust.
import type { Ledger } from '@/agent/ledger';
import type { ToolCall, ToolSpec } from '@/llm/adapters';
import { getBalances, getContract, getTransaction, getTransfers, traceFundsTool } from './chain';
import { readPage, readPdf } from './docs';
import { lookupLabels, searchExploits, workspace } from './local';
import { recall } from './memory';
import { type Tool, type ToolContext, ToolError } from './types';

export const RESEARCH_TOOLS: Tool[] = [
  workspace,
  recall,
  getTransfers,
  getTransaction,
  getBalances,
  getContract,
  traceFundsTool,
  lookupLabels,
  searchExploits,
  readPdf,
  readPage,
];

export class Registry {
  private byName: Map<string, Tool>;
  constructor(tools: Tool[] = RESEARCH_TOOLS) {
    this.byName = new Map(tools.map((t) => [t.spec.name, t]));
  }

  specs(): ToolSpec[] {
    return [...this.byName.values()].map((t) => t.spec);
  }

  register(tool: Tool) {
    this.byName.set(tool.spec.name, tool);
  }

  async run(
    call: ToolCall,
    ctx: ToolContext,
    ledger: Ledger,
  ): Promise<{ result: string; ok: boolean }> {
    const tool = this.byName.get(call.name);
    if (!tool)
      return { result: JSON.stringify({ error: `unknown tool: ${call.name}` }), ok: false };
    try {
      const out = await tool.run(ctx, call.args ?? {});
      const items = out.items.map((i) => (i.src ? { src: ledger.add(i.src), ...i.data } : i.data));
      return {
        result: JSON.stringify({ items, ...(out.note ? { note: out.note } : {}) }),
        ok: true,
      };
    } catch (err) {
      const message =
        err instanceof ToolError
          ? err.message
          : `tool failed: ${err instanceof Error ? err.message : 'unknown'}`;
      return { result: JSON.stringify({ error: message }), ok: false };
    }
  }
}
