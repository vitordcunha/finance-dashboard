import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { qk } from '@/data/query-keys';
import {
  getMinimumBalanceCents,
  setMinimumBalanceCents,
} from '@/data/settings';
import { useHousehold } from '@/features/auth/hooks/useHousehold';

/**
 * Colchão da lente aberta. Zero = desligado, e aí o alarme volta a ser só o
 * negativo.
 *
 * `personId` é a lente; `null` é a casa. Um valor único para as três lentes deixava
 * a conta pessoal dela em alerta permanente — o colchão da casa não cabe numa conta
 * que gira um sexto do valor, e o herói dizia "falta R$ 1.410 para o colchão" sobre
 * um saldo de R$ 90 todos os dias do mês.
 */
export function useMinimumBalance(personId?: string | null) {
  const { householdId } = useHousehold();
  return useQuery({
    queryKey: qk.minimumBalance(personId),
    enabled: Boolean(householdId),
    queryFn: () => getMinimumBalanceCents(householdId!, personId),
  });
}

export function useSetMinimumBalance(personId?: string | null) {
  const queryClient = useQueryClient();
  const { householdId } = useHousehold();

  return useMutation({
    mutationFn: (cents: number) =>
      setMinimumBalanceCents(householdId!, cents, personId),
    onSuccess: (cents) => {
      queryClient.setQueryData(qk.minimumBalance(personId), cents);
      toast.success(cents > 0 ? 'Colchão atualizado' : 'Colchão desligado');
    },
    onError: (error: Error) => toast.error(error.message),
  });
}
