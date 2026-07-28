/** Lente global Casa / Eu / Tudo (só UI + filtros; sem ACL). */
export type AppScope = 'casa' | 'eu' | 'tudo';

export type PersonScoped = {
  personId: string | null;
};

/**
 * Resolve se um item entra no escopo atual.
 * - `tudo`: tudo
 * - `casa`: visão conjunta (sem filtro de pessoa)
 * - `eu`: só `personId === mePersonId` (se mePersonId for null, nada passa)
 */
export function matchesPersonScope(
  item: PersonScoped,
  scope: AppScope,
  mePersonId: string | null,
): boolean {
  if (scope === 'tudo' || scope === 'casa') return true;
  if (!mePersonId) return false;
  return item.personId === mePersonId;
}

export function filterByPersonScope<T extends PersonScoped>(
  items: T[],
  scope: AppScope,
  mePersonId: string | null,
): T[] {
  if (scope === 'tudo' || scope === 'casa') return items;
  return items.filter((item) => matchesPersonScope(item, scope, mePersonId));
}
