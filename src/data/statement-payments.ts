import { getSupabase } from '@/data/supabase/client';
import type { Tables } from '@/data/supabase/types';
import type { StatementPayment } from '@/types/models';

type PaymentRow = Tables<'statement_payments'>;

function mapRow(row: PaymentRow): StatementPayment {
  return {
    id: row.id,
    statementAccountId: row.statement_account_id,
    statementMonth: row.statement_month,
    transactionId: row.transaction_id,
    amountCents: row.amount_cents,
    createdAt: row.created_at,
  };
}

export async function listStatementPayments(
  accountId: string,
  month: string,
): Promise<StatementPayment[]> {
  const { data, error } = await getSupabase()
    .from('statement_payments')
    .select('*')
    .eq('statement_account_id', accountId)
    .eq('statement_month', month)
    .order('created_at', { ascending: true });

  if (error) throw error;
  return (data ?? []).map(mapRow);
}

export type LinkStatementPaymentInput = {
  accountId: string;
  month: string;
  transactionId: string;
  amountCents: number;
};

export async function linkStatementPayment(
  input: LinkStatementPaymentInput,
): Promise<StatementPayment> {
  const { data, error } = await getSupabase()
    .from('statement_payments')
    .upsert(
      {
        statement_account_id: input.accountId,
        statement_month: input.month,
        transaction_id: input.transactionId,
        amount_cents: input.amountCents,
      },
      {
        onConflict: 'transaction_id,statement_account_id,statement_month',
      },
    )
    .select('*')
    .single();

  if (error) throw error;
  return mapRow(data);
}

export async function unlinkStatementPayment(id: string): Promise<void> {
  const { error } = await getSupabase()
    .from('statement_payments')
    .delete()
    .eq('id', id);

  if (error) throw error;
}
