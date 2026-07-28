import { useContext } from 'react';
import { ScopeContext } from '@/features/scope/scope-context';

export function useScope() {
  const ctx = useContext(ScopeContext);
  if (!ctx) throw new Error('useScope deve ser usado dentro de ScopeProvider');
  return ctx;
}
