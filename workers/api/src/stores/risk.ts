// risk_lists exact-match screening rows + R1 inferred proximity assessment.
import type { AlchemyClient, Env } from '@/types';
import { cachedTransfers, storeTransfers } from '@/stores/transfers';

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

export interface RiskMatch extends RiskLabel {
  match_type: 'exact' | 'inferred:R1';
  rule: string | null;
  via: string | null;
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

export interface RiskAssessment {
  level: 'verified' | 'inferred' | 'none';
  matches: RiskMatch[];
  screened: number;
  source: 'cache' | 'live' | 'none';
  note?: string;
}

// R1: direct (1-hop) counterparty of a verified address. Verified hits stay
// `exact`; R1 hits are `inferred` with the verified address in `via`.
// Counterparties come from cache; on a thin cache and a keyed env we fill
// live once (per explicit decision) and persist the rows.
const R1 = 'R1-direct-counterparty';

export async function assessRisk(
  env: Env,
  client: AlchemyClient,
  chain: string,
  address: string,
): Promise<RiskAssessment> {
  const addr = address.toLowerCase();
  const exact = await riskLabels(env, addr);
  const matches: RiskMatch[] = exact.map((l) => ({
    ...l,
    match_type: 'exact' as const,
    rule: null,
    via: null,
  }));
  for (const l of exact) {
    await recordRiskHit(env, addr, l.list_name, l.version, 'exact').catch(() => undefined);
  }

  let rows = (await cachedTransfers(env, chain, addr, 'both')).rows;
  let source: RiskAssessment['source'] = rows.length > 0 ? 'cache' : 'none';
  if (rows.length === 0 && env.ALCHEMY_API_KEY) {
    try {
      const { transfers } = await client.getTransfers(env, chain, addr, 'both');
      await storeTransfers(env, chain, transfers);
      rows = transfers;
      source = 'live';
    } catch {
      source = 'none';
    }
  }

  const parties = new Set<string>();
  for (const t of rows) {
    const from = t.from.toLowerCase();
    const to = t.to.toLowerCase();
    if (from !== addr) parties.add(from);
    if (to !== addr) parties.add(to);
  }
  for (const p of parties) {
    const labels = await riskLabels(env, p);
    if (labels.length === 0) continue;
    const v = labels[0];
    matches.push({ ...v, match_type: 'inferred:R1', rule: R1, via: p });
    await recordRiskHit(env, addr, v.list_name, v.version, 'inferred:R1').catch(() => undefined);
  }

  const level = exact.length > 0 ? 'verified' : matches.length > 0 ? 'inferred' : 'none';
  const assessment: RiskAssessment = { level, matches, screened: parties.size, source };
  if (source === 'none' && exact.length === 0) {
    assessment.note = 'counterparty screen skipped: no cached transfers and no ALCHEMY_API_KEY';
  }
  return assessment;
}
