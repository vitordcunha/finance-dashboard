import { getSupabase } from '@/data/supabase/client';
import type { Tables } from '@/data/supabase/types';
import type {
  AccountBalance,
  CreateAccountBalanceInput,
} from '@/types/models';

type BalanceRow = Tables<'account_balances'>;

function mapRow(row: BalanceRow): AccountBalance {
  return {
    id: row.id,
    householdId: row.household_id,
    accountId: row.account_id,
    asOfDate: row.as_of_date,
    balanceCents: row.balance_cents,
    notes: row.notes,
    createdAt: row.created_at,
    createdBy: row.created_by,
  };
}

export async function listAccountBalances(
  householdId: string,
): Promise<AccountBalance[]> {
  const { data, error } = await getSupabase()
    .from('account_balances')
    .select('*')
    .eq('household_id', householdId)
    .order('as_of_date', { ascending: false });

  if (error) throw error;
  return (data ?? []).map(mapRow);
}

export async function listLatestBalancesByAccount(
  householdId: string,
): Promise<AccountBalance[]> {
  const all = await listAccountBalances(householdId);
  const seen = new Set<string>();
  const latest: AccountBalance[] = [];
  for (const row of all) {
    if (seen.has(row.accountId)) continue;
    seen.add(row.accountId);
    latest.push(row);
  }
  return latest;
}

export async function getLatestBalanceForAccount(
  accountId: string,
): Promise<AccountBalance | null> {
  const { data, error } = await getSupabase()
    .from('account_balances')
    .select('*')
    .eq('account_id', accountId)
    .order('as_of_date', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data ? mapRow(data) : null;
}

/** Upsert por (account_id, as_of_date) — atualizar o mesmo dia sobrescreve. */
export async function upsertAccountBalance(
  input: CreateAccountBalanceInput,
): Promise<AccountBalance> {
  const { data, error } = await getSupabase()
    .from('account_balances')
    .upsert(
      {
        household_id: input.householdId,
        account_id: input.accountId,
        as_of_date: input.asOfDate,
        balance_cents: input.balanceCents,
        notes: input.notes ?? null,
        created_by: input.createdBy ?? null,
      },
      { onConflict: 'account_id,as_of_date' },
    )
    .select('*')
    .single();

  if (error) throw error;
  return mapRow(data);
}
