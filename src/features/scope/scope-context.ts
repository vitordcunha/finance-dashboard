import { createContext } from 'react';
import type { AppScope } from '@/core/scope/filter';
import type { Person } from '@/data/supabase/types';

export type ScopeContextValue = {
  scope: AppScope;
  setScope: (scope: AppScope) => void;
  /** Pessoa ligada ao login atual (`people.user_id === auth.uid()`). */
  mePerson: Person | null;
  mePersonId: string | null;
  /** true se escopo Eu sem pessoa ligada. */
  euUnresolved: boolean;
};

export const ScopeContext = createContext<ScopeContextValue | null>(null);
