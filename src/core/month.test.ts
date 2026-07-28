import { describe, expect, it } from 'vitest';
import {
  addMonths,
  compareYearMonth,
  currentYearMonth,
  formatMonth,
  formatMonthShort,
  isYearMonth,
  monthRange,
  yearMonthFromDate,
} from './month';

describe('month', () => {
  it('valida yyyy-MM', () => {
    expect(isYearMonth('2026-07')).toBe(true);
    expect(isYearMonth('2026-13')).toBe(false);
    expect(isYearMonth('26-07')).toBe(false);
  });

  it('addMonths atravessa ano', () => {
    expect(addMonths('2026-07', 1)).toBe('2026-08');
    expect(addMonths('2026-12', 1)).toBe('2027-01');
    expect(addMonths('2026-01', -1)).toBe('2025-12');
  });

  it('monthRange cobre o mês inteiro', () => {
    expect(monthRange('2026-02')).toEqual({
      start: '2026-02-01',
      end: '2026-02-28',
    });
    expect(monthRange('2024-02').end).toBe('2024-02-29');
  });

  it('formatMonth em pt-BR', () => {
    expect(formatMonth('2026-07')).toBe('julho de 2026');
    expect(formatMonthShort('2026-07').toLowerCase()).toContain('jul');
    expect(formatMonthShort('2026-07')).toContain('2026');
  });

  it('compareYearMonth ordena', () => {
    expect(compareYearMonth('2026-01', '2026-02')).toBe(-1);
    expect(compareYearMonth('2026-07', '2026-07')).toBe(0);
  });

  it('currentYearMonth usa data dada', () => {
    expect(currentYearMonth(new Date('2026-07-25T12:00:00'))).toBe('2026-07');
  });

  it('yearMonthFromDate extrai competência', () => {
    expect(yearMonthFromDate('2026-07-25')).toBe('2026-07');
    expect(yearMonthFromDate(new Date('2026-12-01T12:00:00'))).toBe('2026-12');
  });
});
