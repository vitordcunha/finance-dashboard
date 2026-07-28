import { getSupabase } from '@/data/supabase/client';
import type { Database, Tables } from '@/data/supabase/types';
import type {
  Statement,
  UpsertStatementInput,
} from '@/types/models';

type StatementRow = Tables<'statements'>;

function mapRow(row: StatementRow): Statement {
  return {
    accountId: row.account_id,
    month: row.month,
    totalCents: row.total_cents,
    paidCents: row.paid_cents,
    closingDate: row.closing_date,
    dueDate: row.due_date,
    notes: row.notes,
    status: row.status,
  };
}

export async function listStatementsByAccount(
  accountId: string,
): Promise<Statement[]> {
  const { data, error } = await getSupabase()
    .from('statements')
    .select('*')
    .eq('account_id', accountId)
    .order('month', { ascending: false });

  if (error) throw error;
  return (data ?? []).map(mapRow);
}

export async function getStatement(
  accountId: string,
  month: string,
): Promise<Statement | null> {
  const { data, error } = await getSupabase()
    .from('statements')
    .select('*')
    .eq('account_id', accountId)
    .eq('month', month)
    .maybeSingle();

  if (error) throw error;
  return data ? mapRow(data) : null;
}

export async function upsertStatement(
  input: UpsertStatementInput,
): Promise<Statement> {
  const row: Database['public']['Tables']['statements']['Insert'] = {
    account_id: input.accountId,
    month: input.month,
  };

  if (input.totalCents !== undefined) row.total_cents = input.totalCents;
  if (input.paidCents !== undefined) row.paid_cents = input.paidCents;
  if (input.closingDate !== undefined) row.closing_date = input.closingDate;
  if (input.dueDate !== undefined) row.due_date = input.dueDate;
  if (input.notes !== undefined) row.notes = input.notes;
  if (input.status !== undefined) row.status = input.status;

  const { data, error } = await getSupabase()
    .from('statements')
    .upsert(row, { onConflict: 'account_id,month' })
    .select('*')
    .single();

  if (error) throw error;
  return mapRow(data);
}

/** Patch parcial — não apaga colunas omitidas (ao contrário do upsert). */
export async function updateStatement(
  accountId: string,
  month: string,
  patch: Omit<UpsertStatementInput, 'accountId' | 'month'>,
): Promise<Statement> {
  const update: Database['public']['Tables']['statements']['Update'] = {};
  if (patch.totalCents !== undefined) update.total_cents = patch.totalCents;
  if (patch.paidCents !== undefined) update.paid_cents = patch.paidCents;
  if (patch.closingDate !== undefined) update.closing_date = patch.closingDate;
  if (patch.dueDate !== undefined) update.due_date = patch.dueDate;
  if (patch.notes !== undefined) update.notes = patch.notes;
  if (patch.status !== undefined) update.status = patch.status;

  const { data, error } = await getSupabase()
    .from('statements')
    .update(update)
    .eq('account_id', accountId)
    .eq('month', month)
    .select('*')
    .single();

  if (error) throw error;
  return mapRow(data);
}
