import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { resolveCompetenceMonth } from '@/core/cards/competence';
import {
  invoiceGapCents,
  paymentCoverage,
  sumPaymentCents,
  sumPurchaseCents,
} from '@/core/reconcile/invoice-gap';
import { cardLimitSnapshot } from '@/core/cards/limit';
import { getAccount, listAccounts } from '@/data/accounts';
import { qk } from '@/data/query-keys';
import {
  linkStatementPayment,
  listStatementPayments,
} from '@/data/statement-payments';
import { getStatement, listStatementsByAccount, updateStatement, upsertStatement } from '@/data/statements';
import {
  createTransaction,
  listCardPurchases,
  listTransferCandidatesForCard,
} from '@/data/transactions';
import { useAuth } from '@/features/auth/hooks/useAuth';
import { useHousehold } from '@/features/auth/hooks/useHousehold';
import { useScope } from '@/features/scope/hooks/useScope';
import type { Account } from '@/data/supabase/types';
import type { Statement, Transaction } from '@/types/models';

export function useCreditCards() {
  const { householdId } = useHousehold();
  const { scope, mePersonId } = useScope();

  return useQuery({
    queryKey: [...qk.cards(), householdId, scope, mePersonId],
    enabled: Boolean(householdId),
    queryFn: async () => {
      const accounts = await listAccounts(householdId!);
      let cards = accounts.filter((a) => a.kind === 'credit');
      if (scope === 'eu' && mePersonId) {
        cards = cards.filter(
          (a) => a.person_id == null || a.person_id === mePersonId,
        );
      }
      return cards;
    },
  });
}

export function useCardAccount(accountId: string | undefined) {
  return useQuery({
    queryKey: qk.card(accountId ?? ''),
    enabled: Boolean(accountId),
    queryFn: () => getAccount(accountId!),
  });
}

export function useCardStatements(accountId: string | undefined) {
  return useQuery({
    queryKey: [...qk.card(accountId ?? ''), 'statements'],
    enabled: Boolean(accountId),
    queryFn: () => listStatementsByAccount(accountId!),
  });
}

export type InvoiceBundle = {
  statement: Statement | null;
  purchases: Transaction[];
  payments: Awaited<ReturnType<typeof listStatementPayments>>;
  purchasesSumCents: number;
  paidSumCents: number;
  gapCents: number | null;
  coverage: ReturnType<typeof paymentCoverage>;
};

export function useCardInvoice(accountId: string | undefined, ym: string) {
  const { householdId } = useHousehold();

  return useQuery({
    queryKey: qk.cardInvoice(accountId ?? '', ym),
    enabled: Boolean(householdId) && Boolean(accountId) && Boolean(ym),
    queryFn: async (): Promise<InvoiceBundle> => {
      const [statement, purchases, payments] = await Promise.all([
        getStatement(accountId!, ym),
        listCardPurchases(householdId!, accountId!, ym),
        listStatementPayments(accountId!, ym),
      ]);

      const purchasesSumCents = sumPurchaseCents(purchases);
      const paidSumCents = sumPaymentCents(
        payments.map((p) => ({ amountCents: p.amountCents })),
      );
      const gapCents =
        statement?.totalCents != null
          ? invoiceGapCents(statement.totalCents, purchasesSumCents)
          : null;

      return {
        statement,
        purchases,
        payments,
        purchasesSumCents,
        paidSumCents,
        gapCents,
        coverage: paymentCoverage(statement?.totalCents, paidSumCents),
      };
    },
  });
}

/** Limite/usado/disponível da competence atual do cartão. */
export function useCardLimit(account: Account | null | undefined) {
  const { householdId } = useHousehold();
  const today = format(new Date(), 'yyyy-MM-dd');
  const ym = account
    ? resolveCompetenceMonth({
        date: today,
        accountKind: account.kind,
        closingDay: account.closing_day,
      })
    : '';

  return useQuery({
    queryKey: [...qk.card(account?.id ?? ''), 'limit', ym],
    enabled: Boolean(householdId) && Boolean(account?.id) && Boolean(ym),
    queryFn: async () => {
      const purchases = await listCardPurchases(
        householdId!,
        account!.id,
        ym,
      );
      const used = sumPurchaseCents(purchases);
      return {
        ym,
        ...cardLimitSnapshot(account!.credit_limit_cents, used),
      };
    },
  });
}

export function useTransferCandidates(creditAccountId: string | undefined) {
  const { householdId } = useHousehold();
  return useQuery({
    queryKey: [...qk.card(creditAccountId ?? ''), 'transfer-candidates'],
    enabled: Boolean(householdId) && Boolean(creditAccountId),
    queryFn: () =>
      listTransferCandidatesForCard(householdId!, creditAccountId!),
  });
}

export type CloseInvoiceInput = {
  accountId: string;
  month: string;
  totalCents: number;
  /** Criar transfer novo OU linkar existente. */
  payment:
    | {
        mode: 'create';
        amountCents: number;
        fromAccountId: string;
        date: string;
        description?: string;
      }
    | {
        mode: 'link';
        transactionId: string;
        amountCents: number;
      }
    | { mode: 'skip' };
};

export function useCloseInvoice() {
  const queryClient = useQueryClient();
  const { householdId } = useHousehold();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (input: CloseInvoiceInput) => {
      if (!householdId) throw new Error('Sem household');

      const statement = await upsertStatement({
        accountId: input.accountId,
        month: input.month,
        totalCents: input.totalCents,
        status: 'closed',
      });

      if (input.payment.mode === 'create') {
        const tx = await createTransaction({
          householdId,
          date: input.payment.date,
          kind: 'transfer',
          description:
            input.payment.description?.trim() ||
            `Pagamento fatura ${input.month}`,
          amountCents: input.payment.amountCents,
          accountId: input.payment.fromAccountId,
          transferAccountId: input.accountId,
          createdBy: user?.id ?? null,
          // pagamento não usa competence de cartão nas compras
          competenceMonth: input.month,
        });
        await linkStatementPayment({
          accountId: input.accountId,
          month: input.month,
          transactionId: tx.id,
          amountCents: input.payment.amountCents,
        });
      } else if (input.payment.mode === 'link') {
        await linkStatementPayment({
          accountId: input.accountId,
          month: input.month,
          transactionId: input.payment.transactionId,
          amountCents: input.payment.amountCents,
        });
      }

      // Cache opcional paid_cents derivado (update, não upsert)
      const payments = await listStatementPayments(
        input.accountId,
        input.month,
      );
      const paidSum = sumPaymentCents(
        payments.map((p) => ({ amountCents: p.amountCents })),
      );
      await updateStatement(input.accountId, input.month, {
        paidCents: paidSum,
        status: 'closed',
      });

      return statement;
    },
    onSuccess: (_data, input) => {
      void queryClient.invalidateQueries({
        queryKey: qk.cardInvoice(input.accountId, input.month),
      });
      void queryClient.invalidateQueries({
        queryKey: qk.card(input.accountId),
      });
      void queryClient.invalidateQueries({ queryKey: qk.cards() });
      void queryClient.invalidateQueries({ queryKey: qk.transactionsRecent() });
      void queryClient.invalidateQueries({
        queryKey: qk.transactions(input.month),
      });
      void queryClient.invalidateQueries({ queryKey: qk.month(input.month) });
      toast.success('Fatura fechada');
    },
    onError: () => {
      toast.error('Não deu para fechar a fatura');
    },
  });
}
