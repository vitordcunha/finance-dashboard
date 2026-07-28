import { add, sub } from '@/core/money';
import {
  sumMonthMovements,
  type CashTx,
  type MonthMovements,
} from '@/core/cashflow/movements';
import {
  resolveOpeningBalance,
  type OpeningBalance,
  type OpeningSource,
} from '@/core/cashflow/opening';

export type MonthCashSnapshot = {
  opening: OpeningBalance;
  movements: MonthMovements;
  /** abertura + net dos movimentos. */
  closingImpliedCents: number;
  /** Fechamento declarado deste mês, se houver. */
  declaredCloseCents: number | null;
  /** closingImplied − declared (positivo = implícito maior). */
  closeGapCents: number | null;
};

/**
 * Caixa do mês: abertura + movimentos → fechamento implícito.
 *
 * A abertura vem do saldo real derivado da âncora (calcule com
 * `cashBalanceAt` no último dia do mês anterior). Sem âncora, cai no
 * fechamento declarado à mão.
 */
export function buildMonthCashSnapshot(input: {
  transactions: CashTx[];
  /** Saldo no último dia do mês anterior, derivado da âncora. */
  anchoredOpeningCents?: number | null;
  declaredPreviousCloseCents?: number | null;
  declaredCloseCents?: number | null;
  /** Contas que guardam caixa — cartão de crédito fica de fora. */
  cashAccountIds?: ReadonlySet<string> | null;
}): MonthCashSnapshot {
  const cash = input.cashAccountIds ?? null;

  const opening = resolveOpeningBalance({
    anchoredCents: input.anchoredOpeningCents,
    declaredPreviousCloseCents: input.declaredPreviousCloseCents,
  });

  const movements = sumMonthMovements(input.transactions, cash);
  const closingImpliedCents = add(opening.cents, movements.netCents);

  const declaredCloseCents =
    input.declaredCloseCents != null && Number.isInteger(input.declaredCloseCents)
      ? input.declaredCloseCents
      : null;

  const closeGapCents =
    declaredCloseCents != null
      ? sub(closingImpliedCents, declaredCloseCents)
      : null;

  return {
    opening,
    movements,
    closingImpliedCents,
    declaredCloseCents,
    closeGapCents,
  };
}

export type { OpeningSource, MonthMovements };
