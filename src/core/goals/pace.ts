import { asCents, type Cents } from '@/core/money';
import {
  addMonths,
  assertYearMonth,
  compareYearMonth,
  type YearMonth,
} from '@/core/month';

export type PaceStatus =
  | 'on_track'
  | 'behind'
  | 'ahead'
  | 'done'
  | 'no_deadline'
  | 'overdue';

export type GoalPace = {
  targetCents: Cents;
  savedCents: Cents;
  remainingCents: Cents;
  /** Meses inclusivos de `asOfMonth` até o deadline; null sem deadline. */
  monthsRemaining: number | null;
  /** Aporte mensal necessário (ceil) para bater o alvo no deadline. */
  requiredMonthlyCents: Cents | null;
  /** Aporte já registrado no mês de referência. */
  currentMonthContributionCents: Cents;
  status: PaceStatus;
  progressBps: number;
};

/** Meses inclusivos entre dois `yyyy-MM` (ex.: 07→09 = 3). */
export function monthsInclusive(fromYm: string, toYm: string): number {
  assertYearMonth(fromYm);
  assertYearMonth(toYm);
  const [fy, fm] = fromYm.split('-').map(Number);
  const [ty, tm] = toYm.split('-').map(Number);
  return (ty - fy) * 12 + (tm - fm) + 1;
}

/** Divisão de centavos com teto (ceil) — evita ficar curto no último mês. */
export function ceilDivCents(numerator: number, divisor: number): Cents {
  if (divisor <= 0) throw new Error(`divisor inválido: ${divisor}`);
  if (numerator <= 0) return asCents(0);
  return asCents(Math.floor((numerator + divisor - 1) / divisor));
}

/**
 * Ritmo da meta: quanto falta, aporte necessário/mês e status vs aporte atual.
 */
export function computeGoalPace(input: {
  targetCents: number;
  savedCents: number;
  deadlineMonth: string | null;
  asOfMonth: string;
  currentMonthContributionCents?: number;
}): GoalPace {
  const asOfMonth = assertYearMonth(input.asOfMonth);
  const targetCents = asCents(Math.max(0, input.targetCents));
  const savedCents = asCents(Math.max(0, input.savedCents));
  const remainingRaw = Math.max(0, targetCents - savedCents);
  const remainingCents = asCents(remainingRaw);
  const currentMonthContributionCents = asCents(
    Math.max(0, input.currentMonthContributionCents ?? 0),
  );

  const progressBps =
    targetCents === 0
      ? 10_000
      : Math.min(10_000, Math.floor((savedCents * 10_000) / targetCents));

  if (remainingRaw === 0) {
    return {
      targetCents,
      savedCents,
      remainingCents,
      monthsRemaining: input.deadlineMonth
        ? Math.max(0, monthsInclusive(asOfMonth, assertYearMonth(input.deadlineMonth)))
        : null,
      requiredMonthlyCents: asCents(0),
      currentMonthContributionCents,
      status: 'done',
      progressBps,
    };
  }

  if (!input.deadlineMonth) {
    return {
      targetCents,
      savedCents,
      remainingCents,
      monthsRemaining: null,
      requiredMonthlyCents: null,
      currentMonthContributionCents,
      status: 'no_deadline',
      progressBps,
    };
  }

  const deadline = assertYearMonth(input.deadlineMonth);
  if (compareYearMonth(deadline, asOfMonth) < 0) {
    return {
      targetCents,
      savedCents,
      remainingCents,
      monthsRemaining: 0,
      requiredMonthlyCents: null,
      currentMonthContributionCents,
      status: 'overdue',
      progressBps,
    };
  }

  const monthsRemaining = monthsInclusive(asOfMonth, deadline);
  const requiredMonthlyCents = ceilDivCents(remainingRaw, monthsRemaining);

  let status: PaceStatus = 'on_track';
  if (currentMonthContributionCents > requiredMonthlyCents) {
    status = 'ahead';
  } else if (currentMonthContributionCents < requiredMonthlyCents) {
    status = 'behind';
  }

  return {
    targetCents,
    savedCents,
    remainingCents,
    monthsRemaining,
    requiredMonthlyCents,
    currentMonthContributionCents,
    status,
    progressBps,
  };
}

export type GoalForContribution = {
  id: string;
  personId: string | null;
};

export type ContributionLine = {
  goalId: string;
  amountCents: number;
};

/**
 * Soma aportes do mês por pessoa (metas pessoais).
 * Metas da casa (`personId` null) não entram aqui — vão para o spendable Casa.
 */
export function buildGoalContributionByPerson(input: {
  goals: ReadonlyArray<GoalForContribution>;
  contributions: ReadonlyArray<ContributionLine>;
}): Record<string, number> {
  const personByGoal = new Map(
    input.goals.map((g) => [g.id, g.personId] as const),
  );
  const byPerson: Record<string, number> = {};

  for (const line of input.contributions) {
    const personId = personByGoal.get(line.goalId);
    if (!personId) continue;
    byPerson[personId] = (byPerson[personId] ?? 0) + line.amountCents;
  }

  return byPerson;
}

/** Soma aportes do mês em metas da casa (`personId` null). */
export function sumHouseholdGoalContributions(input: {
  goals: ReadonlyArray<GoalForContribution>;
  contributions: ReadonlyArray<ContributionLine>;
}): Cents {
  const casaGoalIds = new Set(
    input.goals.filter((g) => g.personId === null).map((g) => g.id),
  );
  let sum = 0;
  for (const line of input.contributions) {
    if (!casaGoalIds.has(line.goalId)) continue;
    sum += line.amountCents;
  }
  return asCents(sum);
}

export type GoalForReserve = {
  id: string;
  name: string;
  personId: string | null;
  targetCents: number;
  savedCents: number;
  deadlineMonth: string | null;
};

export type MonthGoalReserve = {
  ym: YearMonth;
  /** Soma dos aportes de ritmo previstos no mês. */
  plannedContributionCents: Cents;
  /** Reserva acumulada (saved inicial + aportes projetados até este mês). */
  reservedTotalCents: Cents;
  goals: Array<{
    id: string;
    name: string;
    personId: string | null;
    contributionCents: Cents;
    reservedCents: Cents;
  }>;
};

/**
 * Projeta reserva de metas mês a mês (ritmo fixo a partir de `fromYm`).
 * Determinístico; metas sem deadline só carregam o `saved` (sem aporte futuro).
 */
export function projectGoalReserves(input: {
  goals: ReadonlyArray<GoalForReserve>;
  fromYm: string;
  horizonMonths: number;
}): MonthGoalReserve[] {
  const fromYm = assertYearMonth(input.fromYm);
  const horizon = input.horizonMonths;
  if (horizon < 1) throw new Error(`horizon inválido: ${horizon}`);

  type State = {
    id: string;
    name: string;
    personId: string | null;
    targetCents: number;
    reservedCents: number;
    requiredMonthlyCents: number;
    deadlineMonth: string | null;
  };

  const states: State[] = input.goals.map((g) => {
    const pace = computeGoalPace({
      targetCents: g.targetCents,
      savedCents: g.savedCents,
      deadlineMonth: g.deadlineMonth,
      asOfMonth: fromYm,
      currentMonthContributionCents: 0,
    });
    return {
      id: g.id,
      name: g.name,
      personId: g.personId,
      targetCents: g.targetCents,
      reservedCents: Math.max(0, g.savedCents),
      requiredMonthlyCents: pace.requiredMonthlyCents ?? 0,
      deadlineMonth: g.deadlineMonth,
    };
  });

  const months: MonthGoalReserve[] = [];

  for (let i = 0; i < horizon; i++) {
    const ym = addMonths(fromYm, i);

    let plannedContributionCents = 0;
    const goalRows: MonthGoalReserve['goals'] = [];

    for (const state of states) {
      let contribution = 0;
      const stillNeeds = state.targetCents - state.reservedCents;
      if (
        stillNeeds > 0 &&
        state.requiredMonthlyCents > 0 &&
        state.deadlineMonth &&
        compareYearMonth(ym, state.deadlineMonth) <= 0
      ) {
        contribution = Math.min(state.requiredMonthlyCents, stillNeeds);
        state.reservedCents += contribution;
        plannedContributionCents += contribution;
      }

      goalRows.push({
        id: state.id,
        name: state.name,
        personId: state.personId,
        contributionCents: asCents(contribution),
        reservedCents: asCents(state.reservedCents),
      });
    }

    months.push({
      ym,
      plannedContributionCents: asCents(plannedContributionCents),
      reservedTotalCents: asCents(
        states.reduce((s, g) => s + g.reservedCents, 0),
      ),
      goals: goalRows,
    });
  }

  return months;
}
