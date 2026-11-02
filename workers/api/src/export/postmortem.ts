// PDF of a v2 post-mortem report: title and meta line, then the sections in
// reading order with their [n] citations, then the numbered sources.
import type { ReportV2 } from '@/agent/report';
import { Doc } from '@/export/pdf';

export async function renderPostMortemPdf(id: number, createdAt: string, r: ReportV2) {
  const d = new Doc();
  await d.init();
  const pm = r.postMortem;
  d.heading(pm.title, 16);
  d.line(
    `Report ${id} · ${r.chain} · generated ${createdAt.slice(0, 10)} · ${r.sources.length} sources`,
    8,
  );
  d.gap(10);

  const section = (title: string, body: string) => {
    if (!body.trim()) return;
    d.sub(title);
    for (const para of body.split(/\n{2,}/)) {
      d.line(para, 10);
      d.gap(4);
    }
    d.gap(6);
  };

  section('Summary', pm.summary);
  if (pm.timeline.length) {
    d.sub('Timeline');
    for (const t of pm.timeline)
      d.line(`${t.at.replace('T', ' ').replace(/\.\d+Z$|Z$/, '')}  ${t.event}`, 9, 8);
    d.gap(10);
  }
  section('How it happened', pm.how);
  section('Where the money went', pm.fundFlow);
  if (pm.actors.length) {
    d.sub('Actors');
    for (const a of pm.actors) {
      d.line(`${a.name} (${a.role})${a.address ? ` · ${a.address}` : ''}`, 9, 8);
      d.line(a.basis, 9, 20);
    }
    d.gap(10);
  }
  section('Impact', pm.impact);
  if (pm.assumptions.length) {
    d.sub('Assumptions');
    for (const a of pm.assumptions) {
      d.line(a.statement, 9, 8);
      d.line(`Basis: ${a.basis}`, 9, 20);
    }
    d.gap(10);
  }
  section('Method and coverage', pm.method);

  d.sub('Sources');
  for (const s of r.sources) {
    d.line(
      `[${s.n}] ${s.title}${s.url ? ` · ${s.url}` : ''}${s.page ? ` (page ${s.page})` : ''}`,
      8,
      0,
    );
    d.line(s.excerpt.length > 300 ? `${s.excerpt.slice(0, 300)}…` : s.excerpt, 7, 14);
  }
  return d.bytes(pm.title);
}
