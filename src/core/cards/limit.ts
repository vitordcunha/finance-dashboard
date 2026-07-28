import { asCents, sub, type Cents } from '@/core/money';

/** Limite · usado · disponível do cartão (centavos). */
export type CardLimitSnapshot = {
  limitCents: Cents;
  usedCents: Cents;
  availableCents: Cents;
};

/**
 * `used` = soma das compras (expenses) da competence aberta atual.
 * `available` = max(0, limit − used).
 */
export function cardLimitSnapshot(
  creditLimitCents: number,
  usedCents: number,
): CardLimitSnapshot {
  const limit = asCents(creditLimitCents);
  const used = asCents(usedCents);
  const available = asCents(Math.max(0, sub(limit, used)));
  return { limitCents: limit, usedCents: used, availableCents: available };
}
