import { sub } from '@/core/money';

export type PersonalSpendable = {
  remainingCents: number;
  incomeCents: number;
  quotaCents: number;
  personalExpenseCents: number;
  goalContributionCents: number;
  /** Sem renda efetiva → herói menos útil. */
  hasIncome: boolean;
  overBudget: boolean;
};

/**
 * Herói Eu (VISION):
 * renda − cota casa − gastos pessoais − aportes de meta.
 * Metas: desconto real via goalContributionCents (Fase 12).
 */
export function computePersonalSpendable(input: {
  incomeCents: number;
  quotaCents: number;
  personalExpenseCents: number;
  goalContributionCents?: number;
}): PersonalSpendable {
  const goalContributionCents = input.goalContributionCents ?? 0;
  const remainingCents = sub(
    sub(sub(input.incomeCents, input.quotaCents), input.personalExpenseCents),
    goalContributionCents,
  );

  return {
    remainingCents,
    incomeCents: input.incomeCents,
    quotaCents: input.quotaCents,
    personalExpenseCents: input.personalExpenseCents,
    goalContributionCents,
    hasIncome: input.incomeCents > 0,
    overBudget: remainingCents < 0,
  };
}
