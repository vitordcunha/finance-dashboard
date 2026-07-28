import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  confirmOccurrence,
  deleteOccurrence,
  saveOccurrence,
  type ConfirmOccurrenceInput,
  type DeleteOccurrenceInput,
  type SaveOccurrenceInput,
} from '@/data/series';
import { createTransaction } from '@/data/transactions';
import { useHousehold } from '@/features/auth/hooks/useHousehold';
import type { CreateTransactionInput } from '@/types/models';

/**
 * Uma ocorrência pode virar linha nova, exceção de série ou corte de série.
 * Qualquer uma delas muda a linha do tempo inteira, então tudo em
 * `['transactions']` é invalidado — o saldo de um dia depende de todos os
 * anteriores, não dá para invalidar só o mês tocado.
 */
function useInvalidateTimeline() {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: ['transactions'] });
    void queryClient.invalidateQueries({ queryKey: ['cards'] });
  };
}

export function useSaveOccurrence() {
  const invalidate = useInvalidateTimeline();
  const { householdId } = useHousehold();

  return useMutation({
    mutationFn: (input: Omit<SaveOccurrenceInput, 'householdId'>) =>
      saveOccurrence({ ...input, householdId: householdId! }),
    onSuccess: (_data, input) => {
      invalidate();
      toast.success(
        input.scope === 'forward'
          ? 'Alterado deste mês em diante'
          : 'Lançamento salvo',
      );
    },
    onError: (error: Error) => toast.error(error.message),
  });
}

export function useCreateEntry() {
  const invalidate = useInvalidateTimeline();
  const { householdId } = useHousehold();

  return useMutation({
    mutationFn: (input: Omit<CreateTransactionInput, 'householdId'>) =>
      createTransaction({ ...input, householdId: householdId! }),
    onSuccess: (tx) => {
      invalidate();
      toast.success(
        tx.recurrence === 'monthly'
          ? 'Lançamento criado — repete todo mês'
          : tx.status === 'planned'
            ? 'Lançamento previsto criado'
            : 'Lançamento criado',
      );
    },
    onError: (error: Error) => toast.error(error.message),
  });
}

export function useDeleteOccurrence() {
  const invalidate = useInvalidateTimeline();
  const { householdId } = useHousehold();

  return useMutation({
    mutationFn: (input: Omit<DeleteOccurrenceInput, 'householdId'>) =>
      deleteOccurrence({ ...input, householdId: householdId! }),
    onSuccess: (_data, input) => {
      invalidate();
      toast.success(
        input.scope === 'forward'
          ? 'Removido deste mês em diante'
          : 'Lançamento removido',
      );
    },
    onError: (error: Error) => toast.error(error.message),
  });
}

export function useConfirmOccurrence() {
  const invalidate = useInvalidateTimeline();
  const { householdId } = useHousehold();

  return useMutation({
    mutationFn: (input: Omit<ConfirmOccurrenceInput, 'householdId'>) =>
      confirmOccurrence({ ...input, householdId: householdId! }),
    onSuccess: () => {
      invalidate();
      toast.success('Marcado como realizado');
    },
    onError: (error: Error) => toast.error(error.message),
  });
}
