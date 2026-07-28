import { getSupabase } from '@/data/supabase/client';
import type { Database } from '@/data/supabase/types';
import type { CategorizationRule } from '@/types/models';

type RuleRow = Database['public']['Tables']['categorization_rules']['Row'];

function mapRule(row: RuleRow): CategorizationRule {
  return {
    id: row.id,
    householdId: row.household_id,
    fingerprint: row.fingerprint,
    matchExample: row.match_example,
    categoryId: row.category_id,
    personId: row.person_id,
    hits: row.hits,
    enabled: row.enabled,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function listCategorizationRules(
  householdId: string,
): Promise<CategorizationRule[]> {
  const { data, error } = await getSupabase()
    .from('categorization_rules')
    .select('*')
    .eq('household_id', householdId)
    .eq('enabled', true)
    .order('updated_at', { ascending: false });

  if (error) throw error;
  return (data ?? []).map(mapRule);
}

export type UpsertCategorizationRuleInput = {
  householdId: string;
  fingerprint: string;
  matchExample: string;
  categoryId: string;
  personId?: string | null;
};

/** Cria ou atualiza a regra do fingerprint (último ganha; preserva hits). */
export async function upsertCategorizationRule(
  input: UpsertCategorizationRuleInput,
): Promise<CategorizationRule> {
  const fp = input.fingerprint.trim();
  if (!fp) {
    throw new Error('Fingerprint vazio — não dá para lembrar a regra');
  }

  const sb = getSupabase();
  const { data: existing, error: findErr } = await sb
    .from('categorization_rules')
    .select('*')
    .eq('household_id', input.householdId)
    .eq('fingerprint', fp)
    .maybeSingle();

  if (findErr) throw findErr;

  const now = new Date().toISOString();

  if (existing) {
    const { data, error } = await sb
      .from('categorization_rules')
      .update({
        match_example: input.matchExample.trim().slice(0, 200),
        category_id: input.categoryId,
        person_id: input.personId ?? null,
        enabled: true,
        updated_at: now,
      })
      .eq('id', existing.id)
      .select('*')
      .single();
    if (error) throw error;
    return mapRule(data);
  }

  const { data, error } = await sb
    .from('categorization_rules')
    .insert({
      household_id: input.householdId,
      fingerprint: fp,
      match_example: input.matchExample.trim().slice(0, 200),
      category_id: input.categoryId,
      person_id: input.personId ?? null,
      enabled: true,
      hits: 0,
      updated_at: now,
    })
    .select('*')
    .single();

  if (error) throw error;
  return mapRule(data);
}

/** Incrementa hits das regras usadas (por fingerprint). */
export async function bumpCategorizationRuleHits(
  householdId: string,
  fingerprints: string[],
): Promise<void> {
  const unique = [...new Set(fingerprints.map((f) => f.trim()).filter(Boolean))];
  if (unique.length === 0) return;

  const { data, error } = await getSupabase()
    .from('categorization_rules')
    .select('id, fingerprint, hits')
    .eq('household_id', householdId)
    .in('fingerprint', unique);

  if (error) throw error;
  if (!data?.length) return;

  const counts = new Map<string, number>();
  for (const fp of fingerprints) {
    if (!fp) continue;
    counts.set(fp, (counts.get(fp) ?? 0) + 1);
  }

  for (const row of data) {
    const delta = counts.get(row.fingerprint) ?? 0;
    if (delta === 0) continue;
    const { error: upErr } = await getSupabase()
      .from('categorization_rules')
      .update({
        hits: row.hits + delta,
        updated_at: new Date().toISOString(),
      })
      .eq('id', row.id);
    if (upErr) throw upErr;
  }
}
