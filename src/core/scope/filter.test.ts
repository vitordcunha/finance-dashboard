import { describe, expect, it } from 'vitest';
import { filterByPersonScope, matchesPersonScope } from '@/core/scope/filter';

describe('matchesPersonScope', () => {
  it('casa e tudo passam qualquer personId', () => {
    expect(matchesPersonScope({ personId: null }, 'casa', 'p1')).toBe(true);
    expect(matchesPersonScope({ personId: 'p2' }, 'casa', 'p1')).toBe(true);
    expect(matchesPersonScope({ personId: 'p2' }, 'tudo', 'p1')).toBe(true);
  });

  it('eu filtra pela pessoa do login', () => {
    expect(matchesPersonScope({ personId: 'p1' }, 'eu', 'p1')).toBe(true);
    expect(matchesPersonScope({ personId: 'p2' }, 'eu', 'p1')).toBe(false);
    expect(matchesPersonScope({ personId: null }, 'eu', 'p1')).toBe(false);
  });

  it('eu sem pessoa ligada não passa nada', () => {
    expect(matchesPersonScope({ personId: 'p1' }, 'eu', null)).toBe(false);
    expect(matchesPersonScope({ personId: null }, 'eu', null)).toBe(false);
  });
});

describe('filterByPersonScope', () => {
  const items = [
    { id: 'a', personId: null },
    { id: 'b', personId: 'p1' },
    { id: 'c', personId: 'p2' },
  ];

  it('casa mantém a lista', () => {
    expect(filterByPersonScope(items, 'casa', 'p1')).toHaveLength(3);
  });

  it('eu mantém só a pessoa', () => {
    expect(filterByPersonScope(items, 'eu', 'p1').map((i) => i.id)).toEqual([
      'b',
    ]);
  });
});
