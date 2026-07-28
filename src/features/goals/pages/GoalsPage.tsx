import { useMemo, useState } from 'react';
import { Plus, Target } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { PageHeader } from '@/components/ui/PageHeader';
import { Skeleton } from '@/components/ui/Skeleton';
import { currentYearMonth } from '@/core/month';
import { usePeopleQuery } from '@/features/capture/hooks/useCaptureLookups';
import { ContributeSheet } from '@/features/goals/components/ContributeSheet';
import { GoalCard } from '@/features/goals/components/GoalCard';
import { GoalFormSheet } from '@/features/goals/components/GoalFormSheet';
import {
  useArchiveGoal,
  useGoalContributions,
  useGoals,
} from '@/features/goals/hooks/useGoals';
import type { Goal } from '@/types/models';

export function GoalsPage() {
  const ym = currentYearMonth();
  const goalsQuery = useGoals();
  const contribQuery = useGoalContributions(ym);
  const peopleQuery = usePeopleQuery();
  const archive = useArchiveGoal();

  const [formOpen, setFormOpen] = useState(false);
  const [contributeGoal, setContributeGoal] = useState<Goal | null>(null);

  const contributionByGoal = useMemo(() => {
    const map = new Map<string, number>();
    for (const c of contribQuery.data ?? []) {
      map.set(c.goalId, (map.get(c.goalId) ?? 0) + c.amountCents);
    }
    return map;
  }, [contribQuery.data]);

  const personNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const p of peopleQuery.data ?? []) {
      map.set(p.id, p.name);
    }
    return map;
  }, [peopleQuery.data]);

  const isLoading =
    goalsQuery.isLoading || contribQuery.isLoading || peopleQuery.isLoading;
  const isError =
    goalsQuery.isError || contribQuery.isError || peopleQuery.isError;

  const goals = goalsQuery.data ?? [];

  return (
    <div className="mx-auto max-w-2xl space-y-6 animate-fade-in">
      <PageHeader
        eyebrow="Metas"
        title="Objetivos e ritmo"
        description="Reserve com prazo. O aporte do mês reduz o quanto ainda dá para gastar."
        action={
          <Button size="sm" onClick={() => setFormOpen(true)}>
            <Plus className="size-3.5" aria-hidden />
            Nova
          </Button>
        }
      />

      {isLoading ? (
        <div className="space-y-3">
          <Skeleton className="h-36 w-full rounded-xl" />
          <Skeleton className="h-36 w-full rounded-xl" />
        </div>
      ) : null}

      {isError ? (
        <EmptyState
          icon={Target}
          title="Não deu para carregar as metas"
          description="Tente de novo em instantes."
          action={
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                void goalsQuery.refetch();
                void contribQuery.refetch();
              }}
            >
              Tentar de novo
            </Button>
          }
        />
      ) : null}

      {!isLoading && !isError && goals.length === 0 ? (
        <EmptyState
          icon={Target}
          title="Nenhuma meta ainda"
          description="Crie um objetivo com valor e, se quiser, um prazo — o ritmo aparece aqui e no Futuro."
          action={
            <Button onClick={() => setFormOpen(true)}>Criar primeira meta</Button>
          }
        />
      ) : null}

      {!isLoading && !isError && goals.length > 0 ? (
        <div className="space-y-3">
          {goals.map((goal) => (
            <GoalCard
              key={goal.id}
              goal={goal}
              personName={
                goal.personId
                  ? (personNameById.get(goal.personId) ?? null)
                  : null
              }
              asOfMonth={ym}
              monthContributionCents={contributionByGoal.get(goal.id) ?? 0}
              onContribute={() => setContributeGoal(goal)}
              onArchive={() => {
                if (
                  window.confirm(
                    `Arquivar “${goal.name}”? O progresso fica guardado, mas some da lista.`,
                  )
                ) {
                  void archive.mutateAsync(goal.id);
                }
              }}
            />
          ))}
        </div>
      ) : null}

      <GoalFormSheet open={formOpen} onClose={() => setFormOpen(false)} />
      <ContributeSheet
        open={Boolean(contributeGoal)}
        onClose={() => setContributeGoal(null)}
        goal={contributeGoal}
        monthContributionCents={
          contributeGoal
            ? (contributionByGoal.get(contributeGoal.id) ?? 0)
            : 0
        }
      />
    </div>
  );
}
