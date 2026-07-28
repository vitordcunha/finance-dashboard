import type { Household } from '@/data/supabase/types';
import { getSupabase } from '@/data/supabase/client';

export async function fetchMyHousehold(): Promise<Household | null> {
  const { data, error } = await getSupabase().rpc('get_my_household');
  if (error) throw error;
  // PostgREST pode devolver row com campos null em vez de JSON null.
  if (!data?.id) return null;
  return data;
}

export async function createHousehold(name: string): Promise<Household> {
  const { data, error } = await getSupabase().rpc('create_household', {
    p_name: name,
  });
  if (error) throw error;
  if (!data) throw new Error('Falha ao criar casa');
  return data;
}

export async function joinHousehold(inviteCode: string): Promise<Household> {
  const { data, error } = await getSupabase().rpc('join_household', {
    p_invite_code: inviteCode,
  });
  if (error) throw error;
  if (!data) throw new Error('Código inválido');
  return data;
}

export function getHouseholdId(household: Household | null | undefined): string | null {
  return household?.id ?? null;
}
