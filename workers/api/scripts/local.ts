// Local helpers for scripts: .dev.vars and the local D1 file (after
// `bun run migrate && bun run seed`), outside wrangler.
import { Database } from 'bun:sqlite';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export function devVars(): Record<string, string> {
  return Object.fromEntries(
    readFileSync('.dev.vars', 'utf8')
      .split('\n')
      .filter((l) => l.includes('='))
      .map((l) => {
        const i = l.indexOf('=');
        return [
          l.slice(0, i).trim(),
          l
            .slice(i + 1)
            .trim()
            .replace(/^"|"$/g, ''),
        ];
      }),
  );
}

export function localD1(): D1Database {
  const dir = '.wrangler/state/v3/d1/miniflare-D1DatabaseObject';
  const file = readdirSync(dir)
    .filter((f) => f.endsWith('.sqlite'))
    .map((f) => join(dir, f))
    .find((f) => {
      try {
        const db = new Database(f);
        const ok = db.query("SELECT 1 FROM sqlite_master WHERE name = 'exploits'").get();
        db.close();
        return ok;
      } catch {
        return false;
      }
    });
  if (!file) throw new Error('no local D1 with the agent tables: run migrations first');
  const db = new Database(file);
  const prep = (sql: string, p: unknown[] = []) => ({
    bind: (...b: unknown[]) => prep(sql, b),
    all: async () => ({ results: db.query(sql).all(...(p as [])) }),
    first: async () => db.query(sql).get(...(p as [])) ?? null,
    run: async () => {
      const r = db.query(sql).run(...(p as []));
      return { success: true, meta: { last_row_id: Number(r.lastInsertRowid) } };
    },
  });
  return {
    prepare: (sql: string) => prep(sql),
    batch: async (stmts: { run(): Promise<unknown> }[]) => Promise.all(stmts.map((s) => s.run())),
  } as unknown as D1Database;
}
