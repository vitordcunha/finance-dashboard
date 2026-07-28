import {
  computeEffectiveBurden,
  computeFairness,
  computeQuotas,
  quotaForPerson,
} from '@/core/contribution/quota';
import {
  resolveMonthIncomes,
  sumCasaExpenses,
  sumPaidCasa,
  sumPersonalExpenses,
  type IncomePlanLine,
  type IncomeTx,
} from '@/core/contribution/income';
import {
  computeShareBps,
  type ContributionMode,
  type ShareResult,
} from '@/core/contribution/share';
import {
  computePersonalSpendable,
  type PersonalSpendable,
} from '@/core/contribution/spendable-eu';

export type { ContributionMode, ShareResult, PersonalSpendable };
export type { IncomePlanLine, IncomeTx };

export type PersonContribution = {
  personId: string;
  shareBps: number;
  incomeCents: number;
  /** Soma das linhas de renda do plano para a pessoa. */
  planIncomeCents: number;
  /** Soma das transactions `income` da pessoa no mês. */
  actualIncomeCents: number;
  quotaCents: number;
  personalExpenseCents: number;
  paidCasaCents: number;
  fairnessCents: number;
  effectiveBurdenCents: number;
  spendable: PersonalSpendable;
};

export type ContributionSnapshot = {
  mode: ContributionMode;
  share: ShareResult;
  incomesByPerson: Record<string, number>;
  casaExpenseCents: number;
  quotas: Record<string, number>;
  byPerson: Record<string, PersonContribution>;
};

/**
 * Agrega cota + métricas Eu para o mês.
 * `goalContributionByPerson` = aportes de meta pessoal no mês.
 */
export function buildContributionSnapshot(input: {
  mode: ContributionMode;
  personIds: string[];
  planIncomeLines: IncomePlanLine[];
  incomeTransactions: IncomeTx[];
  /** Despesas do mês (actual). */
  expenses: {
    personId: string | null;
    amountCents: number;
    accountId: string | null;
  }[];
  /** Despesas Casa planejadas (person_id null) — base da cota no herói. */
  plannedCasaExpenseCents?: number;
  accountOwnerById: Record<string, string | null | undefined>;
  customBps?: Record<string, number> | null;
  goalContributionByPerson?: Record<string, number>;
}): ContributionSnapshot {
  const incomesByPerson = resolveMonthIncomes({
    personIds: input.personIds,
    planIncomeLines: input.planIncomeLines,
    incomeTransactions: input.incomeTransactions,
  });

  const share = computeShareBps({
    mode: input.mode,
    personIds: input.personIds,
    incomesByPerson,
    customBps: input.customBps,
  });

  const actualCasa = sumCasaExpenses(input.expenses);
  const casaExpenseCents =
    input.plannedCasaExpenseCents !== undefined
      ? input.plannedCasaExpenseCents
      : actualCasa;

  const quotas = computeQuotas(share.shares, casaExpenseCents);

  const byPerson: Record<string, PersonContribution> = {};
  for (const personId of input.personIds) {
    const shareBps = share.shares[personId] ?? 0;
    const incomeCents = incomesByPerson[personId] ?? 0;
    const planIncomeCents = input.planIncomeLines
      .filter((l) => l.personId === personId)
      .reduce((sum, l) => sum + l.amountCents, 0);
    const actualIncomeCents = input.incomeTransactions
      .filter((t) => t.personId === personId)
      .reduce((sum, t) => sum + t.amountCents, 0);
    const quotaCents = quotas[personId] ?? 0;
    const personalExpenseCents = sumPersonalExpenses(input.expenses, personId);
    const paidCasaCents = sumPaidCasa({
      expenses: input.expenses,
      accountOwnerById: input.accountOwnerById,
      mePersonId: personId,
    });
    const fairnessCents = computeFairness(paidCasaCents, quotaCents);
    const effectiveBurdenCents = computeEffectiveBurden(
      personalExpenseCents,
      casaExpenseCents,
      shareBps,
    );
    const goalContributionCents =
      input.goalContributionByPerson?.[personId] ?? 0;
    const spendable = computePersonalSpendable({
      incomeCents,
      quotaCents,
      personalExpenseCents,
      goalContributionCents,
    });

    byPerson[personId] = {
      personId,
      shareBps,
      incomeCents,
      planIncomeCents,
      actualIncomeCents,
      quotaCents,
      personalExpenseCents,
      paidCasaCents,
      fairnessCents,
      effectiveBurdenCents,
      spendable,
    };
  }

  return {
    mode: input.mode,
    share,
    incomesByPerson,
    casaExpenseCents,
    quotas,
    byPerson,
  };
}

export {
  computeShareBps,
  computeQuotas,
  quotaForPerson,
  computeFairness,
  computeEffectiveBurden,
  computePersonalSpendable,
  resolveMonthIncomes,
  sumCasaExpenses,
  sumPersonalExpenses,
  sumPaidCasa,
};
