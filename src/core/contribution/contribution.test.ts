import { describe, expect, it } from 'vitest';
import {
  allocateEqual,
  BPS_TOTAL,
  computeShareBps,
} from '@/core/contribution/share';
import {
  computeEffectiveBurden,
  computeFairness,
  computeQuotas,
} from '@/core/contribution/quota';
import { computePersonalSpendable } from '@/core/contribution/spendable-eu';
import {
  resolveMonthIncomes,
  sumCasaExpenses,
  sumPaidCasa,
} from '@/core/contribution/income';
import { buildContributionSnapshot } from '@/core/contribution/index';

const P1 = 'person-a';
const P2 = 'person-b';

describe('computeShareBps', () => {
  it('income_share 60/40 em bps', () => {
    const { shares, usedFallback } = computeShareBps({
      mode: 'income_share',
      personIds: [P1, P2],
      incomesByPerson: { [P1]: 600_000, [P2]: 400_000 },
    });
    expect(usedFallback).toBe(false);
    expect(shares[P1]).toBe(6000);
    expect(shares[P2]).toBe(4000);
    expect(shares[P1]! + shares[P2]!).toBe(BPS_TOTAL);
  });

  it('sem renda → fallback 50/50', () => {
    const { shares, usedFallback, fallbackReason } = computeShareBps({
      mode: 'income_share',
      personIds: [P1, P2],
      incomesByPerson: { [P1]: 0, [P2]: 0 },
    });
    expect(usedFallback).toBe(true);
    expect(fallbackReason).toBe('no_income');
    expect(shares[P1]).toBe(5000);
    expect(shares[P2]).toBe(5000);
  });

  it('equal_50', () => {
    const { shares, fallbackReason } = computeShareBps({
      mode: 'equal_50',
      personIds: [P1, P2],
      incomesByPerson: { [P1]: 900_000, [P2]: 100_000 },
    });
    expect(fallbackReason).toBe('equal_mode');
    expect(shares[P1]).toBe(5000);
    expect(shares[P2]).toBe(5000);
  });

  it('custom bps válido', () => {
    const { shares, usedFallback } = computeShareBps({
      mode: 'custom',
      personIds: [P1, P2],
      incomesByPerson: {},
      customBps: { [P1]: 7000, [P2]: 3000 },
    });
    expect(usedFallback).toBe(false);
    expect(shares[P1]).toBe(7000);
    expect(shares[P2]).toBe(3000);
  });

  it('custom inválido → equal', () => {
    const { shares, usedFallback, fallbackReason } = computeShareBps({
      mode: 'custom',
      personIds: [P1, P2],
      incomesByPerson: {},
      customBps: { [P1]: 7000, [P2]: 2000 },
    });
    expect(usedFallback).toBe(true);
    expect(fallbackReason).toBe('invalid_custom');
    expect(allocateEqual([P1, P2], BPS_TOTAL)).toEqual(shares);
  });
});

describe('cota 60/40', () => {
  it('com rendas 60/40 e Casa R$X, cotas batem em centavos', () => {
    // Casa = R$ 1.000,00 → 100_000 centavos
    const casaX = 100_000;
    const share = computeShareBps({
      mode: 'income_share',
      personIds: [P1, P2],
      incomesByPerson: { [P1]: 600_000, [P2]: 400_000 },
    });
    const quotas = computeQuotas(share.shares, casaX);
    expect(quotas[P1]).toBe(60_000);
    expect(quotas[P2]).toBe(40_000);
    expect(quotas[P1]! + quotas[P2]!).toBe(casaX);
  });

  it('distribui resto de centavos sem perder', () => {
    const casaX = 100_001; // ímpar
    const share = computeShareBps({
      mode: 'income_share',
      personIds: [P1, P2],
      incomesByPerson: { [P1]: 600_000, [P2]: 400_000 },
    });
    const quotas = computeQuotas(share.shares, casaX);
    expect(quotas[P1]! + quotas[P2]!).toBe(casaX);
  });
});

describe('fairness e burden', () => {
  it('fairness = pago Casa − cota', () => {
    expect(computeFairness(70_000, 60_000)).toBe(10_000);
    expect(computeFairness(50_000, 60_000)).toBe(-10_000);
  });

  it('carga efetiva = pessoais + rateio', () => {
    // 30% de 100_000 = 30_000 + 20_000 pessoais
    expect(computeEffectiveBurden(20_000, 100_000, 3000)).toBe(50_000);
  });
});

describe('computePersonalSpendable', () => {
  it('renda − cota − pessoais (− meta 0)', () => {
    const s = computePersonalSpendable({
      incomeCents: 600_000,
      quotaCents: 60_000,
      personalExpenseCents: 40_000,
      goalContributionCents: 0,
    });
    expect(s.remainingCents).toBe(500_000);
    expect(s.hasIncome).toBe(true);
    expect(s.overBudget).toBe(false);
  });

  it('hook de meta reduz spendable (Fase 12)', () => {
    const s = computePersonalSpendable({
      incomeCents: 600_000,
      quotaCents: 60_000,
      personalExpenseCents: 40_000,
      goalContributionCents: 10_000,
    });
    expect(s.remainingCents).toBe(490_000);
  });
});

describe('resolveMonthIncomes', () => {
  it('fixo do plano + estimated quando sem realizado', () => {
    const incomes = resolveMonthIncomes({
      personIds: [P1],
      planIncomeLines: [
        {
          planItemId: '1',
          personId: P1,
          amountCents: 500_000,
          estimated: false,
        },
        {
          planItemId: '2',
          personId: P1,
          amountCents: 50_000,
          estimated: true,
        },
      ],
      incomeTransactions: [],
    });
    expect(incomes[P1]).toBe(550_000);
  });

  it('estimated usa realizado quando há income além do fixo', () => {
    const incomes = resolveMonthIncomes({
      personIds: [P1],
      planIncomeLines: [
        {
          planItemId: '1',
          personId: P1,
          amountCents: 500_000,
          estimated: false,
        },
        {
          planItemId: '2',
          personId: P1,
          amountCents: 50_000,
          estimated: true,
        },
      ],
      incomeTransactions: [{ personId: P1, amountCents: 580_000 }],
    });
    expect(incomes[P1]).toBe(580_000);
  });

  it('sem plano → 0 (extrato não baseia cota)', () => {
    const incomes = resolveMonthIncomes({
      personIds: [P1],
      planIncomeLines: [],
      incomeTransactions: [{ personId: P1, amountCents: 290_568 }],
    });
    expect(incomes[P1]).toBe(0);
  });
});

describe('casa / pago helpers', () => {
  it('sumCasaExpenses só person_id null', () => {
    expect(
      sumCasaExpenses([
        { personId: null, amountCents: 10_000 },
        { personId: P1, amountCents: 5_000 },
      ]),
    ).toBe(10_000);
  });

  it('sumPaidCasa via dono da conta', () => {
    expect(
      sumPaidCasa({
        expenses: [
          { personId: null, amountCents: 30_000, accountId: 'acc-me' },
          { personId: null, amountCents: 20_000, accountId: 'acc-other' },
          { personId: P1, amountCents: 5_000, accountId: 'acc-me' },
        ],
        accountOwnerById: { 'acc-me': P1, 'acc-other': P2 },
        mePersonId: P1,
      }),
    ).toBe(30_000);
  });
});

describe('buildContributionSnapshot', () => {
  it('monta painel Eu completo 60/40', () => {
    const snap = buildContributionSnapshot({
      mode: 'income_share',
      personIds: [P1, P2],
      planIncomeLines: [
        {
          planItemId: 'i1',
          personId: P1,
          amountCents: 600_000,
          estimated: false,
        },
        {
          planItemId: 'i2',
          personId: P2,
          amountCents: 400_000,
          estimated: false,
        },
      ],
      incomeTransactions: [],
      expenses: [
        { personId: null, amountCents: 100_000, accountId: 'a1' },
        { personId: P1, amountCents: 25_000, accountId: 'a1' },
      ],
      plannedCasaExpenseCents: 100_000,
      accountOwnerById: { a1: P1 },
    });

    expect(snap.quotas[P1]).toBe(60_000);
    expect(snap.quotas[P2]).toBe(40_000);
    expect(snap.byPerson[P1]!.spendable.remainingCents).toBe(
      600_000 - 60_000 - 25_000,
    );
    // Casa 100k saiu da conta de P1 → pago 100k − cota 60k
    expect(snap.byPerson[P1]!.paidCasaCents).toBe(100_000);
    expect(snap.byPerson[P1]!.fairnessCents).toBe(40_000);
    expect(snap.byPerson[P1]!.planIncomeCents).toBe(600_000);
    expect(snap.byPerson[P1]!.actualIncomeCents).toBe(0);
    expect(snap.share.usedFallback).toBe(false);
  });
});
