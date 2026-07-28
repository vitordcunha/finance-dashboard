import { asCents, sub, type Cents } from '@/core/money';

/**
 * Gap da fatura (camada B − A).
 * Positivo = banco cobrou mais do que lançamos; negativo = lançamos a mais.
 */
export function invoiceGapCents(
  statementTotalCents: number,
  purchasesSumCents: number,
): Cents {
  return sub(statementTotalCents, purchasesSumCents);
}

export function sumPurchaseCents(
  amounts: ReadonlyArray<{ amountCents: number; kind?: string }>,
): Cents {
  let total = 0;
  for (const row of amounts) {
    if (row.kind != null && row.kind !== 'expense') continue;
    total += row.amountCents;
  }
  return asCents(total);
}

export type PaymentCoverage = 'unpaid' | 'partial' | 'paid';

/**
 * Derivado da soma de statement_payments vs total da fatura.
 * Sem total informado → unpaid (ainda não há fatura para comparar).
 */
export function paymentCoverage(
  statementTotalCents: number | null | undefined,
  paidSumCents: number,
): PaymentCoverage {
  if (statementTotalCents == null || statementTotalCents <= 0) {
    return paidSumCents > 0 ? 'partial' : 'unpaid';
  }
  if (paidSumCents <= 0) return 'unpaid';
  if (paidSumCents >= statementTotalCents) return 'paid';
  return 'partial';
}

export function sumPaymentCents(
  payments: ReadonlyArray<{ amountCents: number }>,
): Cents {
  let total = 0;
  for (const p of payments) {
    total += p.amountCents;
  }
  return asCents(total);
}
