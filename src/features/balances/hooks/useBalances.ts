import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  listLatestBalancesByAccount,
  upsertAccountBalance,
} from '@/data/account-balances';
import {
  getMonthClose,
  listMonthCloses,
  upsertMonthClose,
} from '@/data/month-closes';
import { qk } from '@/data/query-keys';
import { listAccounts } from '@/data/accounts';
import {
  resolveBalanceAnchor,
  type BalanceAnchor,
} from '@/core/balance/anchor';
import { useAuth } from '@/features/auth/hooks/useAuth';
import { useHousehold } from '@/features/auth/hooks/useHousehold';
import type { CreateAccountBalanceInput, UpsertMonthCloseInput } from '@/types/models';

export function useLatestBalances() {
  const { householdId } = useHousehold();
  return useQuery({
    queryKey: qk.accountBalances(),
    enabled: Boolean(householdId),
    queryFn: () => listLatestBalancesByAccount(householdId!),
  });
}

export function useMonthClose(ym: string) {
  const { householdId } = useHousehold();
  return useQuery({
    queryKey: qk.monthClose(ym),
    enabled: Boolean(householdId) && Boolean(ym),
    queryFn: () => getMonthClose(householdId!, ym),
  });
}

export function useMonthCloses() {
  const { householdId } = useHousehold();
  return useQuery({
    queryKey: qk.monthCloses(),
    enabled: Boolean(householdId),
    queryFn: () => listMonthCloses(householdId!),
  });
}

/** Âncora atual para Futuro (e quem mais precisar). */
export function useBalanceAnchor() {
  const { householdId } = useHousehold();
  return useQuery({
    queryKey: qk.balanceAnchor(),
    enabled: Boolean(householdId),
    queryFn: async (): Promise<BalanceAnchor> => {
      const [balances, accounts] = await Promise.all([
        listLatestBalancesByAccount(householdId!),
        listAccounts(householdId!),
      ]);
      const kindById = new Map(accounts.map((a) => [a.id, a.kind]));
      return resolveBalanceAnchor(
        balances.map((b) => ({
          accountId: b.accountId,
          kind: kindById.get(b.accountId),
          balanceCents: b.balanceCents,
          asOfDate: b.asOfDate,
        })),
      );
    },
  });
}

export function useUpsertAccountBalance() {
  const { householdId } = useHousehold();
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (
      input: Omit<CreateAccountBalanceInput, 'householdId' | 'createdBy'>,
    ) => {
      if (!householdId) throw new Error('Sem household');
      return upsertAccountBalance({
        ...input,
        householdId,
        createdBy: user?.id ?? null,
      });
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: qk.accountBalances() });
      void qc.invalidateQueries({ queryKey: qk.balanceAnchor() });
      toast.success('Saldo atualizado');
    },
    onError: () => toast.error('Não deu para salvar o saldo'),
  });
}

export function useCloseMonth() {
  const { householdId } = useHousehold();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (
      input: Omit<UpsertMonthCloseInput, 'householdId'>,
    ) => {
      if (!householdId) throw new Error('Sem household');
      return upsertMonthClose({ ...input, householdId });
    },
    onSuccess: (_data, vars) => {
      void qc.invalidateQueries({ queryKey: qk.monthCloses() });
      void qc.invalidateQueries({ queryKey: qk.monthClose(vars.month) });
      toast.success('Mês fechado — lançamentos continuam intactos');
    },
    onError: () => toast.error('Não deu para fechar o mês'),
  });
}
