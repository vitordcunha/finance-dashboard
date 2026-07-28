import { allocateByWeights, BPS_TOTAL } from '@/core/contribution/share';
import { sub } from '@/core/money';

/**
 * Cota (household_share) por pessoa = share_bps × gastos da Casa.
 * Distribui sem perder centavos (largest remainder).
 */
export function computeQuotas(
  sharesBps: Record<string, number>,
  casaExpenseCents: number,
): Record<string, number> {
  const personIds = Object.keys(sharesBps);
  const weights = personIds.map((id) => sharesBps[id] ?? 0);
  return allocateByWeights(personIds, weights, casaExpenseCents);
}

export function quotaForPerson(
  sharesBps: Record<string, number>,
  casaExpenseCents: number,
  personId: string,
): number {
  return computeQuotas(sharesBps, casaExpenseCents)[personId] ?? 0;
}

/**
 * Fairness = o que paguei de Casa − minha cota.
 * Positivo → paguei a mais que a cota; negativo → a menos.
 * Informativo — sem settle-up.
 */
export function computeFairness(
  paidCasaCents: number,
  quotaCents: number,
): number {
  return sub(paidCasaCents, quotaCents);
}

/**
 * Carga efetiva = gastos pessoais + rateio analítico da Casa.
 */
export function computeEffectiveBurden(
  personalExpenseCents: number,
  casaExpenseCents: number,
  shareBps: number,
): number {
  const sharePart = Math.floor((casaExpenseCents * shareBps) / BPS_TOTAL);
  return personalExpenseCents + sharePart;
}
