import { getSupabase } from '@/data/supabase/client';
import type { Json, Tables } from '@/data/supabase/types';

export type ContributionMode = 'income_share' | 'equal_50' | 'custom';

export type SettingRow = Tables<'settings'>;

const CONTRIBUTION_MODE_KEY = 'contribution_mode';
const MINIMUM_BALANCE_KEY = 'minimum_balance_cents';
const CONTRIBUTION_CUSTOM_BPS_KEY = 'contribution_custom_bps';

export async function getSetting(
  householdId: string,
  key: string,
): Promise<SettingRow | null> {
  const { data, error } = await getSupabase()
    .from('settings')
    .select('*')
    .eq('household_id', householdId)
    .eq('key', key)
    .maybeSingle();

  if (error) throw error;
  return data;
}

export async function upsertSetting(
  householdId: string,
  key: string,
  value: Json,
): Promise<SettingRow> {
  const { data, error } = await getSupabase()
    .from('settings')
    .upsert(
      {
        household_id: householdId,
        key,
        value,
      },
      { onConflict: 'household_id,key' },
    )
    .select('*')
    .single();

  if (error) throw error;
  return data;
}

export async function getContributionMode(
  householdId: string,
): Promise<ContributionMode> {
  const row = await getSetting(householdId, CONTRIBUTION_MODE_KEY);
  const mode = (row?.value as { mode?: string } | string | null) ?? null;

  if (typeof mode === 'string' && isContributionMode(mode)) return mode;
  if (
    mode &&
    typeof mode === 'object' &&
    'mode' in mode &&
    typeof mode.mode === 'string' &&
    isContributionMode(mode.mode)
  ) {
    return mode.mode;
  }

  // Persiste default na primeira leitura
  await upsertSetting(householdId, CONTRIBUTION_MODE_KEY, {
    mode: 'income_share',
  });
  return 'income_share';
}

export async function setContributionMode(
  householdId: string,
  mode: ContributionMode,
): Promise<ContributionMode> {
  await upsertSetting(householdId, CONTRIBUTION_MODE_KEY, { mode });
  return mode;
}

/**
 * Custom bps por person_id. Soma deve ser 10000.
 * Retorna null se ainda não configurado.
 */
export async function getContributionCustomBps(
  householdId: string,
): Promise<Record<string, number> | null> {
  const row = await getSetting(householdId, CONTRIBUTION_CUSTOM_BPS_KEY);
  if (!row?.value || typeof row.value !== 'object' || Array.isArray(row.value)) {
    return null;
  }
  const raw = row.value as Record<string, unknown>;
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(raw)) {
    if (typeof v === 'number' && Number.isInteger(v)) {
      out[k] = v;
    }
  }
  return Object.keys(out).length > 0 ? out : null;
}

export async function setContributionCustomBps(
  householdId: string,
  bpsByPerson: Record<string, number>,
): Promise<Record<string, number>> {
  await upsertSetting(
    householdId,
    CONTRIBUTION_CUSTOM_BPS_KEY,
    bpsByPerson as Json,
  );
  return bpsByPerson;
}

function isContributionMode(value: string): value is ContributionMode {
  return (
    value === 'income_share' || value === 'equal_50' || value === 'custom'
  );
}


/**
 * Colchão: o saldo que não deve ser furado.
 *
 * Sem ele "saldo positivo" vira o único alarme, e zerar a conta no dia 24 conta
 * como mês bem-sucedido. Zero = desligado.
 */
export async function getMinimumBalanceCents(
  householdId: string,
): Promise<number> {
  const row = await getSetting(householdId, MINIMUM_BALANCE_KEY);
  const value = row?.value as { cents?: unknown } | number | null;
  if (typeof value === 'number' && Number.isInteger(value)) return value;
  if (
    value &&
    typeof value === 'object' &&
    typeof value.cents === 'number' &&
    Number.isInteger(value.cents)
  ) {
    return value.cents;
  }
  return 0;
}

export async function setMinimumBalanceCents(
  householdId: string,
  cents: number,
): Promise<number> {
  const safe = Math.max(0, Math.round(cents));
  await upsertSetting(householdId, MINIMUM_BALANCE_KEY, { cents: safe });
  return safe;
}
