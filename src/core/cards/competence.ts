import {
  getDaysInMonth,
  parse as dfParse,
  getDate,
  getMonth,
  getYear,
} from 'date-fns';
import {
  addMonths,
  assertYearMonth,
  yearMonthFromDate,
  type YearMonth,
} from '@/core/month';

function toDateOnly(date: string | Date): Date {
  if (typeof date === 'string') {
    return dfParse(date.slice(0, 10), 'yyyy-MM-dd', new Date());
  }
  return date;
}

/**
 * Dia de fechamento efetivo no mês (cap no último dia — ex.: 31 em fev → 28/29).
 */
export function effectiveClosingDay(
  year: number,
  monthIndex0: number,
  closingDay: number,
): number {
  const days = getDaysInMonth(new Date(year, monthIndex0, 1));
  return Math.min(Math.max(1, closingDay), days);
}

/**
 * Competência da fatura a partir da data da compra e do dia de fechamento.
 *
 * Regra BR usual: compras até o fechamento entram na fatura do mês corrente;
 * após o fechamento, na fatura do mês seguinte.
 *
 * Sem `closingDay`, cai no mês calendário (`yearMonthFromDate`).
 */
export function competenceMonthFromClosingDay(
  date: string | Date,
  closingDay: number | null | undefined,
): YearMonth {
  if (closingDay == null || closingDay < 1) {
    return yearMonthFromDate(date);
  }

  const d = toDateOnly(date);
  const year = getYear(d);
  const monthIndex0 = getMonth(d);
  const day = getDate(d);
  const close = effectiveClosingDay(year, monthIndex0, closingDay);

  const calendarYm = yearMonthFromDate(d);
  assertYearMonth(calendarYm);

  if (day <= close) {
    return calendarYm;
  }
  return addMonths(calendarYm, 1);
}

/**
 * Resolve competência para um lançamento: cartão com fechamento usa a regra
 * acima; demais contas usam o mês calendário.
 */
export function resolveCompetenceMonth(input: {
  date: string | Date;
  accountKind?: string | null;
  closingDay?: number | null;
}): YearMonth {
  if (input.accountKind === 'credit') {
    return competenceMonthFromClosingDay(input.date, input.closingDay);
  }
  return yearMonthFromDate(input.date);
}
