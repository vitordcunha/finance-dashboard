import { describe, expect, it } from 'vitest';
import {
  applyPlanDeltaToAnchor,
  resolveBalanceAnchor,
  toDisplayAbsCents,
  toStoredBalanceCents,
} from './anchor';

describe('resolveBalanceAnchor', () => {
  it('sem saldos → sem âncora', () => {
    const a = resolveBalanceAnchor([]);
    expect(a.hasAnchor).toBe(false);
    expect(a.totalCents).toBe(0);
    expect(a.asOfDate).toBeNull();
  });

  it('soma ativos e dívida de cartão (negativa)', () => {
    const a = resolveBalanceAnchor([
      {
        accountId: 'c1',
        kind: 'checking',
        balanceCents: 100_000,
        asOfDate: '2026-07-20',
      },
      {
        accountId: 'cc',
        kind: 'credit',
        balanceCents: -25_000,
        asOfDate: '2026-07-22',
      },
    ]);
    expect(a.hasAnchor).toBe(true);
    expect(a.totalCents).toBe(75_000);
    expect(a.asOfDate).toBe('2026-07-22');
  });
});

describe('applyPlanDeltaToAnchor', () => {
  it('âncora + líquido do plano', () => {
    expect(applyPlanDeltaToAnchor(50_000, 10_000)).toBe(60_000);
    expect(applyPlanDeltaToAnchor(50_000, -20_000)).toBe(30_000);
  });
});

describe('toStoredBalanceCents / toDisplayAbsCents', () => {
  it('crédito grava dívida negativa', () => {
    expect(toStoredBalanceCents(12_345, 'credit')).toBe(-12_345);
    expect(toDisplayAbsCents(-12_345)).toBe(12_345);
  });

  it('corrente grava positivo', () => {
    expect(toStoredBalanceCents(99_00, 'checking')).toBe(99_00);
    expect(toStoredBalanceCents(-50, 'savings')).toBe(50);
  });
});
