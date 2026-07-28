import { useQuery } from '@tanstack/react-query';
import { listAccounts } from '@/data/accounts';
import { listCategories } from '@/data/categories';
import { listPeople } from '@/data/people';
import { qk } from '@/data/query-keys';
import { useHousehold } from '@/features/auth/hooks/useHousehold';

export function useAccounts() {
  const { householdId } = useHousehold();
  return useQuery({
    queryKey: qk.accounts(),
    enabled: Boolean(householdId),
    queryFn: () => listAccounts(householdId!),
  });
}

export function useCategories() {
  const { householdId } = useHousehold();
  return useQuery({
    queryKey: qk.categories(),
    enabled: Boolean(householdId),
    queryFn: () => listCategories(householdId!),
  });
}

export function usePeopleQuery() {
  const { householdId } = useHousehold();
  return useQuery({
    queryKey: qk.people(),
    enabled: Boolean(householdId),
    queryFn: () => listPeople(householdId!),
  });
}
