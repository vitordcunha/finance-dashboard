/**
 * Resolve hints em linguagem natural para ids do household.
 * Determinístico; sem fuzzy pesado — igualdade normalizada / includes.
 */

export type HintAccount = { id: string; name: string };
export type HintPerson = { id: string; name: string; shortName: string };
export type HintCategory = {
  id: string;
  name: string;
  kind: 'income' | 'expense' | 'transfer';
};

function norm(s: string): string {
  return s
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .trim();
}

export function resolvePersonHint(
  hint: string | null | undefined,
  people: HintPerson[],
  mePersonId: string | null,
): string | null {
  if (hint == null || hint === '') return null;
  const h = norm(hint);
  if (h === 'casa' || h === 'house' || h === 'lar') return null;
  if (h === 'eu' || h === 'me' || h === 'mim') return mePersonId;

  for (const p of people) {
    if (norm(p.shortName) === h || norm(p.name) === h) return p.id;
  }
  for (const p of people) {
    if (norm(p.name).includes(h) || norm(p.shortName).includes(h)) return p.id;
  }
  return mePersonId;
}

export function resolveAccountHint(
  hint: string | null | undefined,
  accounts: HintAccount[],
  fallbackId: string | null,
): string | null {
  if (!hint) return fallbackId;
  const h = norm(hint);
  for (const a of accounts) {
    if (norm(a.name) === h) return a.id;
  }
  for (const a of accounts) {
    if (norm(a.name).includes(h) || h.includes(norm(a.name))) return a.id;
  }
  return fallbackId;
}

export function resolveCategoryHint(
  hint: string | null | undefined,
  categories: HintCategory[],
  kind: 'income' | 'expense' | 'transfer',
): string | null {
  if (!hint || kind === 'transfer') return null;
  const h = norm(hint);
  const pool = categories.filter((c) => c.kind === kind || c.kind === 'transfer');
  for (const c of pool) {
    if (norm(c.name) === h) return c.id;
  }
  for (const c of pool) {
    if (norm(c.name).includes(h) || h.includes(norm(c.name))) return c.id;
  }
  return null;
}
