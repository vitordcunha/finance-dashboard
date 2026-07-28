import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { updateTransactionsByIds } from '@/data/transactions';

/**
 * Aplica uma categoria a um grupo inteiro de lançamentos.
 *
 * Invalida `['transactions']` inteiro, não só o mês: categoria muda a régua de
 * essencial, e com ela o ritmo, o estimado, o burn-up e a projeção de todos os
 * meses à frente. Invalidar só o mês tocado deixaria a tela discordando de si.
 */
export function useBulkCategorize() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: { ids: string[]; categoryId: string }) =>
      updateTransactionsByIds(input.ids, { categoryId: input.categoryId }),
    onSuccess: (_data, input) => {
      void queryClient.invalidateQueries({ queryKey: ['transactions'] });
      toast.success(
        input.ids.length === 1
          ? 'Lançamento categorizado'
          : `${input.ids.length} lançamentos categorizados`,
      );
    },
    onError: (error: Error) => toast.error(error.message),
  });
}
