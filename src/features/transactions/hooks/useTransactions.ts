import {
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  createTransaction,
  deleteTransaction,
  listRecentTransactions,
  listTimelineRows,
  listTransactionsBetween,
  listTransactionsByMonth,
  updateTransaction,
} from '@/data/transactions';
import { qk } from '@/data/query-keys';
import { useHousehold } from '@/features/auth/hooks/useHousehold';
import { useAuth } from '@/features/auth/hooks/useAuth';
import { resolveCompetenceMonth } from '@/core/cards/competence';
import { useAccounts } from '@/features/capture/hooks/useCaptureLookups';
import type {
  CreateTransactionInput,
  Transaction,
  UpdateTransactionInput,
} from '@/types/models';

function invalidateTransactionLists(queryClient: QueryClient, tx: Transaction) {
  void queryClient.invalidateQueries({ queryKey: qk.transactionsRecent() });
  void queryClient.invalidateQueries({
    queryKey: qk.transactions(tx.competenceMonth),
  });
  void queryClient.invalidateQueries({ queryKey: qk.month(tx.competenceMonth) });
  // Lista + detalhe/fatura (prefixo 'card' / 'cards')
  void queryClient.invalidateQueries({ queryKey: qk.cards() });
  void queryClient.invalidateQueries({ queryKey: ['card'] });
}

export function useRecentTransactions(limit = 20) {
  const { householdId } = useHousehold();
  return useQuery({
    queryKey: qk.transactionsRecent(),
    enabled: Boolean(householdId),
    queryFn: () => listRecentTransactions(householdId!, limit),
  });
}

/**
 * Lançamentos por data (atravessa meses) — usado pelo saldo ancorado.
 * Passe `null` nas datas para desligar a query.
 */
export function useTransactionsBetween(
  fromDate: string | null,
  toDate: string | null,
) {
  const { householdId } = useHousehold();
  return useQuery({
    queryKey: qk.transactionsBetween(fromDate ?? '', toDate ?? ''),
    enabled: Boolean(householdId) && Boolean(fromDate) && Boolean(toDate),
    queryFn: () => listTransactionsBetween(householdId!, fromDate!, toDate!),
  });
}

/** Linhas da linha do tempo: intervalo + todas as linhas-modelo de série. */
export function useTimelineRows(fromDate: string | null, toDate: string | null) {
  const { householdId } = useHousehold();
  return useQuery({
    queryKey: qk.timelineRows(fromDate ?? '', toDate ?? ''),
    enabled: Boolean(householdId) && Boolean(fromDate) && Boolean(toDate),
    queryFn: () => listTimelineRows(householdId!, fromDate!, toDate!),
  });
}

export function useTransactionsByMonth(ym: string) {
  const { householdId } = useHousehold();
  return useQuery({
    queryKey: qk.transactions(ym),
    enabled: Boolean(householdId) && Boolean(ym),
    queryFn: () => listTransactionsByMonth(householdId!, ym),
  });
}

export function useCreateTransaction() {
  const queryClient = useQueryClient();
  const { householdId } = useHousehold();
  const { user } = useAuth();
  const { data: accounts } = useAccounts();

  return useMutation({
    mutationFn: (
      input: Omit<CreateTransactionInput, 'householdId' | 'createdBy'>,
    ) => {
      if (!householdId) throw new Error('Household não encontrado');
      return createTransaction({
        ...input,
        householdId,
        createdBy: user?.id ?? null,
      });
    },
    onMutate: async (input) => {
      await queryClient.cancelQueries({ queryKey: qk.transactionsRecent() });
      const previous = queryClient.getQueryData<Transaction[]>(
        qk.transactionsRecent(),
      );

      const account = accounts?.find((a) => a.id === input.accountId);
      const competenceMonth =
        input.competenceMonth ??
        resolveCompetenceMonth({
          date: input.date,
          accountKind: account?.kind,
          closingDay: account?.closing_day,
        });

      const optimistic: Transaction = {
        id: `optimistic-${crypto.randomUUID()}`,
        householdId: householdId ?? '',
        date: input.date,
        competenceMonth,
        kind: input.kind,
        description: input.description.trim(),
        amountCents: input.amountCents,
        categoryId: input.categoryId ?? null,
        personId: input.personId ?? null,
        accountId: input.accountId ?? null,
        transferAccountId: input.transferAccountId ?? null,
        status: input.status ?? 'actual',
        recurrence: input.recurrence ?? 'none',
        recurrenceEnd: input.recurrenceEnd ?? null,
        seriesId: input.seriesId ?? null,
        notes: input.notes ?? null,
        tags: [],
        source: input.source ?? 'manual',
        externalId: input.externalId ?? null,
        createdAt: new Date().toISOString(),
      };

      queryClient.setQueryData<Transaction[]>(qk.transactionsRecent(), (old) => [
        optimistic,
        ...(old ?? []),
      ]);

      return { previous, optimisticId: optimistic.id };
    },
    onError: (_err, _input, ctx) => {
      if (ctx?.previous) {
        queryClient.setQueryData(qk.transactionsRecent(), ctx.previous);
      }
      toast.error('Não foi possível salvar o lançamento');
    },
    onSuccess: (created, _input, ctx) => {
      queryClient.setQueryData<Transaction[]>(qk.transactionsRecent(), (old) => {
        const list = old ?? [];
        const withoutOptimistic = list.filter((t) => t.id !== ctx?.optimisticId);
        const withoutDup = withoutOptimistic.filter((t) => t.id !== created.id);
        return [created, ...withoutDup];
      });
      invalidateTransactionLists(queryClient, created);

      toast.success('Lançamento salvo', {
        action: {
          label: 'Desfazer',
          onClick: () => {
            void deleteTransaction(created.id).then(() => {
              queryClient.setQueryData<Transaction[]>(
                qk.transactionsRecent(),
                (old) => (old ?? []).filter((t) => t.id !== created.id),
              );
              invalidateTransactionLists(queryClient, created);
              toast.message('Lançamento desfeito');
            });
          },
        },
      });
    },
  });
}

export function useUpdateTransaction() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      id,
      patch,
    }: {
      id: string;
      patch: UpdateTransactionInput;
    }) => updateTransaction(id, patch),
    onSuccess: (updated) => {
      queryClient.setQueryData<Transaction[]>(qk.transactionsRecent(), (old) =>
        (old ?? []).map((t) => (t.id === updated.id ? updated : t)),
      );
      invalidateTransactionLists(queryClient, updated);
      toast.success('Lançamento atualizado');
    },
    onError: () => {
      toast.error('Não foi possível atualizar');
    },
  });
}

export function useDeleteTransaction() {
  const queryClient = useQueryClient();
  const { householdId } = useHousehold();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (tx: Transaction) => {
      await deleteTransaction(tx.id);
      return tx;
    },
    onMutate: async (tx) => {
      await queryClient.cancelQueries({ queryKey: qk.transactionsRecent() });
      const previous = queryClient.getQueryData<Transaction[]>(
        qk.transactionsRecent(),
      );
      queryClient.setQueryData<Transaction[]>(qk.transactionsRecent(), (old) =>
        (old ?? []).filter((t) => t.id !== tx.id),
      );
      return { previous };
    },
    onError: (_err, _tx, ctx) => {
      if (ctx?.previous) {
        queryClient.setQueryData(qk.transactionsRecent(), ctx.previous);
      }
      toast.error('Não foi possível excluir');
    },
    onSuccess: (tx) => {
      invalidateTransactionLists(queryClient, tx);
      toast.message('Lançamento excluído', {
        action: {
          label: 'Desfazer',
          onClick: () => {
            if (!householdId) return;
            void createTransaction({
              householdId,
              date: tx.date,
              kind: tx.kind,
              description: tx.description,
              amountCents: tx.amountCents,
              categoryId: tx.categoryId,
              personId: tx.personId,
              accountId: tx.accountId,
              transferAccountId: tx.transferAccountId,
              notes: tx.notes,
              createdBy: user?.id ?? null,
              competenceMonth: tx.competenceMonth,
            }).then((restored) => {
              queryClient.setQueryData<Transaction[]>(
                qk.transactionsRecent(),
                (old) => [restored, ...(old ?? [])],
              );
              invalidateTransactionLists(queryClient, restored);
              toast.success('Lançamento restaurado');
            });
          },
        },
      });
    },
  });
}
