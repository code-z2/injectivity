// recall: what the agent learned in earlier investigations (curated memory),
// each fact citable with its original sources attached.
import { recallFacts } from '@/agent/memory/store';
import { type Tool, type ToolItem } from './types';

export const recall: Tool = {
  spec: {
    name: 'recall',
    description:
      'Facts learned and verified in earlier investigations: attributions, clusters, exploit mechanisms, laundering patterns, labels, analyst corrections. Look up by addresses and/or keywords. Check it early.',
    parameters: {
      type: 'object',
      properties: {
        addresses: { type: 'array', items: { type: 'string' }, maxItems: 25 },
        query: { type: 'string' },
      },
    },
  },
  async run(ctx, args) {
    const subjects = (Array.isArray(args.addresses) ? args.addresses : [])
      .filter((a): a is string => typeof a === 'string')
      .map((a) => a.toLowerCase());
    const facts = await recallFacts(ctx.env, {
      subjects,
      query: typeof args.query === 'string' ? args.query : undefined,
    });
    const items: ToolItem[] = facts.map((f) => ({
      src: {
        kind: 'memory',
        ref: `memory/${f.id}`,
        chain: f.chain || undefined,
        title: `Memory: ${f.kind} (${f.confidence})`,
        // The fact plus the evidence it was stored with, so figures stay checkable.
        excerpt: `${f.statement} Evidence: ${f.sources.map((s) => s.excerpt.slice(0, 300)).join(' | ')}`,
        url: f.sources.find((s) => s.url)?.url,
      },
      data: { kind: f.kind, subject: f.subject, statement: f.statement, confidence: f.confidence },
    }));
    return { items, note: items.length ? undefined : 'nothing in memory for that' };
  },
};
