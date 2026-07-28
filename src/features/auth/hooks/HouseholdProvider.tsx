import { useMemo, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { qk } from '@/data/query-keys';
import {
  createHousehold,
  fetchMyHousehold,
  getHouseholdId,
  joinHousehold,
} from '@/data/household';
import { useAuth } from '@/features/auth/hooks/useAuth';
import {
  HouseholdContext,
  type HouseholdContextValue,
} from '@/features/auth/hooks/household-context';

export function HouseholdProvider({ children }: { children: ReactNode }) {
  const { user, configured } = useAuth();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: qk.household(),
    enabled: configured && Boolean(user),
    queryFn: fetchMyHousehold,
    staleTime: 60_000,
  });

  const value = useMemo<HouseholdContextValue>(() => {
    const refresh = async () => {
      await queryClient.invalidateQueries({ queryKey: qk.household() });
    };

    return {
      household: query.data ?? null,
      householdId: getHouseholdId(query.data),
      loading: Boolean(user) && query.isLoading,
      error: query.error instanceof Error ? query.error : null,
      refresh,
      create: async (name: string) => {
        const h = await createHousehold(name);
        queryClient.setQueryData(qk.household(), h);
        return h;
      },
      join: async (inviteCode: string) => {
        const h = await joinHousehold(inviteCode);
        queryClient.setQueryData(qk.household(), h);
        return h;
      },
    };
  }, [query.data, query.error, query.isLoading, queryClient, user]);

  return <HouseholdContext.Provider value={value}>{children}</HouseholdContext.Provider>;
}
