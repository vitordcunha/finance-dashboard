import { createContext } from 'react';
import type { Household } from '@/data/supabase/types';

export type HouseholdContextValue = {
  household: Household | null;
  householdId: string | null;
  loading: boolean;
  error: Error | null;
  refresh: () => Promise<void>;
  create: (name: string) => Promise<Household>;
  join: (inviteCode: string) => Promise<Household>;
};

export const HouseholdContext = createContext<HouseholdContextValue | null>(null);
