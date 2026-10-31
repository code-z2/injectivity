// risk_lists exact-match screening rows.
import type { Env } from '@/types';

export interface RiskLabel {
  list_name: string;
  role: string;
  label: string;
  version: string;
}

export async function riskLabels(env: Env, address: string): Promise<RiskLabel[]> {
  const rows = await env.DB.prepare(
    'SELECT list_name, role, label, version FROM risk_lists WHERE address = ?',
  )
    .bind(address.toLowerCase())
    .all<RiskLabel>();
  return rows.results ?? [];
}

export async function recordRiskHit(
  env: Env,
  address: string,
  list_name: string,
  version: string,
  match_type: string,
): Promise<void> {
  await env.DB.prepare(
    'INSERT INTO risk_hits (address, list_name, version, match_type, checked_at) VALUES (?,?,?,?,?)',
  )
    .bind(address.toLowerCase(), list_name, version, match_type, new Date().toISOString())
    .run();
}
