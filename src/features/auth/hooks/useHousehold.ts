import { useContext } from 'react';
import { HouseholdContext } from '@/features/auth/hooks/household-context';

export function useHousehold() {
  const ctx = useContext(HouseholdContext);
  if (!ctx) throw new Error('useHousehold deve ser usado dentro de HouseholdProvider');
  return ctx;
}
