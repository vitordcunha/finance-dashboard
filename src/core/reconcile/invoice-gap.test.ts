import { describe, expect, it } from 'vitest';
import {
  invoiceGapCents,
  paymentCoverage,
  sumPaymentCents,
  sumPurchaseCents,
} from './invoice-gap';

describe('invoiceGapCents', () => {
  it('gap positivo quando fatura > compras', () => {
    expect(invoiceGapCents(50_000, 45_000)).toBe(5_000);
  });

  it('gap zero quando bate', () => {
    expect(invoiceGapCents(19_900, 19_900)).toBe(0);
  });

  it('gap negativo quando lançamos a mais', () => {
    expect(invoiceGapCents(10_000, 12_000)).toBe(-2_000);
  });
});

describe('sumPurchaseCents', () => {
  it('soma só expenses quando kind informado', () => {
    expect(
      sumPurchaseCents([
        { amountCents: 1000, kind: 'expense' },
        { amountCents: 500, kind: 'transfer' },
        { amountCents: 200, kind: 'expense' },
      ]),
    ).toBe(1200);
  });

  it('soma tudo se kind omitido', () => {
    expect(
      sumPurchaseCents([{ amountCents: 100 }, { amountCents: 50 }]),
    ).toBe(150);
  });
});

describe('paymentCoverage', () => {
  it('unpaid / partial / paid', () => {
    expect(paymentCoverage(10_000, 0)).toBe('unpaid');
    expect(paymentCoverage(10_000, 4_000)).toBe('partial');
    expect(paymentCoverage(10_000, 10_000)).toBe('paid');
    expect(paymentCoverage(10_000, 12_000)).toBe('paid');
  });

  it('sem total: unpaid ou partial se já há link', () => {
    expect(paymentCoverage(null, 0)).toBe('unpaid');
    expect(paymentCoverage(null, 100)).toBe('partial');
  });
});

describe('sumPaymentCents', () => {
  it('soma links', () => {
    expect(
      sumPaymentCents([{ amountCents: 3000 }, { amountCents: 2000 }]),
    ).toBe(5000);
  });
});
