import { MoneyText } from '@/components/money/MoneyText';
import { Button } from '@/components/ui/Button';
import { Panel } from '@/components/ui/Panel';
import {
  computeGoalPace,
  type PaceStatus,
} from '@/core/goals';
import { formatMonth } from '@/core/month';
import type { Goal } from '@/types/models';
import { cn } from '@/lib/cn';

type GoalCardProps = {
  goal: Goal;
  personName: string | null;
  asOfMonth: string;
  monthContributionCents: number;
  onContribute: () => void;
  onArchive: () => void;
};

function statusLabel(status: PaceStatus): string {
  switch (status) {
    case 'done':
      return 'Meta atingida';
    case 'on_track':
      return 'No ritmo';
    case 'ahead':
      return 'Adiantado';
    case 'behind':
      return 'Abaixo do ritmo';
    case 'overdue':
      return 'Prazo passou';
    case 'no_deadline':
      return 'Sem prazo';
  }
}

export function GoalCard({
  goal,
  personName,
  asOfMonth,
  monthContributionCents,
  onContribute,
  onArchive,
}: GoalCardProps) {
  const pace = computeGoalPace({
    targetCents: goal.targetCents,
    savedCents: goal.savedCents,
    deadlineMonth: goal.deadlineMonth,
    asOfMonth,
    currentMonthContributionCents: monthContributionCents,
  });

  const progressPct = (pace.progressBps / 100).toFixed(
    pace.progressBps % 100 === 0 ? 0 : 1,
  );
  const owner = goal.personId ? (personName ?? 'Pessoal') : 'Casa';

  return (
    <Panel className="space-y-4 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-display text-lg font-medium tracking-tight text-text">
            {goal.name}
          </p>
          <p className="mt-0.5 text-xs text-text-muted">
            {owner}
            {goal.deadlineMonth
              ? ` · até ${formatMonth(goal.deadlineMonth, 'MMM yyyy')}`
              : null}
          </p>
        </div>
        <span
          className={cn(
            'shrink-0 rounded-md px-2 py-0.5 text-[11px] font-medium',
            pace.status === 'done' || pace.status === 'ahead'
              ? 'bg-accent/15 text-accent'
              : pace.status === 'behind' || pace.status === 'overdue'
                ? 'bg-warning/15 text-warning'
                : 'bg-surface-elevated text-text-muted',
          )}
        >
          {statusLabel(pace.status)}
        </span>
      </div>

      <div>
        <div className="mb-1.5 flex items-baseline justify-between gap-2 text-sm">
          <MoneyText cents={goal.savedCents} className="text-sm text-text" />
          <span className="text-text-muted">
            de <MoneyText cents={goal.targetCents} tone="muted" className="text-sm" />
            {' · '}
            {progressPct}%
          </span>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-border">
          <div
            className="h-full rounded-full bg-accent transition-[width] duration-300"
            style={{ width: `${Math.min(100, pace.progressBps / 100)}%` }}
          />
        </div>
      </div>

      <div className="space-y-1 text-sm text-text-muted">
        {pace.requiredMonthlyCents != null && pace.status !== 'done' ? (
          <p>
            Ritmo:{' '}
            <MoneyText
              cents={pace.requiredMonthlyCents}
              className="text-sm text-text"
            />
            /mês
            {' · '}
            este mês{' '}
            <MoneyText
              cents={monthContributionCents}
              className="text-sm text-text"
            />
          </p>
        ) : pace.status === 'no_deadline' ? (
          <p>
            Este mês:{' '}
            <MoneyText
              cents={monthContributionCents}
              className="text-sm text-text"
            />
            {' · '}
            falta{' '}
            <MoneyText
              cents={pace.remainingCents}
              className="text-sm text-text"
            />
          </p>
        ) : pace.status === 'done' ? (
          <p>Reserva completa — não desconta mais o disponível.</p>
        ) : pace.status === 'overdue' ? (
          <p>
            Ainda faltam{' '}
            <MoneyText
              cents={pace.remainingCents}
              className="text-sm text-text"
            />
          </p>
        ) : null}
      </div>

      <div className="flex flex-wrap gap-2">
        <Button size="sm" onClick={onContribute}>
          Registrar aporte
        </Button>
        <Button size="sm" variant="ghost" onClick={onArchive}>
          Arquivar
        </Button>
      </div>
    </Panel>
  );
}
