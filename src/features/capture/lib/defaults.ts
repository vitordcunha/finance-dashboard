import { getLocal, setLocal } from '@/lib/storage';
import type { AppScope } from '@/core/scope/filter';

const ACCOUNT_KEY = 'capture:lastAccountId';
const PERSON_KEY = 'capture:lastPersonId';
/** Sentinel: última captura foi da Casa (`person_id` null). */
const PERSON_CASA = '__casa__';

export function getCaptureDefaults(): {
  accountId: string | null;
  personId: string | null;
  /** true se o usuário escolheu Casa explicitamente na última vez. */
  personIsCasa: boolean;
} {
  const rawPerson = getLocal<string | null>(PERSON_KEY, null);
  if (rawPerson === PERSON_CASA) {
    return {
      accountId: getLocal<string | null>(ACCOUNT_KEY, null),
      personId: null,
      personIsCasa: true,
    };
  }
  return {
    accountId: getLocal<string | null>(ACCOUNT_KEY, null),
    personId: rawPerson,
    personIsCasa: false,
  };
}

export function saveCaptureDefaults(input: {
  accountId?: string | null;
  personId?: string | null;
}): void {
  if (input.accountId) setLocal(ACCOUNT_KEY, input.accountId);
  if (input.personId === undefined) return;
  if (input.personId === null) {
    setLocal(PERSON_KEY, PERSON_CASA);
  } else {
    setLocal(PERSON_KEY, input.personId);
  }
}

/**
 * Default de “Quem” coerente com o escopo atual.
 * Escopo Eu → minha pessoa; Casa/Tudo → último default (incl. Casa explícita).
 */
export function resolveCapturePersonDefault(input: {
  scope: AppScope;
  mePersonId: string | null;
  peopleIds: string[];
}): string | null {
  const stored = getCaptureDefaults();

  if (input.scope === 'eu' && input.mePersonId) {
    return input.mePersonId;
  }

  if (stored.personIsCasa) return null;
  if (stored.personId && input.peopleIds.includes(stored.personId)) {
    return stored.personId;
  }
  return null;
}
