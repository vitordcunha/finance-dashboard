import { getSupabase } from '@/data/supabase/client';
import type { Tables } from '@/data/supabase/types';
import type { MonthClose, UpsertMonthCloseInput } from '@/types/models';

type MonthCloseRow = Tables<'month_closes'>;

function mapRow(row: MonthCloseRow): MonthClose {
  return {
    householdId: row.household_id,
    month: row.month,
    realBalanceCents: row.real_balance_cents,
    notes: row.notes,
    closedAt: row.closed_at,
  };
}

export async function getMonthClose(
  householdId: string,
  month: string,
): Promise<MonthClose | null> {
  const { data, error } = await getSupabase()
    .from('month_closes')
    .select('*')
    .eq('household_id', householdId)
    .eq('month', month)
    .maybeSingle();

  if (error) throw error;
  return data ? mapRow(data) : null;
}

export async function listMonthCloses(
  householdId: string,
): Promise<MonthClose[]> {
  const { data, error } = await getSupabase()
    .from('month_closes')
    .select('*')
    .eq('household_id', householdId)
    .order('month', { ascending: false });

  if (error) throw error;
  return (data ?? []).map(mapRow);
}

/**
 * Ritual de fechamento: grava snapshot + closed_at.
 * Não apaga lançamentos — só registra o fechamento.
 */
export async function upsertMonthClose(
  input: UpsertMonthCloseInput,
): Promise<MonthClose> {
  const { data, error } = await getSupabase()
    .from('month_closes')
    .upsert(
      {
        household_id: input.householdId,
        month: input.month,
        real_balance_cents: input.realBalanceCents,
        notes: input.notes ?? null,
        closed_at: new Date().toISOString(),
      },
      { onConflict: 'household_id,month' },
    )
    .select('*')
    .single();

  if (error) throw error;
  return mapRow(data);
}
