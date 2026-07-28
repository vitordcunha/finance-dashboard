import { describe, expect, it } from 'vitest';
import {
  buildGoalContributionByPerson,
  ceilDivCents,
  computeGoalPace,
  monthsInclusive,
  projectGoalReserves,
  sumHouseholdGoalContributions,
} from './pace';

describe('monthsInclusive', () => {
  it('conta o mês atual e o deadline', () => {
    expect(monthsInclusive('2026-07', '2026-07')).toBe(1);
    expect(monthsInclusive('2026-07', '2026-09')).toBe(3);
    expect(monthsInclusive('2026-11', '2027-01')).toBe(3);
  });
});

describe('ceilDivCents', () => {
  it('arredonda para cima em centavos', () => {
    expect(ceilDivCents(100, 3)).toBe(34);
    expect(ceilDivCents(10_000, 4)).toBe(2_500);
    expect(ceilDivCents(0, 5)).toBe(0);
  });
});

describe('computeGoalPace', () => {
  it('calcula aporte necessário até o deadline', () => {
    const pace = computeGoalPace({
      targetCents: 120_000,
      savedCents: 20_000,
      deadlineMonth: '2026-12',
      asOfMonth: '2026-07',
      currentMonthContributionCents: 0,
    });
    // 100_000 / 6 meses = 16_667 ceil
    expect(pace.monthsRemaining).toBe(6);
    expect(pace.requiredMonthlyCents).toBe(16_667);
    expect(pace.status).toBe('behind');
    expect(pace.remainingCents).toBe(100_000);
  });

  it('on_track quando aporte do mês cobre o ritmo', () => {
    const pace = computeGoalPace({
      targetCents: 100_000,
      savedCents: 0,
      deadlineMonth: '2026-08',
      asOfMonth: '2026-07',
      currentMonthContributionCents: 50_000,
    });
    expect(pace.requiredMonthlyCents).toBe(50_000);
    expect(pace.status).toBe('on_track');
  });

  it('ahead quando aporte > necessário', () => {
    const pace = computeGoalPace({
      targetCents: 100_000,
      savedCents: 0,
      deadlineMonth: '2026-08',
      asOfMonth: '2026-07',
      currentMonthContributionCents: 60_000,
    });
    expect(pace.status).toBe('ahead');
  });

  it('done quando saved >= target', () => {
    const pace = computeGoalPace({
      targetCents: 50_000,
      savedCents: 50_000,
      deadlineMonth: '2026-12',
      asOfMonth: '2026-07',
    });
    expect(pace.status).toBe('done');
    expect(pace.requiredMonthlyCents).toBe(0);
    expect(pace.remainingCents).toBe(0);
  });

  it('no_deadline sem prazo', () => {
    const pace = computeGoalPace({
      targetCents: 50_000,
      savedCents: 10_000,
      deadlineMonth: null,
      asOfMonth: '2026-07',
    });
    expect(pace.status).toBe('no_deadline');
    expect(pace.requiredMonthlyCents).toBeNull();
  });

  it('overdue quando deadline passou e ainda falta', () => {
    const pace = computeGoalPace({
      targetCents: 50_000,
      savedCents: 10_000,
      deadlineMonth: '2026-06',
      asOfMonth: '2026-07',
    });
    expect(pace.status).toBe('overdue');
    expect(pace.monthsRemaining).toBe(0);
  });
});

describe('buildGoalContributionByPerson / sumHousehold', () => {
  const goals = [
    { id: 'g-casa', personId: null },
    { id: 'g-eu', personId: 'p1' },
    { id: 'g-outro', personId: 'p2' },
  ];
  const contributions = [
    { goalId: 'g-casa', amountCents: 20_000 },
    { goalId: 'g-eu', amountCents: 15_000 },
    { goalId: 'g-outro', amountCents: 5_000 },
  ];

  it('separa pessoais por pessoa', () => {
    expect(buildGoalContributionByPerson({ goals, contributions })).toEqual({
      p1: 15_000,
      p2: 5_000,
    });
  });

  it('soma só metas da casa', () => {
    expect(
      sumHouseholdGoalContributions({ goals, contributions }),
    ).toBe(20_000);
  });
});

describe('projectGoalReserves', () => {
  it('acumula ritmo até o alvo', () => {
    const months = projectGoalReserves({
      goals: [
        {
          id: 'g1',
          name: 'Viagem',
          personId: null,
          targetCents: 30_000,
          savedCents: 0,
          deadlineMonth: '2026-09',
        },
      ],
      fromYm: '2026-07',
      horizonMonths: 3,
    });
    // 30_000 / 3 = 10_000/mês
    expect(months[0].plannedContributionCents).toBe(10_000);
    expect(months[0].reservedTotalCents).toBe(10_000);
    expect(months[2].reservedTotalCents).toBe(30_000);
    expect(months[2].plannedContributionCents).toBe(10_000);
  });

  it('sem deadline não projeta aporte', () => {
    const months = projectGoalReserves({
      goals: [
        {
          id: 'g1',
          name: 'Fundo',
          personId: null,
          targetCents: 100_000,
          savedCents: 40_000,
          deadlineMonth: null,
        },
      ],
      fromYm: '2026-07',
      horizonMonths: 2,
    });
    expect(months[0].plannedContributionCents).toBe(0);
    expect(months[0].reservedTotalCents).toBe(40_000);
    expect(months[1].reservedTotalCents).toBe(40_000);
  });
});
