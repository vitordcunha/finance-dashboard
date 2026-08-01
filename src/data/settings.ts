import { getSupabase } from '@/data/supabase/client';
import type { Json, Tables } from '@/data/supabase/types';

export type ContributionMode = 'income_share' | 'equal_50' | 'custom';

export type SettingRow = Tables<'settings'>;

const CONTRIBUTION_MODE_KEY = 'contribution_mode';
const MINIMUM_BALANCE_KEY = 'minimum_balance_cents';
const CONTRIBUTION_CUSTOM_BPS_KEY = 'contribution_custom_bps';
const SHARED_CATEGORIES_KEY = 'household_shared_categories';

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

/**
 * Categorias que são **conta da casa** — o pote que o rateio divide.
 *
 * Precisa ser declarado porque não havia como saber. O painel inferia o pote como
 * "recorrente ou categoria essencial", que captura o que é *recorrente*, não o que
 * é *compartilhado*: entrava o pagamento do drone da mãe dele, o transporte dele e
 * 100% da fatura do cartão dele, e ficava fora todo o compartilhado variável
 * (mercado além do previsto, farmácia). Em agosto/2026 isso fazia o card cobrar
 * R$ 442,54 dela sobre um rateio que estava exatamente na regra combinada.
 *
 * `transactions.person_id` seria o campo natural (`null` = casa), mas no banco ele
 * está preenchido com o **dono da conta** — `Aluguel → Eu`, `Luz → Eu` —, então
 * usá-lo hoje daria um pote de R$ 140. Marcar categoria resolve aluguel, luz,
 * internet, gás e mercado de uma vez e cai no fluxo de categorizar que já existe.
 */
export async function getSharedCategoryIds(
  householdId: string,
): Promise<string[]> {
  const row = await getSetting(householdId, SHARED_CATEGORIES_KEY);
  const value = row?.value;
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === 'string');
}

export async function setSharedCategoryIds(
  householdId: string,
  categoryIds: string[],
): Promise<string[]> {
  const unique = [...new Set(categoryIds)];
  await upsertSetting(householdId, SHARED_CATEGORIES_KEY, unique as Json);
  return unique;
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
 *
 * **Por lente.** Um valor único aplicado a Casa, Eu e Greicy deixava a lente dela
 * em alerta permanente: o colchão de R$ 1.500 dimensionado para uma casa de
 * R$ 14,4k cobria o gráfico inteiro de uma conta que gira R$ 2,4k, e o herói
 * anunciava "falta R$ 1.410 para o colchão" sobre um saldo de R$ 90 — verdadeiro,
 * inútil e para sempre. Lente de pessoa sem valor próprio fica **sem colchão**:
 * alarme errado é pior que alarme ausente.
 */
function minimumKey(personId?: string | null): string {
  return personId ? `${MINIMUM_BALANCE_KEY}:${personId}` : MINIMUM_BALANCE_KEY;
}

export async function getMinimumBalanceCents(
  householdId: string,
  personId?: string | null,
): Promise<number> {
  const row = await getSetting(householdId, minimumKey(personId));
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
  personId?: string | null,
): Promise<number> {
  const safe = Math.max(0, Math.round(cents));
  await upsertSetting(householdId, minimumKey(personId), { cents: safe });
  return safe;
}
