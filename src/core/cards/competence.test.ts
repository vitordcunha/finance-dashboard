import { describe, expect, it } from 'vitest';
import {
  competenceMonthFromClosingDay,
  effectiveClosingDay,
  resolveCompetenceMonth,
} from './competence';

describe('competenceMonthFromClosingDay', () => {
  it('sem closingDay usa mês calendário', () => {
    expect(competenceMonthFromClosingDay('2026-07-25', null)).toBe('2026-07');
    expect(competenceMonthFromClosingDay('2026-07-25', undefined)).toBe(
      '2026-07',
    );
  });

  it('compra até o fechamento fica no mês corrente', () => {
    // fechamento dia 10
    expect(competenceMonthFromClosingDay('2026-07-10', 10)).toBe('2026-07');
    expect(competenceMonthFromClosingDay('2026-07-01', 10)).toBe('2026-07');
  });

  it('compra após o fechamento vai para o mês seguinte', () => {
    expect(competenceMonthFromClosingDay('2026-07-11', 10)).toBe('2026-08');
    expect(competenceMonthFromClosingDay('2026-07-25', 10)).toBe('2026-08');
  });

  it('atravessa ano', () => {
    expect(competenceMonthFromClosingDay('2026-12-15', 10)).toBe('2027-01');
  });

  it('cap de closing_day em fevereiro', () => {
    expect(effectiveClosingDay(2026, 1, 31)).toBe(28);
    // 28/fev com closing 31 → day <= 28 → competência fevereiro
    expect(competenceMonthFromClosingDay('2026-02-28', 31)).toBe('2026-02');
  });
});

describe('resolveCompetenceMonth', () => {
  it('credit usa closing_day', () => {
    expect(
      resolveCompetenceMonth({
        date: '2026-07-15',
        accountKind: 'credit',
        closingDay: 10,
      }),
    ).toBe('2026-08');
  });

  it('checking ignora closing_day', () => {
    expect(
      resolveCompetenceMonth({
        date: '2026-07-15',
        accountKind: 'checking',
        closingDay: 10,
      }),
    ).toBe('2026-07');
  });
});
