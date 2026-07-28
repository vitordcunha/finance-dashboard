import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { currentYearMonth } from '@/core/month';
import {
  archiveGoal,
  createGoal,
  listContributionsForMonth,
  listGoals,
  updateGoal,
  upsertMonthContribution,
  type CreateGoalInput,
  type UpdateGoalInput,
} from '@/data/goals';
import { qk } from '@/data/query-keys';
import { useHousehold } from '@/features/auth/hooks/useHousehold';

export function useGoals(options: { includeArchived?: boolean } = {}) {
  const { householdId } = useHousehold();
  return useQuery({
    queryKey: [...qk.goals(), options.includeArchived ? 'all' : 'active'],
    enabled: Boolean(householdId),
    queryFn: () => listGoals(householdId!, options),
  });
}

export function useGoalContributions(ym: string = currentYearMonth()) {
  const { householdId } = useHousehold();
  return useQuery({
    queryKey: qk.goalContributions(ym),
    enabled: Boolean(householdId),
    queryFn: () => listContributionsForMonth(householdId!, ym),
  });
}

function invalidateGoals(qc: ReturnType<typeof useQueryClient>, ym?: string) {
  void qc.invalidateQueries({ queryKey: qk.goals() });
  if (ym) {
    void qc.invalidateQueries({ queryKey: qk.goalContributions(ym) });
  } else {
    void qc.invalidateQueries({ queryKey: ['goals', 'contributions'] });
  }
}

export function useCreateGoal() {
  const { householdId } = useHousehold();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: Omit<CreateGoalInput, 'householdId'>) => {
      if (!householdId) throw new Error('Sem household');
      return createGoal({ ...input, householdId });
    },
    onSuccess: () => {
      invalidateGoals(qc);
      toast.success('Meta criada');
    },
    onError: () => toast.error('Não deu para criar a meta'),
  });
}

export function useUpdateGoal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: UpdateGoalInput }) =>
      updateGoal(id, patch),
    onSuccess: () => {
      invalidateGoals(qc);
      toast.success('Meta atualizada');
    },
    onError: () => toast.error('Não deu para atualizar a meta'),
  });
}

export function useArchiveGoal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => archiveGoal(id),
    onSuccess: () => {
      invalidateGoals(qc);
      toast.success('Meta arquivada');
    },
    onError: () => toast.error('Não deu para arquivar a meta'),
  });
}

export function useUpsertGoalContribution() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      goalId: string;
      month: string;
      amountCents: number;
      notes?: string | null;
    }) => upsertMonthContribution(input),
    onSuccess: (_data, vars) => {
      invalidateGoals(qc, vars.month);
      toast.success('Aporte registrado');
    },
    onError: () => toast.error('Não deu para registrar o aporte'),
  });
}
