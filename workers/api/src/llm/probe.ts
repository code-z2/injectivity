// What a configured model can actually do, found by trying it rather than
// asking the user: tool calling, built-in search alongside tools (what the
// research loop needs), and whether it accepts a reasoning effort. Results
// are cached per isolate by (base URL, model).
import { adapterFor, adapterKind, type ModelConfig, ModelError } from '@/llm/adapters';
import { chatHasSearch } from '@/llm/adapters/chat';

export interface Capabilities {
  adapter: ReturnType<typeof adapterKind>;
  tools: boolean;
  search: boolean;
  effort: boolean;
  error?: string;
}

const cache = new Map<string, Promise<Capabilities>>();

const PING = {
  name: 'ping',
  description: 'Connectivity check. Call it with value "ok".',
  parameters: {
    type: 'object',
    properties: { value: { type: 'string' } },
    required: ['value'],
    additionalProperties: false,
  },
};

export function probeModel(
  cfg: ModelConfig,
  fetchImpl: typeof fetch = fetch,
): Promise<Capabilities> {
  const key = `${cfg.baseUrl}|${cfg.model}|${cfg.effort ?? ''}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const p = runProbe(cfg, fetchImpl);
  cache.set(key, p);
  // A failed probe (bad key, outage) shouldn't stick.
  void p.then((c) => c.error && cache.delete(key));
  return p;
}

async function runProbe(cfg: ModelConfig, fetchImpl: typeof fetch): Promise<Capabilities> {
  const adapter = adapterFor(cfg.baseUrl, fetchImpl);
  const caps: Capabilities = { adapter: adapter.kind, tools: false, search: false, effort: false };
  const signal = () => AbortSignal.timeout(45_000);
  const ask = { role: 'user' as const, text: 'Call the ping tool with value "ok".' };

  // 1. Tools, with effort; on rejection retry without effort.
  let effortCfg: ModelConfig = cfg;
  try {
    const t = await adapter.run(effortCfg, {
      system: 'You are a connectivity check.',
      messages: [ask],
      tools: [PING],
      maxTokens: 2048,
      signal: signal(),
    });
    caps.tools = t.toolCalls.some((c) => c.name === 'ping');
    caps.effort = Boolean(cfg.effort);
  } catch (err) {
    if (!cfg.effort || !(err instanceof ModelError) || err.status !== 400) {
      caps.error = err instanceof Error ? err.message : 'probe failed';
      return caps;
    }
    effortCfg = { ...cfg, effort: undefined };
    try {
      const t = await adapter.run(effortCfg, {
        system: 'You are a connectivity check.',
        messages: [ask],
        tools: [PING],
        maxTokens: 2048,
        signal: signal(),
      });
      caps.tools = t.toolCalls.some((c) => c.name === 'ping');
    } catch (err2) {
      caps.error = err2 instanceof Error ? err2.message : 'probe failed';
      return caps;
    }
  }

  // 2. Search alongside tools. Gemini can't combine them; plain Chat
  // Completions hosts have no search except OpenRouter.
  const searchable =
    caps.tools &&
    adapter.kind !== 'gemini' &&
    (adapter.kind !== 'chat' || chatHasSearch(cfg.baseUrl));
  if (searchable) {
    try {
      await adapter.run(effortCfg, {
        system: 'You are a connectivity check. Answer in five words or fewer.',
        messages: [{ role: 'user', text: 'Search the web: what is etherscan.io?' }],
        tools: [PING],
        search: true,
        maxTokens: 2048,
        signal: signal(),
      });
      // Accepted with search on. Citations depend on whether it chose to search.
      caps.search = true;
    } catch (err) {
      // Only a rejected request means no search; a reply cut short or a
      // slow one still accepted the search tool.
      caps.search = !(err instanceof ModelError && err.status >= 400 && err.status < 500);
    }
  }
  return caps;
}
