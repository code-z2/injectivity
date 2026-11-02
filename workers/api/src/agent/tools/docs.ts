// read_pdf: fetch a PDF (audit, post-mortem, court filing) and return its
// text page by page, each page citable. Results are cached for a week.
import { extractText, getDocumentProxy } from 'unpdf';
import { str, type Tool, ToolError, type ToolItem } from './types';

const MAX_BYTES = 15 * 1024 * 1024;
const PAGE_CHARS = 3000;
const WEEK_MS = 7 * 24 * 3600 * 1000;

export const readPdf: Tool = {
  spec: {
    name: 'read_pdf',
    description:
      'Read a PDF by URL (audit report, post-mortem, filing). Returns the text of up to 6 pages (default the first 6); pass pages like "7-12" for more.',
    parameters: {
      type: 'object',
      properties: { url: { type: 'string' }, pages: { type: 'string' } },
      required: ['url'],
    },
  },
  async run(ctx, args) {
    const url = str(args.url, 'url');
    let u: URL;
    try {
      u = new URL(url);
    } catch {
      throw new ToolError('url must be a valid https URL');
    }
    if (u.protocol !== 'https:') throw new ToolError('url must be a valid https URL');
    const [from, to] = pageRange(args.pages);

    const pages = await loadPages(ctx.env.DB, ctx.fetch, u.href);
    const items: ToolItem[] = [];
    for (let p = from; p <= Math.min(to, pages.length); p++) {
      const text = pages[p - 1]!.replace(/\s+/g, ' ').trim();
      if (!text) continue;
      const excerpt = text.length > PAGE_CHARS ? `${text.slice(0, PAGE_CHARS)}…` : text;
      items.push({
        src: {
          kind: 'document',
          ref: u.href,
          title: `${u.hostname} PDF, page ${p}`,
          excerpt,
          url: u.href,
          page: p,
        },
        data: { page: p, text: excerpt },
      });
    }
    return {
      items,
      note: `${pages.length} pages in the document; returned ${from}-${Math.min(to, pages.length)}`,
    };
  },
};

function pageRange(v: unknown): [number, number] {
  const m = typeof v === 'string' ? /^(\d+)(?:\s*-\s*(\d+))?$/.exec(v.trim()) : null;
  const from = m ? Math.max(1, Number(m[1])) : 1;
  const to = m?.[2] ? Number(m[2]) : m ? from : 6;
  return [from, Math.min(Math.max(to, from), from + 5)];
}

async function loadPages(db: D1Database, fetchImpl: typeof fetch, url: string): Promise<string[]> {
  const key = `pdf:${url}`;
  try {
    const hit = await db
      .prepare('SELECT body FROM tool_cache WHERE key = ? AND expires_at > ?')
      .bind(key, new Date().toISOString())
      .first<{ body: string }>();
    if (hit) return JSON.parse(hit.body) as string[];
  } catch {
    // No cache table yet: read live.
  }
  const res = await fetchImpl(url, { signal: AbortSignal.timeout(30_000) });
  if (!res.ok) throw new ToolError(`could not fetch the PDF (http-${res.status})`);
  const buf = new Uint8Array(await res.arrayBuffer());
  if (buf.byteLength > MAX_BYTES) throw new ToolError('PDF is larger than 15 MB');
  let pages: string[];
  try {
    const pdf = await getDocumentProxy(buf);
    pages = (await extractText(pdf, { mergePages: false })).text as string[];
  } catch {
    throw new ToolError('not a readable PDF');
  }
  try {
    await db
      .prepare('INSERT OR REPLACE INTO tool_cache (key, body, expires_at) VALUES (?,?,?)')
      .bind(key, JSON.stringify(pages), new Date(Date.now() + WEEK_MS).toISOString())
      .run();
  } catch {
    // Caching is best-effort.
  }
  return pages;
}

const PAGE_TEXT_MAX = 400_000;
const CHUNK = 1500;

export const readPage: Tool = {
  spec: {
    name: 'read_page',
    description:
      'Read a web page by URL (e.g. a search result) as plain text, so its facts can be cited. Pass `find` to get the passages around a word or figure; otherwise the opening passages. PDFs: use read_pdf.',
    parameters: {
      type: 'object',
      properties: { url: { type: 'string' }, find: { type: 'string' } },
      required: ['url'],
    },
  },
  async run(ctx, args) {
    const url = str(args.url, 'url');
    let u: URL;
    try {
      u = new URL(url);
    } catch {
      throw new ToolError('url must be a valid https URL');
    }
    if (u.protocol !== 'https:') throw new ToolError('url must be a valid https URL');
    const res = await ctx.fetch(u.href, {
      headers: { accept: 'text/html,text/plain;q=0.9', 'user-agent': 'intel-terminal-agent/1' },
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) throw new ToolError(`could not fetch the page (http-${res.status})`);
    const type = res.headers.get('content-type') ?? '';
    if (type.includes('pdf')) throw new ToolError('this is a PDF: use read_pdf');
    const html = (await res.text()).slice(0, PAGE_TEXT_MAX);
    const title = /<title[^>]*>([^<]*)<\/title>/i.exec(html)?.[1]?.trim() || u.hostname;
    const text = htmlToText(html);
    const find = typeof args.find === 'string' ? args.find.trim().toLowerCase() : '';
    const starts: number[] = [];
    if (find) {
      let i = text.toLowerCase().indexOf(find);
      while (i >= 0 && starts.length < 3) {
        const s = Math.max(0, i - CHUNK / 2);
        if (!starts.some((x) => Math.abs(x - s) < CHUNK)) starts.push(s);
        i = text.toLowerCase().indexOf(find, i + find.length);
      }
    }
    if (!starts.length) starts.push(0, CHUNK, CHUNK * 2);
    const items: ToolItem[] = starts
      .map((s) => text.slice(s, s + CHUNK).trim())
      .filter(Boolean)
      .map((excerpt, n) => ({
        src: {
          kind: 'web' as const,
          ref: `${u.href}#p${starts[n]}`,
          title: decode(title),
          excerpt,
          url: u.href,
        },
        data: { text: excerpt },
      }));
    return {
      items,
      note:
        find && starts[0] !== 0
          ? undefined
          : find
            ? `"${find}" not found; opening passages shown`
            : undefined,
    };
  },
};

function htmlToText(html: string): string {
  return decode(
    html
      .replace(/<(script|style|noscript|svg|nav|footer|header)[\s\S]*?<\/\1>/gi, ' ')
      .replace(/<br\s*\/?>|<\/(p|div|li|h\d|tr)>/gi, '\n')
      .replace(/<[^>]+>/g, ' '),
  )
    .replace(/[ \t\f\v]+/g, ' ')
    .replace(/\s*\n\s*/g, '\n')
    .trim();
}

function decode(s: string): string {
  return s
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCharCode(Number(n)));
}
