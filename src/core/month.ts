import {
  addMonths as dfAddMonths,
  endOfMonth,
  format,
  parse as dfParse,
  startOfMonth,
} from 'date-fns';
import { ptBR } from 'date-fns/locale';

const YM_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

/** Mês de competência no formato `yyyy-MM`. */
export type YearMonth = string;

export function isYearMonth(value: string): value is YearMonth {
  return YM_RE.test(value);
}

export function assertYearMonth(value: string): YearMonth {
  if (!isYearMonth(value)) {
    throw new Error(`Mês inválido (esperado yyyy-MM): ${value}`);
  }
  return value;
}

function toDate(ym: string): Date {
  assertYearMonth(ym);
  return dfParse(`${ym}-01`, 'yyyy-MM-dd', new Date());
}

export function currentYearMonth(now = new Date()): YearMonth {
  return format(now, 'yyyy-MM');
}

/** Extrai `yyyy-MM` de uma data ISO (`yyyy-MM-dd`) ou `Date`. */
export function yearMonthFromDate(date: string | Date): YearMonth {
  if (typeof date === 'string') {
    return assertYearMonth(date.slice(0, 7));
  }
  return format(date, 'yyyy-MM');
}

/** Soma (ou subtrai) meses a um `yyyy-MM`. */
export function addMonths(ym: string, delta: number): YearMonth {
  const next = dfAddMonths(toDate(ym), delta);
  return format(next, 'yyyy-MM');
}

/** Intervalo inclusivo de datas ISO do mês (`yyyy-MM-dd`). */
export function monthRange(ym: string): { start: string; end: string } {
  const base = toDate(ym);
  return {
    start: format(startOfMonth(base), 'yyyy-MM-dd'),
    end: format(endOfMonth(base), 'yyyy-MM-dd'),
  };
}

/** Ex.: "julho de 2026". */
export function formatMonth(ym: string, pattern = "MMMM 'de' yyyy"): string {
  return format(toDate(ym), pattern, { locale: ptBR });
}

/** Ex.: "jul. 2026" — útil em switchers. */
export function formatMonthShort(ym: string): string {
  return format(toDate(ym), 'MMM yyyy', { locale: ptBR });
}

export function compareYearMonth(a: string, b: string): number {
  assertYearMonth(a);
  assertYearMonth(b);
  return a < b ? -1 : a > b ? 1 : 0;
}
