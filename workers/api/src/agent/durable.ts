// The Investigation Durable Object: one per investigation, serving its
// SessionCore over a WebSocket with SQLite storage.
//
// Frames, client → server (JSON):
//   { type: 'hello' }                         → state
//   { type: 'workspace', workspace }          → ok
//   { type: 'ask', text, model?, rpcUrl? }    → status / step… then answer | declined | error
//   { type: 'report', model?, rpcUrl? }       → status / step… then report { reportId } | error
// model is the visitor's custom model { baseUrl, model, key, effort? }; it
// rides on each ask and is never stored.
import { DurableObject } from 'cloudflare:workers';
import type { Source } from '@/agent/ledger';
import {
  type AskOptions,
  type Entry,
  type Meta,
  SessionCore,
  type SessionState,
  type SessionStore,
} from '@/agent/session';
import type { Workspace } from '@/agent/tools/types';
import type { Msg } from '@/llm/adapters';
import type { Env } from '@/types';

/** SQLite-backed store: one row per message and source (rows may be large). */
class SqlStore implements SessionStore {
  constructor(private storage: DurableObjectStorage) {
    storage.sql.exec(`CREATE TABLE IF NOT EXISTS kv (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS messages (seq INTEGER PRIMARY KEY AUTOINCREMENT, json TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS sources (seq INTEGER PRIMARY KEY AUTOINCREMENT, json TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS transcript (seq INTEGER PRIMARY KEY AUTOINCREMENT, json TEXT NOT NULL);`);
  }

  private rows<T>(table: string): T[] {
    return [...this.storage.sql.exec(`SELECT json FROM ${table} ORDER BY seq`)].map(
      (r) => JSON.parse(String(r.json)) as T,
    );
  }

  private kv<T>(key: string): T | null {
    const r = [...this.storage.sql.exec('SELECT value FROM kv WHERE key = ?', key)][0];
    return r ? (JSON.parse(String(r.value)) as T) : null;
  }

  async load(): Promise<SessionState> {
    return {
      meta: this.kv<Meta>('meta'),
      workspace: this.kv<Workspace>('workspace'),
      messages: this.rows<Msg>('messages'),
      sources: this.rows<Source>('sources'),
      transcript: this.rows<Entry>('transcript'),
    };
  }

  async setMeta(meta: Meta) {
    this.storage.sql.exec(
      'INSERT OR REPLACE INTO kv (key, value) VALUES (?, ?)',
      'meta',
      JSON.stringify(meta),
    );
  }

  async setWorkspace(w: Workspace) {
    this.storage.sql.exec(
      'INSERT OR REPLACE INTO kv (key, value) VALUES (?, ?)',
      'workspace',
      JSON.stringify(w),
    );
  }

  async append(add: { messages?: Msg[]; sources?: Source[]; transcript?: Entry[] }) {
    this.storage.transactionSync(() => {
      for (const [table, list] of [
        ['messages', add.messages],
        ['sources', add.sources],
        ['transcript', add.transcript],
      ] as const)
        for (const item of list ?? [])
          this.storage.sql.exec(`INSERT INTO ${table} (json) VALUES (?)`, JSON.stringify(item));
    });
  }
}

export class Investigation extends DurableObject<Env> {
  private core: SessionCore;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.core = new SessionCore(new SqlStore(ctx.storage), env);
  }

  async fetch(req: Request): Promise<Response> {
    const url = new URL(req.url);
    if (url.pathname.endsWith('/init') && req.method === 'POST') {
      const body = (await req.json()) as { chain: string; root: string };
      return Response.json(await this.core.init(body.chain, body.root));
    }
    if (url.pathname.endsWith('/state')) return Response.json(await this.core.state());
    if (req.headers.get('upgrade') !== 'websocket')
      return new Response('expected a websocket', { status: 426 });
    const pair = new WebSocketPair();
    this.ctx.acceptWebSocket(pair[1]);
    return new Response(null, { status: 101, webSocket: pair[0] });
  }

  async webSocketMessage(ws: WebSocket, raw: string | ArrayBuffer) {
    const send = (data: unknown) => {
      try {
        ws.send(JSON.stringify(data));
      } catch {
        // Socket closed mid-answer; the answer is still stored.
      }
    };
    let msg: { type?: string; text?: string; workspace?: Workspace } & AskOptions;
    try {
      msg = JSON.parse(typeof raw === 'string' ? raw : new TextDecoder().decode(raw));
    } catch {
      return send({ type: 'error', error: 'frames must be JSON' });
    }
    try {
      if (msg.type === 'hello') return send({ type: 'state', ...(await this.core.state()) });
      if (msg.type === 'workspace' && msg.workspace) {
        await this.core.setWorkspace(msg.workspace);
        return send({ type: 'ok' });
      }
      if (msg.type === 'report')
        return await this.core.report({ model: msg.model, rpcUrl: msg.rpcUrl, onEvent: send });
      if (msg.type === 'ask')
        return await this.core.ask(String(msg.text ?? ''), {
          model: msg.model,
          rpcUrl: msg.rpcUrl,
          onEvent: send,
        });
      send({ type: 'error', error: `unknown frame type: ${msg.type}` });
    } catch (err) {
      send({ type: 'error', error: err instanceof Error ? err.message : 'unknown error' });
    }
  }

  async webSocketClose(ws: WebSocket, code: number) {
    try {
      ws.close(code, 'closing');
    } catch {
      // Already closed.
    }
  }
}
