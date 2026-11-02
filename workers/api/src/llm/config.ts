// Which model runs which role. Server models are one per role, from Worker
// config, falling back to the legacy MODEL_API_* values and then to Muse.
// A visitor may supply ONE custom model (x-llm-* headers); it replaces
// research, writer and summary, never the scope gate.
import type { Effort, ModelConfig } from '@/llm/adapters';
import type { Env } from '@/types';

export type Role = 'gate' | 'research' | 'writer' | 'summary';

export const MUSE_BASE_URL = 'https://api.meta.ai/v1';
export const MUSE_MODEL = 'muse-spark-1.3-contributor';

const DEFAULT_EFFORT: Record<Role, Effort> = {
  gate: 'low',
  research: 'high',
  writer: 'high',
  summary: 'low',
};

const asEffort = (v: unknown): Effort | undefined =>
  v === 'low' || v === 'medium' || v === 'high' ? v : undefined;

export function serverModel(env: Env, role: Role): ModelConfig | null {
  const e = env as unknown as Record<string, string | undefined>;
  const p = `MODEL_${role.toUpperCase()}_`;
  const key = e[`${p}KEY`] || env.MODEL_API_KEY;
  if (!key) return null;
  return {
    baseUrl: e[`${p}BASE_URL`] || env.MODEL_API_BASE_URL || MUSE_BASE_URL,
    model: e[`${p}MODEL`] || env.MODEL_API_MODEL || MUSE_MODEL,
    key,
    effort: asEffort(e[`${p}EFFORT`]) ?? DEFAULT_EFFORT[role],
  };
}

export class ConfigError extends Error {}

/** The visitor's custom model from request headers; null when none is set. */
export function customModel(header: (name: string) => string | undefined): ModelConfig | null {
  const baseUrl = header('x-llm-base-url')?.trim();
  const model = header('x-llm-model')?.trim();
  const key = header('x-llm-key')?.trim();
  if (!baseUrl && !model && !key) return null;
  if (!baseUrl || !model || !key)
    throw new ConfigError('custom model needs x-llm-base-url, x-llm-model and x-llm-key');
  let url: URL;
  try {
    url = new URL(baseUrl);
  } catch {
    throw new ConfigError('x-llm-base-url must be a valid https URL');
  }
  if (url.protocol !== 'https:') throw new ConfigError('x-llm-base-url must be a valid https URL');
  if (model.length > 128) throw new ConfigError('x-llm-model is too long');
  return {
    baseUrl: url.href.replace(/\/$/, ''),
    model,
    key,
    effort: asEffort(header('x-llm-effort')?.trim()),
  };
}

export function modelFor(env: Env, role: Role, custom: ModelConfig | null): ModelConfig | null {
  if (role === 'gate' || !custom) return serverModel(env, role);
  return custom;
}
