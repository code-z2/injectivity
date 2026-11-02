// Agent tool contract. A tool returns items, each with the source it rests
// on; the registry files the sources in the ledger and shows the model
// each item tagged with its source ID.
import type { SourceInput } from '@/agent/ledger';
import type { ToolSpec } from '@/llm/adapters';
import type { AlchemyClient, Env } from '@/types';

export interface Workspace {
  chain: string;
  /** The user's address chain, root first. */
  links: { address: string; role: string; label?: string }[];
  active: string;
  inspected?: string | null;
}

export interface ToolContext {
  env: Env;
  client: AlchemyClient;
  fetch: typeof fetch;
  workspace?: Workspace;
}

export interface ToolItem {
  src: SourceInput | null;
  data: Record<string, unknown>;
}

export interface ToolOutput {
  items: ToolItem[];
  /** Coverage or limits the model should state (e.g. "showing 50 of 212"). */
  note?: string;
}

export interface Tool {
  spec: ToolSpec;
  run(ctx: ToolContext, args: Record<string, unknown>): Promise<ToolOutput>;
}

export class ToolError extends Error {}

export const str = (v: unknown, name: string): string => {
  if (typeof v !== 'string' || !v.trim()) throw new ToolError(`${name} is required`);
  return v.trim();
};

export const addr = (v: unknown, name = 'address'): string => {
  const s = str(v, name).toLowerCase();
  if (!/^0x[0-9a-f]{40}$/.test(s)) throw new ToolError(`${name} must be a 0x address`);
  return s;
};

export const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;
