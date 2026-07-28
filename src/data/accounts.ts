import { getSupabase } from '@/data/supabase/client';
import type { Account, Database } from '@/data/supabase/types';

export type AccountKind = Account['kind'];

export type CreateAccountInput = {
  householdId: string;
  name: string;
  kind: AccountKind;
  color?: string;
  personId?: string | null;
  creditLimitCents?: number;
  closingDay?: number | null;
  dueDay?: number | null;
  sort?: number;
};

export type UpdateAccountInput = {
  name?: string;
  kind?: AccountKind;
  color?: string;
  personId?: string | null;
  creditLimitCents?: number;
  closingDay?: number | null;
  dueDay?: number | null;
  archived?: boolean;
  sort?: number;
};

export async function listAccounts(
  householdId: string,
  options: { includeArchived?: boolean } = {},
): Promise<Account[]> {
  let query = getSupabase()
    .from('accounts')
    .select('*')
    .eq('household_id', householdId)
    .order('sort', { ascending: true });

  if (!options.includeArchived) {
    query = query.eq('archived', false);
  }

  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

export async function createAccount(
  input: CreateAccountInput,
): Promise<Account> {
  const { data, error } = await getSupabase()
    .from('accounts')
    .insert({
      household_id: input.householdId,
      name: input.name.trim(),
      kind: input.kind,
      color: input.color ?? '#8a8580',
      person_id: input.personId ?? null,
      credit_limit_cents: input.creditLimitCents ?? 0,
      closing_day: input.closingDay ?? null,
      due_day: input.dueDay ?? null,
      sort: input.sort ?? 0,
    })
    .select('*')
    .single();

  if (error) throw error;
  return data;
}

export async function updateAccount(
  id: string,
  patch: UpdateAccountInput,
): Promise<Account> {
  const update: Database['public']['Tables']['accounts']['Update'] = {};

  if (patch.name !== undefined) update.name = patch.name.trim();
  if (patch.kind !== undefined) update.kind = patch.kind;
  if (patch.color !== undefined) update.color = patch.color;
  if (patch.personId !== undefined) update.person_id = patch.personId;
  if (patch.creditLimitCents !== undefined) {
    update.credit_limit_cents = patch.creditLimitCents;
  }
  if (patch.closingDay !== undefined) update.closing_day = patch.closingDay;
  if (patch.dueDay !== undefined) update.due_day = patch.dueDay;
  if (patch.archived !== undefined) update.archived = patch.archived;
  if (patch.sort !== undefined) update.sort = patch.sort;

  const { data, error } = await getSupabase()
    .from('accounts')
    .update(update)
    .eq('id', id)
    .select('*')
    .single();

  if (error) throw error;
  return data;
}

export async function archiveAccount(id: string): Promise<Account> {
  return updateAccount(id, { archived: true });
}

export async function getAccount(id: string): Promise<Account | null> {
  const { data, error } = await getSupabase()
    .from('accounts')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (error) throw error;
  return data;
}
