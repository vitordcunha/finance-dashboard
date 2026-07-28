import { describe, expect, it } from 'vitest';
import {
  buildMonthCashSnapshot,
  computeCashSpendable,
  resolveOpeningBalance,
  sumMonthMovements,
} from '@/core/cashflow';

describe('sumMonthMovements', () => {
  it('soma income, expense e transfer out', () => {
    const m = sumMonthMovements([
      { kind: 'income', amountCents: 290_568 },
      { kind: 'expense', amountCents: 198_657 },
      { kind: 'transfer', amountCents: 902_062 },
    ]);
    expect(m.incomeCents).toBe(290_568);
    expect(m.expenseCents).toBe(198_657);
    expect(m.transferOutCents).toBe(902_062);
    expect(m.transferInCents).toBe(0);
    expect(m.netCents).toBe(290_568 - 198_657 - 902_062);
  });

  it('conta transfer in quando destino é conta de caixa', () => {
    const cash = new Set(['acc-b']);
    const m = sumMonthMovements(
      [
        {
          kind: 'transfer',
          amountCents: 50_000,
          accountId: 'acc-a',
          transferAccountId: 'acc-b',
        },
      ],
      cash,
    );
    expect(m.transferOutCents).toBe(50_000);
    expect(m.transferInCents).toBe(50_000);
    expect(m.netCents).toBe(0);
  });

  it('pagamento de fatura sai do caixa e não volta', () => {
    // Cartão não guarda caixa: não entra em cashAccountIds.
    const cash = new Set(['corrente']);
    const m = sumMonthMovements(
      [
        {
          kind: 'transfer',
          amountCents: 340_000,
          accountId: 'corrente',
          transferAccountId: 'cartao',
        },
      ],
      cash,
    );
    expect(m.transferOutCents).toBe(340_000);
    expect(m.transferInCents).toBe(0);
    expect(m.netCents).toBe(-340_000);
  });
});

describe('resolveOpeningBalance', () => {
  it('âncora vence fechamento declarado', () => {
    const o = resolveOpeningBalance({
      anchoredCents: 809_500,
      declaredPreviousCloseCents: 800_000,
    });
    expect(o).toEqual({ cents: 809_500, source: 'anchor' });
  });

  it('cai no declarado sem âncora', () => {
    const o = resolveOpeningBalance({
      anchoredCents: null,
      declaredPreviousCloseCents: 800_000,
    });
    expect(o).toEqual({ cents: 800_000, source: 'declared' });
  });

  it('none quando nada', () => {
    expect(
      resolveOpeningBalance({
        anchoredCents: null,
        declaredPreviousCloseCents: null,
      }).source,
    ).toBe('none');
  });

  it('aceita âncora zerada e negativa', () => {
    expect(
      resolveOpeningBalance({
        anchoredCents: 0,
        declaredPreviousCloseCents: 500_000,
      }),
    ).toEqual({ cents: 0, source: 'anchor' });
    expect(
      resolveOpeningBalance({
        anchoredCents: -12_300,
        declaredPreviousCloseCents: null,
      }),
    ).toEqual({ cents: -12_300, source: 'anchor' });
  });
});

describe('buildMonthCashSnapshot', () => {
  it('abre no saldo ancorado', () => {
    const snap = buildMonthCashSnapshot({
      anchoredOpeningCents: 809_500,
      transactions: [
        { kind: 'income', amountCents: 340_745 },
        { kind: 'expense', amountCents: 801_766 },
        { kind: 'transfer', amountCents: 340_000 },
      ],
    });
    expect(snap.opening).toEqual({ cents: 809_500, source: 'anchor' });
    expect(snap.closingImpliedCents).toBe(
      809_500 + 340_745 - 801_766 - 340_000,
    );
  });

  it('usa fechamento declarado do mês anterior sem âncora', () => {
    const snap = buildMonthCashSnapshot({
      declaredPreviousCloseCents: 1_000_000,
      transactions: [{ kind: 'expense', amountCents: 10_000 }],
    });
    expect(snap.opening).toEqual({ cents: 1_000_000, source: 'declared' });
    expect(snap.closingImpliedCents).toBe(990_000);
  });

  it('sem âncora nem declarado abre em zero', () => {
    const snap = buildMonthCashSnapshot({
      transactions: [{ kind: 'expense', amountCents: 10_000 }],
    });
    expect(snap.opening.source).toBe('none');
    expect(snap.closingImpliedCents).toBe(-10_000);
  });
});

describe('computeCashSpendable', () => {
  it('reserva cota e metas (modo B)', () => {
    const s = computeCashSpendable({
      opening: { cents: 800_000, source: 'anchor' },
      movements: {
        incomeCents: 100_000,
        expenseCents: 50_000,
        transferOutCents: 200_000,
        transferInCents: 0,
        netCents: -150_000,
      },
      quotaReserveCents: 100_000,
      goalContributionCents: 20_000,
      duesReserveCents: 30_000,
    });
    // 800 + 100 - 50 - 200 = 650; −100 −20 −30 = 500
    expect(s.cashBeforeReservesCents).toBe(650_000);
    expect(s.remainingCents).toBe(500_000);
    expect(s.overBudget).toBe(false);
  });

  it('marca overBudget quando negativo', () => {
    const s = computeCashSpendable({
      opening: { cents: 0, source: 'none' },
      movements: {
        incomeCents: 100_000,
        expenseCents: 80_000,
        transferOutCents: 50_000,
        transferInCents: 0,
        netCents: -30_000,
      },
      quotaReserveCents: 0,
    });
    expect(s.remainingCents).toBe(-30_000);
    expect(s.overBudget).toBe(true);
  });
});
