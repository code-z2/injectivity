// Adapter by base URL: vendor hosts get their native API, every other host
// is treated as OpenAI-compatible Chat Completions.
import { anthropicAdapter } from './anthropic';
import { chatAdapter } from './chat';
import { geminiAdapter } from './gemini';
import { responsesAdapter } from './responses';
import type { ModelAdapter } from './types';

export * from './types';

export function adapterKind(baseUrl: string): ModelAdapter['kind'] {
  let host = '';
  try {
    host = new URL(baseUrl).hostname;
  } catch {
    // Unparseable: falls through to chat, and the call itself will fail clearly.
  }
  if (host === 'api.anthropic.com') return 'anthropic';
  if (host === 'generativelanguage.googleapis.com') return 'gemini';
  if (host === 'api.meta.ai' || host === 'api.openai.com') return 'responses';
  return 'chat';
}

export function adapterFor(baseUrl: string, fetchImpl: typeof fetch = fetch): ModelAdapter {
  switch (adapterKind(baseUrl)) {
    case 'anthropic':
      return anthropicAdapter(fetchImpl);
    case 'gemini':
      return geminiAdapter(fetchImpl);
    case 'responses':
      return responsesAdapter(fetchImpl);
    default:
      return chatAdapter(fetchImpl);
  }
}
