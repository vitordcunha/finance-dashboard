import { describe, expect, it } from 'vitest';
import { cardLimitSnapshot } from './limit';

describe('cardLimitSnapshot', () => {
  it('calcula disponível', () => {
    expect(cardLimitSnapshot(500_000, 120_000)).toEqual({
      limitCents: 500_000,
      usedCents: 120_000,
      availableCents: 380_000,
    });
  });

  it('disponível não fica negativo', () => {
    expect(cardLimitSnapshot(10_000, 15_000).availableCents).toBe(0);
  });
});
