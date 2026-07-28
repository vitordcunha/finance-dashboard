import { fingerprint } from './fingerprint';

export type CategorizationRuleLike = {
  fingerprint: string;
  categoryId: string;
  personId: string | null;
  enabled: boolean;
};

/**
 * Índice fingerprint → regra (só `enabled`).
 * Em caso de duplicata na lista, a última ganha.
 */
export function indexRulesByFingerprint(
  rules: ReadonlyArray<CategorizationRuleLike>,
): Map<string, CategorizationRuleLike> {
  const map = new Map<string, CategorizationRuleLike>();
  for (const rule of rules) {
    if (!rule.enabled) continue;
    if (!rule.fingerprint) continue;
    map.set(rule.fingerprint, rule);
  }
  return map;
}

/**
 * Resolve regra para uma descrição. Retorna null se fingerprint vazio ou sem regra.
 */
export function resolveRule(
  descriptionRaw: string,
  rulesByFingerprint: ReadonlyMap<string, CategorizationRuleLike>,
): CategorizationRuleLike | null {
  const fp = fingerprint(descriptionRaw);
  if (!fp) return null;
  return rulesByFingerprint.get(fp) ?? null;
}

/**
 * Mapa lineId → categoryId para linhas sem override explícito.
 */
export function categoryByLineFromRules(
  lines: ReadonlyArray<{ id: string; descriptionRaw: string }>,
  rules: ReadonlyArray<CategorizationRuleLike>,
): Map<string, string> {
  const index = indexRulesByFingerprint(rules);
  const out = new Map<string, string>();
  for (const line of lines) {
    const rule = resolveRule(line.descriptionRaw, index);
    if (rule) out.set(line.id, rule.categoryId);
  }
  return out;
}
