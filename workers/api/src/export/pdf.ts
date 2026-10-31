// INFRA-2: server-side intel-report PDF renderer (pdf-lib, Workers-safe).
// Four sections: graph snapshot, fund-flow paths, risk split, findings+sources.
// All text is sanitized to WinAnsi (standard PDF fonts); long lists are capped.
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import type { IntelReport } from '@/llm/investigate';

export interface PdfRiskEntry {
  listRef: string;
  via: string | null;
}

export interface PdfInput {
  reportId: number;
  address: string;
  chain: string;
  createdAt: string;
  riskLevel: string;
  exact: PdfRiskEntry[];
  inferred: PdfRiskEntry[];
  pathsOut: string[][];
  pathsIn: string[][];
  edgeCount: number;
  traceNote: string | null;
  nodes: { address: string; depth: number }[];
  edges: { from: string; to: string }[];
  report: IntelReport;
}

const MARGIN = 48;
const PAGE_W = 595.28;
const PAGE_H = 841.89;
const MAX_PATHS = 8;
const MAX_DIAGRAM_NODES = 14;

const short = (a: string) => (a.length > 14 ? `${a.slice(0, 6)}..${a.slice(-4)}` : a);

// Standard 14 fonts are WinAnsi-only: strip anything outside Latin-1.
const win = (s: string) =>
  s
    .replace(/[^\x20-\xFF]/g, '?')
    .replace(/\s+/g, ' ')
    .trim();

function wrap(s: string, max: number): string[] {
  const words = win(s).split(' ');
  const lines: string[] = [];
  let cur = '';
  for (const w of words) {
    if ((cur + ' ' + w).trim().length > max) {
      if (cur) lines.push(cur);
      cur = w;
    } else {
      cur = (cur + ' ' + w).trim();
    }
  }
  if (cur) lines.push(cur);
  return lines.length > 0 ? lines : [''];
}

class Doc {
  doc!: PDFDocument;
  font!: PDFFont;
  bold!: PDFFont;
  page!: PDFPage;
  y = 0;

  async init() {
    this.doc = await PDFDocument.create();
    this.font = await this.doc.embedFont(StandardFonts.Helvetica);
    this.bold = await this.doc.embedFont(StandardFonts.HelveticaBold);
    this.newPage();
  }

  newPage() {
    this.page = this.doc.addPage([PAGE_W, PAGE_H]);
    this.y = PAGE_H - MARGIN;
  }

  ensure(h: number) {
    if (this.y - h < MARGIN) this.newPage();
  }

  heading(text: string, size = 14) {
    this.ensure(size + 12);
    this.page.drawText(win(text), { x: MARGIN, y: this.y, size, font: this.bold });
    this.y -= size + 10;
  }

  sub(text: string) {
    this.ensure(20);
    this.page.drawText(win(text), { x: MARGIN, y: this.y, size: 11, font: this.bold });
    this.y -= 18;
  }

  line(text: string, size = 9, indent = 0) {
    for (const l of wrap(text, 100)) {
      this.ensure(size + 4);
      this.page.drawText(l, { x: MARGIN + indent, y: this.y, size, font: this.font });
      this.y -= size + 4;
    }
  }

  gap(h = 8) {
    this.y -= h;
  }

  // Layered fund-flow snapshot: one column per depth, root highlighted.
  diagram(nodes: { address: string; depth: number }[], edges: { from: string; to: string }[]) {
    const picked = nodes.slice(0, MAX_DIAGRAM_NODES);
    const drawn = new Set(picked.map((n) => n.address.toLowerCase()));
    const byDepth = new Map<number, { address: string; depth: number }[]>();
    for (const n of picked) {
      const arr = byDepth.get(n.depth) ?? [];
      arr.push(n);
      byDepth.set(n.depth, arr);
    }
    const depths = [...byDepth.keys()].sort((a, b) => a - b);
    const boxW = 92;
    const boxH = 20;
    const height = Math.max(...[...byDepth.values()].map((a) => a.length)) * (boxH + 10) + 30;
    this.ensure(height);
    const top = this.y;
    const pos = new Map<string, { x: number; y: number }>();
    depths.forEach((d, col) => {
      const arr = byDepth.get(d) ?? [];
      const x = MARGIN + col * ((PAGE_W - MARGIN * 2 - boxW) / Math.max(1, depths.length - 1));
      arr.forEach((n, row) => {
        const y = top - 16 - row * (boxH + 10);
        pos.set(n.address.toLowerCase(), { x, y });
        if (n.depth === 0) {
          this.page.drawRectangle({
            x: x - 3,
            y: y - 5,
            width: boxW + 6,
            height: boxH + 6,
            borderColor: rgb(0.85, 0.3, 0.2),
            borderWidth: 1.5,
          });
        }
        this.page.drawText(short(n.address), { x: x + 4, y, size: 8, font: this.font });
      });
    });
    let drawnEdges = 0;
    for (const e of edges) {
      if (drawnEdges >= 20) break;
      const a = pos.get(e.from.toLowerCase());
      const b = pos.get(e.to.toLowerCase());
      if (!a || !b) continue;
      this.page.drawLine({
        start: { x: a.x + boxW, y: a.y + 5 },
        end: { x: b.x, y: b.y + 5 },
        thickness: 0.7,
        color: rgb(0.45, 0.45, 0.45),
      });
      drawnEdges++;
    }
    this.y = top - height;
    this.line(
      `Snapshot: ${picked.length} nodes, ${drawnEdges} edges shown (root boxed red). Full trace: see paths below.`,
      8,
    );
  }

  async bytes(title: string): Promise<Uint8Array> {
    this.doc.setTitle(win(title));
    const pages = this.doc.getPages();
    pages.forEach((p, i) => {
      p.drawText(`Page ${i + 1} of ${pages.length}`, {
        x: PAGE_W - MARGIN - 70,
        y: MARGIN - 20,
        size: 8,
        font: this.font,
      });
    });
    return this.doc.save();
  }
}

export async function renderIntelPdf(input: PdfInput): Promise<Uint8Array> {
  const d = new Doc();
  await d.init();

  d.heading('On-chain Security Investigation');
  d.line(`Report #${input.reportId}  |  ${input.address}  (${input.chain})`);
  d.line(`Risk level: ${input.riskLevel}  |  Exported: ${input.createdAt}`);
  d.gap();

  d.sub('Summary');
  d.line(input.report.summary || '(no summary)');
  d.gap();

  d.sub('1. Fund-flow graph snapshot');
  if (input.nodes.length > 0) {
    d.diagram(input.nodes, input.edges);
  } else {
    d.line('No cached trace for a snapshot. ' + (input.traceNote ?? ''));
  }
  d.gap();

  d.sub('2. Fund-flow paths');
  const paths = [
    ...input.pathsOut.map((p) => ({ p, dir: 'out' })),
    ...input.pathsIn.map((p) => ({ p, dir: 'in' })),
  ].slice(0, MAX_PATHS);
  if (paths.length === 0) {
    d.line('No paths. ' + (input.traceNote ?? ''));
  } else {
    d.line(`${input.edgeCount} trace edge(s); showing ${paths.length} path(s):`);
    for (const { p, dir } of paths) {
      d.line(`[${dir}] ${p.join(' -> ')}`, 9, 8);
    }
  }
  d.gap();

  d.sub('3. Risk split');
  d.line(`Verified (${input.exact.length}):`);
  if (input.exact.length === 0) d.line('(none)', 9, 8);
  for (const m of input.exact) d.line(`- ${m.listRef}`, 9, 8);
  d.line(`Inferred association, not wrongdoing (${input.inferred.length}):`);
  if (input.inferred.length === 0) d.line('(none)', 9, 8);
  for (const m of input.inferred) d.line(`- ${m.listRef} via ${m.via ?? '?'}`, 9, 8);
  d.gap();

  d.sub('4. Findings');
  if (input.report.findings.length === 0) d.line('(no findings)');
  input.report.findings.forEach((f, i) => {
    d.line(`${i + 1}. [${f.verdict} / ${f.confidence}] ${f.claim}`, 9);
    if (f.evidence.txHashes.length > 0)
      d.line(`evidence tx: ${f.evidence.txHashes.join(', ')}`, 8, 8);
    if (f.evidence.listRefs.length > 0)
      d.line(`evidence lists: ${f.evidence.listRefs.join(', ')}`, 8, 8);
  });
  d.gap();

  d.sub('Uncertainty');
  if (input.report.uncertainty.length === 0) d.line('(none stated)');
  for (const u of input.report.uncertainty) d.line(`- ${u}`, 9);
  d.gap();

  d.sub('Recommended next checks');
  if (input.report.nextChecks.length === 0) d.line('(none)');
  for (const n of input.report.nextChecks) d.line(`- ${n}`, 9);
  d.gap();

  d.sub('Sources');
  const txs = new Set<string>();
  const refs = new Set<string>();
  for (const f of input.report.findings) {
    f.evidence.txHashes.forEach((h) => txs.add(h));
    f.evidence.listRefs.forEach((r) => refs.add(r));
  }
  d.line(`Transactions cited (${txs.size}):`);
  if (txs.size === 0) d.line('(none)', 9, 8);
  for (const h of txs) d.line(`- ${h}`, 8, 8);
  d.line(`Risk lists cited (${refs.size}):`);
  if (refs.size === 0) d.line('(none)', 9, 8);
  for (const r of refs) d.line(`- ${r}`, 9, 8);

  return d.bytes(`Intel report #${input.reportId} - ${input.address}`);
}
