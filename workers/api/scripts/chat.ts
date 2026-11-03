// Talk to an agent session on a running worker (wrangler dev) over its
// WebSocket. Usage: bun run chat <root> "question" ["follow-up" …] [/report]
// Env: API (default http://localhost:8788), CHAIN (default ethereum).
const API = process.env.API ?? 'http://localhost:8788';
const CHAIN = process.env.CHAIN ?? 'ethereum';
const [root, ...questions] = process.argv.slice(2);
if (!root || !questions.length) {
  console.error('usage: bun run chat <root> "question" ["follow-up" …]');
  process.exit(1);
}

const res = await fetch(`${API}/v1/agent/sessions`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ chain: CHAIN, root }),
});
const { id, error } = (await res.json()) as { id?: string; error?: string };
if (!id) throw new Error(error ?? `session failed: http-${res.status}`);
console.error(`session ${id}`);

const ws = new WebSocket(`${API.replace(/^http/, 'ws')}/v1/agent/sessions/${id}`);
await new Promise((r, j) => {
  ws.onopen = r;
  ws.onerror = j;
});

const next = () =>
  new Promise<void>((resolve) => {
    ws.onmessage = (ev) => {
      const m = JSON.parse(String(ev.data));
      if (m.type === 'status') console.error(`· ${m.stage}`);
      else if (m.type === 'step' && m.step.type === 'tool_done' && !m.step.ok)
        console.error(`    (tool error)`);
      else if (m.type === 'step' && m.step.type === 'tool')
        console.error(`  → ${m.step.name} ${JSON.stringify(m.step.args)}`);
      else if (m.type === 'step' && m.step.type === 'search')
        console.error(`  search: ${m.step.results} results`);
      else if (m.type === 'answer') {
        console.log(`\n${m.entry.text}\n`);
        for (const s of m.sources) console.log(`[${s.id}] ${s.kind} · ${s.title}`);
        if (m.removed.length) console.log(`(verifier removed ${m.removed.length})`);
        resolve();
      } else if (m.type === 'report') {
        console.log(`\n[report ${m.reportId}] ${m.title} (verifier removed ${m.removed})`);
        console.log(`${API}/v1/reports/${m.reportId}`);
      } else if (m.type === 'memory') {
        console.log(
          `[memory] added ${m.added}, merged ${m.merged}, conflicts ${m.conflicts}, refused ${m.refused}`,
        );
        resolve();
      } else if (m.type === 'declined' || m.type === 'error') {
        console.log(`\n[${m.type}] ${m.entry?.text ?? m.error}\n`);
        resolve();
      }
    };
  });

ws.send(
  JSON.stringify({
    type: 'workspace',
    workspace: { chain: CHAIN, links: [{ address: root, role: 'attacker' }], active: root },
  }),
);
for (const q of questions) {
  console.error(`\n> ${q}`);
  const done = next();
  ws.send(JSON.stringify(q === '/report' ? { type: 'report' } : { type: 'ask', text: q }));
  await done;
}
ws.close();

export {};
