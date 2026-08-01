import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  createPerson,
  updatePerson,
  type CreatePersonInput,
  type UpdatePersonInput,
} from '@/data/people';
import {
  createAccount,
  updateAccount,
  archiveAccount,
  type CreateAccountInput,
  type UpdateAccountInput,
} from '@/data/accounts';
import {
  createCategory,
  updateCategory,
  type CreateCategoryInput,
  type UpdateCategoryInput,
} from '@/data/categories';
import {
  getContributionCustomBps,
  getContributionMode,
  getSharedCategoryIds,
  setContributionCustomBps,
  setContributionMode,
  setSharedCategoryIds,
  type ContributionMode,
} from '@/data/settings';
import { qk } from '@/data/query-keys';
import { useHousehold } from '@/features/auth/hooks/useHousehold';

export function useContributionMode() {
  const { householdId } = useHousehold();
  return useQuery({
    queryKey: qk.contributionMode(),
    enabled: Boolean(householdId),
    queryFn: () => getContributionMode(householdId!),
  });
}

export function useSetContributionMode() {
  const { householdId } = useHousehold();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (mode: ContributionMode) => {
      if (!householdId) throw new Error('Sem household');
      return setContributionMode(householdId, mode);
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: qk.contributionMode() });
      toast.success('Modo de cota salvo');
    },
    onError: () => toast.error('Não deu para salvar o modo de cota'),
  });
}

export function useContributionCustomBps() {
  const { householdId } = useHousehold();
  return useQuery({
    queryKey: qk.contributionCustomBps(),
    enabled: Boolean(householdId),
    queryFn: () => getContributionCustomBps(householdId!),
  });
}

export function useSetContributionCustomBps() {
  const { householdId } = useHousehold();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (bpsByPerson: Record<string, number>) => {
      if (!householdId) throw new Error('Sem household');
      return setContributionCustomBps(householdId, bpsByPerson);
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: qk.contributionCustomBps() });
      toast.success('Porcentagens salvas');
    },
    onError: () => toast.error('Não deu para salvar as porcentagens'),
  });
}

/**
 * Categorias que são conta da casa — o pote que o rateio divide.
 *
 * Vive em Ajustes porque é uma **decisão**, não um dado: só vocês sabem se o
 * mercado é da casa e se o transporte é de quem usa. Inferir pelo que é recorrente
 * era o que fazia o card cobrar a mais de quem paga menos.
 */
export function useSharedCategories() {
  const { householdId } = useHousehold();
  return useQuery({
    queryKey: qk.sharedCategories(),
    enabled: Boolean(householdId),
    queryFn: () => getSharedCategoryIds(householdId!),
  });
}

export function useSetSharedCategories() {
  const { householdId } = useHousehold();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (categoryIds: string[]) => {
      if (!householdId) throw new Error('Sem household');
      return setSharedCategoryIds(householdId, categoryIds);
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: qk.sharedCategories() });
      toast.success('Conta da casa atualizada');
    },
    onError: () => toast.error('Não deu para salvar as categorias da casa'),
  });
}

export function useCreatePerson() {
  const { householdId } = useHousehold();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: Omit<CreatePersonInput, 'householdId'>) => {
      if (!householdId) throw new Error('Sem household');
      return createPerson({ ...input, householdId });
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: qk.people() });
      toast.success('Pessoa criada');
    },
    onError: () => toast.error('Não deu para criar a pessoa'),
  });
}

export function useUpdatePerson() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: UpdatePersonInput }) =>
      updatePerson(id, patch),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: qk.people() });
      toast.success('Pessoa atualizada');
    },
    onError: () => toast.error('Não deu para atualizar a pessoa'),
  });
}

export function useCreateAccount() {
  const { householdId } = useHousehold();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: Omit<CreateAccountInput, 'householdId'>) => {
      if (!householdId) throw new Error('Sem household');
      return createAccount({ ...input, householdId });
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: qk.accounts() });
      toast.success('Conta criada');
    },
    onError: () => toast.error('Não deu para criar a conta'),
  });
}

export function useUpdateAccount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: UpdateAccountInput }) =>
      updateAccount(id, patch),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: qk.accounts() });
      toast.success('Conta atualizada');
    },
    onError: () => toast.error('Não deu para atualizar a conta'),
  });
}

export function useArchiveAccount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => archiveAccount(id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: qk.accounts() });
      toast.success('Conta arquivada');
    },
    onError: () => toast.error('Não deu para arquivar a conta'),
  });
}

export function useCreateCategory() {
  const { householdId } = useHousehold();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: Omit<CreateCategoryInput, 'householdId'>) => {
      if (!householdId) throw new Error('Sem household');
      return createCategory({ ...input, householdId });
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: qk.categories() });
      toast.success('Categoria criada');
    },
    onError: () => toast.error('Não deu para criar a categoria'),
  });
}

export function useUpdateCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: UpdateCategoryInput }) =>
      updateCategory(id, patch),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: qk.categories() });
      toast.success('Categoria atualizada');
    },
    onError: () => toast.error('Não deu para atualizar a categoria'),
  });
}
