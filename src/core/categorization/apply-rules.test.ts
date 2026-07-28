import { describe, expect, it } from 'vitest';
import {
  categoryByLineFromRules,
  indexRulesByFingerprint,
  resolveRule,
} from './apply-rules';

const rules = [
  {
    fingerprint: 'ifood club',
    categoryId: 'cat-food',
    personId: null,
    enabled: true,
  },
  {
    fingerprint: 'carrefour ppa',
    categoryId: 'cat-market',
    personId: 'person-1',
    enabled: false,
  },
];

describe('apply-rules', () => {
  it('resolveRule acha por fingerprint normalizado da descrição', () => {
    const index = indexRulesByFingerprint(rules);
    const hit = resolveRule('IFD*IFOOD CLUB Osasco BRA', index);
    expect(hit?.categoryId).toBe('cat-food');
  });

  it('ignora regras disabled', () => {
    const index = indexRulesByFingerprint(rules);
    expect(resolveRule('CARREFOUR PPA 106 PORTO ALEGRE BRA', index)).toBeNull();
  });

  it('categoryByLineFromRules mapeia só as que batem', () => {
    const map = categoryByLineFromRules(
      [
        { id: 'a', descriptionRaw: 'IFD*IFOOD CLUB Osasco BRA' },
        { id: 'b', descriptionRaw: 'POSTO SILVADO Porto Alegre BRA' },
      ],
      rules,
    );
    expect(map.get('a')).toBe('cat-food');
    expect(map.has('b')).toBe(false);
  });
});
