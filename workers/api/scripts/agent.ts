// Run the research loop from the command line against the local D1 file
// (after `bun run migrate && bun run seed`) and the keys in .dev.vars.
// Usage: bun run agent "question" [rootAddress] [chain]
import { alchemyClient } from '@/alchemy';
import { Ledger } from '@/agent/ledger';
import { runResearch } from '@/agent/loop';
import { RESEARCH_PROMPT } from '@/agent/prompts/research';
import { Registry } from '@/agent/tools/registry';
import { adapterFor } from '@/llm/adapters';
import { serverModel } from '@/llm/config';
import { probeModel } from '@/llm/probe';
import type { Env } from '@/types';
import { devVars, localD1 } from './local';

const [question, root, chain = 'ethereum'] = process.argv.slice(2);
if (!question) {
  console.error('usage: bun run agent "question" [rootAddress] [chain]');
  process.exit(1);
}

const vars = devVars();

const env = { ...vars, DB: localD1() } as unknown as Env;
const cfg = serverModel(env, 'research');
if (!cfg) throw new Error('MODEL_API_KEY missing from .dev.vars');
const caps = await probeModel(cfg);
console.error(`model ${cfg.model} (${caps.adapter}): tools ${caps.tools}, search ${caps.search}`);

const ledger = new Ledger();
const t0 = Date.now();
const r = await runResearch({
  adapter: adapterFor(cfg.baseUrl),
  cfg,
  search: caps.search,
  system: RESEARCH_PROMPT,
  messages: [{ role: 'user', text: question }],
  registry: new Registry(),
  ctx: {
    env,
    client: alchemyClient,
    fetch,
    workspace: root
      ? {
          chain,
          links: [{ address: root.toLowerCase(), role: 'attacker' }],
          active: root.toLowerCase(),
        }
      : undefined,
  },
  ledger,
  onEvent: (e) => {
    if (e.type === 'tool') console.error(`→ ${e.name} ${JSON.stringify(e.args)}`);
    else if (e.type === 'tool_done')
      console.error(`  ${e.ok ? 'ok' : 'error'}, +${e.sources} sources`);
    else if (e.type === 'search') console.error(`  search: ${e.results} results`);
  },
});
console.error(
  `\n${r.toolCalls} tool calls, ${ledger.size} sources, ${r.usage.input}/${r.usage.output} tokens, ${Math.round((Date.now() - t0) / 1000)}s${r.budgetHit ? ', budget hit' : ''}`,
);
console.log(`\n${r.text}\n`);
for (const s of r.used)
  console.log(`[${s.id}] ${s.kind} · ${s.title}${s.url ? ` · ${s.url}` : ''}`);
if (r.removed.length) {
  console.log(`\nRemoved by the verifier (${r.removed.length}):`);
  for (const x of r.removed) console.log(`- ${x.reason}: ${x.sentence.slice(0, 160)}`);
}
