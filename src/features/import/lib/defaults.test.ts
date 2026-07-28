import { beforeEach, describe, expect, it, vi } from 'vitest';

const store = new Map<string, unknown>();

vi.mock('@/lib/storage', () => ({
  getLocal: <T,>(key: string, fallback: T): T => {
    if (!store.has(key)) return fallback;
    return store.get(key) as T;
  },
  setLocal: (key: string, value: unknown) => {
    store.set(key, value);
  },
}));

import {
  resolveImportPersonId,
  writeStoredImportPerson,
} from './defaults';

describe('resolveImportPersonId', () => {
  beforeEach(() => {
    store.clear();
  });

  it('prefere Eu quando não há escolha salva', () => {
    expect(
      resolveImportPersonId({
        mePersonId: 'me',
        accountPersonId: 'other',
        peopleIds: ['me', 'other'],
      }),
    ).toBe('me');
  });

  it('respeita Casa explícita salva', () => {
    writeStoredImportPerson(null);
    expect(
      resolveImportPersonId({
        mePersonId: 'me',
        accountPersonId: null,
        peopleIds: ['me'],
      }),
    ).toBeNull();
  });

  it('respeita pessoa salva válida', () => {
    writeStoredImportPerson('other');
    expect(
      resolveImportPersonId({
        mePersonId: 'me',
        accountPersonId: null,
        peopleIds: ['me', 'other'],
      }),
    ).toBe('other');
  });

  it('cai no dono da conta se não há Eu', () => {
    expect(
      resolveImportPersonId({
        mePersonId: null,
        accountPersonId: 'other',
        peopleIds: ['other'],
      }),
    ).toBe('other');
  });
});
