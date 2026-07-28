import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { AppScope } from '@/core/scope/filter';
import { getLocal, setLocal } from '@/lib/storage';
import { useAuth } from '@/features/auth/hooks/useAuth';
import { usePeopleQuery } from '@/features/capture/hooks/useCaptureLookups';
import {
  ScopeContext,
  type ScopeContextValue,
} from '@/features/scope/scope-context';

const SCOPE_KEY = 'scope:current';

function isAppScope(value: unknown): value is AppScope {
  return value === 'casa' || value === 'eu' || value === 'tudo';
}

export function ScopeProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const peopleQuery = usePeopleQuery();
  const [scope, setScopeState] = useState<AppScope>(() => {
    const stored = getLocal<unknown>(SCOPE_KEY, 'casa');
    return isAppScope(stored) ? stored : 'casa';
  });

  const setScope = useCallback((next: AppScope) => {
    setScopeState(next);
    setLocal(SCOPE_KEY, next);
  }, []);

  const mePerson = useMemo(() => {
    if (!user?.id || !peopleQuery.data) return null;
    return peopleQuery.data.find((p) => p.user_id === user.id) ?? null;
  }, [user?.id, peopleQuery.data]);

  const mePersonId = mePerson?.id ?? null;
  const euUnresolved = scope === 'eu' && !mePersonId;

  // Se o usuário escolhe Eu sem pessoa ligada, mantém o estado (UI avisa).
  useEffect(() => {
    // noop — reservado para sync futuro
  }, [scope, mePersonId]);

  const value = useMemo<ScopeContextValue>(
    () => ({
      scope,
      setScope,
      mePerson,
      mePersonId,
      euUnresolved,
    }),
    [scope, setScope, mePerson, mePersonId, euUnresolved],
  );

  return (
    <ScopeContext.Provider value={value}>{children}</ScopeContext.Provider>
  );
}
