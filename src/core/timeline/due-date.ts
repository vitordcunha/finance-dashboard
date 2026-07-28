import { getDaysInMonth } from 'date-fns';
import { assertYearMonth } from '@/core/month';

/**
 * Dia de vencimento dentro do mês, com clamp no último dia.
 * `31` funciona como "último dia do mês": fevereiro vira 28/29, abril vira 30.
 */
export function dueDateInMonth(ym: string, dueDay: number): string {
  assertYearMonth(ym);
  if (!Number.isInteger(dueDay) || dueDay < 1 || dueDay > 31) {
    throw new Error(`dueDay inválido: ${dueDay}`);
  }
  const [y, m] = ym.split('-').map(Number);
  const dim = getDaysInMonth(new Date(y!, m! - 1, 1));
  const day = Math.min(dueDay, dim);
  return `${ym}-${String(day).padStart(2, '0')}`;
}
