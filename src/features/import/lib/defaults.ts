import { getLocal, setLocal } from '@/lib/storage';

const PERSON_KEY = 'import:lastPersonId';
/** Sentinel: última importação usou Casa (`person_id` null). */
const CASA_SENTINEL = '__casa__';

export type StoredImportPerson = {
  personId: string | null;
  personIsCasa: boolean;
};

export function readStoredImportPerson(): StoredImportPerson {
  const raw = getLocal<string | null>(PERSON_KEY, null);
  if (raw === CASA_SENTINEL) {
    return { personId: null, personIsCasa: true };
  }
  if (typeof raw === 'string' && raw.length > 0) {
    return { personId: raw, personIsCasa: false };
  }
  return { personId: null, personIsCasa: false };
}

export function writeStoredImportPerson(personId: string | null): void {
  if (personId === null) {
    setLocal(PERSON_KEY, CASA_SENTINEL);
    return;
  }
  setLocal(PERSON_KEY, personId);
}

/**
 * Default do dono no import: Eu → último escolhido → dono da conta → Casa.
 * Casa só entra se o usuário já escolheu explicitamente ou não há Eu.
 */
export function resolveImportPersonId(input: {
  mePersonId: string | null;
  accountPersonId: string | null | undefined;
  peopleIds: string[];
}): string | null {
  const stored = readStoredImportPerson();

  if (stored.personIsCasa) return null;

  if (stored.personId && input.peopleIds.includes(stored.personId)) {
    return stored.personId;
  }

  if (input.mePersonId && input.peopleIds.includes(input.mePersonId)) {
    return input.mePersonId;
  }

  if (
    input.accountPersonId &&
    input.peopleIds.includes(input.accountPersonId)
  ) {
    return input.accountPersonId;
  }

  return null;
}
