import { sub } from '@/core/money';
import type { MonthMovements } from '@/core/cashflow/movements';
import type { OpeningBalance } from '@/core/cashflow/opening';

export type CashSpendable = {
  remainingCents: number;
  openingCents: number;
  openingSource: OpeningBalance['source'];
  incomeCents: number;
  expenseCents: number;
  transferOutCents: number;
  transferInCents: number;
  /** Cota Casa reservada (plano). */
  quotaReserveCents: number;
  goalContributionCents: number;
  /** Faturas / vencimentos com valor conhecido. */
  duesReserveCents: number;
  /** opening + income − expense − transferNet */
  cashBeforeReservesCents: number;
  overBudget: boolean;
  hasOpeningOrIncome: boolean;
};

/**
 * Herói Eu (caixa): abertura + movimentos − reservas (cota + metas + vencimentos).
 * Não soma linha do Plano como renda — evita double-count com a abertura.
 */
export function computeCashSpendable(input: {
  opening: OpeningBalance;
  movements: MonthMovements;
  quotaReserveCents?: number;
  goalContributionCents?: number;
  duesReserveCents?: number;
}): CashSpendable {
  const quotaReserveCents = input.quotaReserveCents ?? 0;
  const goalContributionCents = input.goalContributionCents ?? 0;
  const duesReserveCents = input.duesReserveCents ?? 0;

  const { opening, movements } = input;
  const cashBeforeReservesCents =
    opening.cents +
    movements.incomeCents -
    movements.expenseCents -
    movements.transferOutCents +
    movements.transferInCents;

  const remainingCents = sub(
    sub(sub(cashBeforeReservesCents, quotaReserveCents), goalContributionCents),
    duesReserveCents,
  );

  return {
    remainingCents,
    openingCents: opening.cents,
    openingSource: opening.source,
    incomeCents: movements.incomeCents,
    expenseCents: movements.expenseCents,
    transferOutCents: movements.transferOutCents,
    transferInCents: movements.transferInCents,
    quotaReserveCents,
    goalContributionCents,
    duesReserveCents,
    cashBeforeReservesCents,
    overBudget: remainingCents < 0,
    hasOpeningOrIncome:
      opening.cents !== 0 ||
      opening.source !== 'none' ||
      movements.incomeCents > 0,
  };
}
