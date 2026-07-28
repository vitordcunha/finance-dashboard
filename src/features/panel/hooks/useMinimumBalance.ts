import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { qk } from '@/data/query-keys';
import {
  getMinimumBalanceCents,
  setMinimumBalanceCents,
} from '@/data/settings';
import { useHousehold } from '@/features/auth/hooks/useHousehold';

/** Colchão do mês. Zero = desligado, e aí o alarme volta a ser só o negativo. */
export function useMinimumBalance() {
  const { householdId } = useHousehold();
  return useQuery({
    queryKey: qk.minimumBalance(),
    enabled: Boolean(householdId),
    queryFn: () => getMinimumBalanceCents(householdId!),
  });
}

export function useSetMinimumBalance() {
  const queryClient = useQueryClient();
  const { householdId } = useHousehold();

  return useMutation({
    mutationFn: (cents: number) =>
      setMinimumBalanceCents(householdId!, cents),
    onSuccess: (cents) => {
      queryClient.setQueryData(qk.minimumBalance(), cents);
      toast.success(cents > 0 ? 'Colchão atualizado' : 'Colchão desligado');
    },
    onError: (error: Error) => toast.error(error.message),
  });
}
