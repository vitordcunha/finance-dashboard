/**
 * Resumo do mês para o assistente Telegram — leitura enxuta, não o painel.
 *
 * Folga ≈ caixa hoje − previsto que ainda sai − colchão.
 * Não replica o `lowestAhead` da timeline (timing intra-mês); é um digest.
 */

export type MonthSummaryInput = {
  /** yyyy-MM */
  ym: string;
  /** yyyy-MM-dd */
  today: string;
  minimumCents: number;
  cashTodayCents: number;
  cashSource: 'anchor' | 'none';
  actualIncomeCents: number;
  actualExpenseCents: number;
  /** Despesas planned com date >= today no mês. */
  plannedExpenseRemainingCents: number;
};

export type MonthSummary = {
  ym: string;
  hasCash: boolean;
  cashTodayCents: number;
  actualIncomeCents: number;
  actualExpenseCents: number;
  plannedExpenseRemainingCents: number;
  minimumCents: number;
  /** Null se não há âncora de caixa. */
  freeToSpendCents: number | null;
  daysLeft: number;
  safeDailyCents: number | null;
};

function daysInMonth(ym: string): number {
  const [y, m] = ym.split('-').map(Number);
  return new Date(y!, m!, 0).getDate();
}

/** Dias civis restantes no mês (hoje inclusive → pelo menos 1 se ainda no mês). */
export function daysLeftInMonth(ym: string, today: string): number {
  if (!today.startsWith(ym)) {
    // Fora do mês: se já passou, 0; se futuro, mês inteiro.
    return today < `${ym}-01` ? daysInMonth(ym) : 0;
  }
  const day = Number(today.slice(8, 10));
  const dim = daysInMonth(ym);
  return Math.max(0, dim - day + 1);
}

export function computeMonthSummary(input: MonthSummaryInput): MonthSummary {
  const daysLeft = daysLeftInMonth(input.ym, input.today);
  const hasCash = input.cashSource === 'anchor';

  const freeToSpendCents = hasCash
    ? input.cashTodayCents -
      input.plannedExpenseRemainingCents -
      input.minimumCents
    : null;

  const safeDailyCents =
    freeToSpendCents != null && daysLeft > 0 && freeToSpendCents > 0
      ? Math.floor(freeToSpendCents / daysLeft)
      : freeToSpendCents != null && daysLeft > 0
        ? Math.floor(freeToSpendCents / daysLeft)
        : null;

  return {
    ym: input.ym,
    hasCash,
    cashTodayCents: input.cashTodayCents,
    actualIncomeCents: input.actualIncomeCents,
    actualExpenseCents: input.actualExpenseCents,
    plannedExpenseRemainingCents: input.plannedExpenseRemainingCents,
    minimumCents: input.minimumCents,
    freeToSpendCents,
    daysLeft,
    safeDailyCents,
  };
}

/** Agrega ocorrências do mês para o digest. */
export function aggregateMonthFlows(input: {
  ym: string;
  today: string;
  items: ReadonlyArray<{
    kind: 'income' | 'expense' | 'transfer';
    amountCents: number;
    status: 'actual' | 'planned';
    date: string;
  }>;
}): {
  actualIncomeCents: number;
  actualExpenseCents: number;
  plannedExpenseRemainingCents: number;
} {
  let actualIncomeCents = 0;
  let actualExpenseCents = 0;
  let plannedExpenseRemainingCents = 0;

  for (const item of input.items) {
    if (item.kind === 'transfer') continue;
    if (item.status === 'actual') {
      if (item.kind === 'income') actualIncomeCents += item.amountCents;
      else actualExpenseCents += item.amountCents;
      continue;
    }
    // planned
    if (item.kind === 'expense' && item.date >= input.today) {
      plannedExpenseRemainingCents += item.amountCents;
    }
  }

  return {
    actualIncomeCents,
    actualExpenseCents,
    plannedExpenseRemainingCents,
  };
}
