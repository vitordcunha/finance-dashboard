import { getSupabase } from '@/data/supabase/client';
import type { Database, Person } from '@/data/supabase/types';

export type CreatePersonInput = {
  householdId: string;
  name: string;
  shortName: string;
  color?: string;
  userId?: string | null;
  sort?: number;
};

export type UpdatePersonInput = {
  name?: string;
  shortName?: string;
  color?: string;
  userId?: string | null;
  sort?: number;
};

export async function listPeople(householdId: string): Promise<Person[]> {
  const { data, error } = await getSupabase()
    .from('people')
    .select('*')
    .eq('household_id', householdId)
    .order('sort', { ascending: true });

  if (error) throw error;
  return data ?? [];
}

export async function createPerson(input: CreatePersonInput): Promise<Person> {
  const { data, error } = await getSupabase()
    .from('people')
    .insert({
      household_id: input.householdId,
      name: input.name.trim(),
      short_name: input.shortName.trim(),
      color: input.color ?? '#2f5d50',
      user_id: input.userId ?? null,
      sort: input.sort ?? 0,
    })
    .select('*')
    .single();

  if (error) throw error;
  return data;
}

export async function updatePerson(
  id: string,
  patch: UpdatePersonInput,
): Promise<Person> {
  const update: Database['public']['Tables']['people']['Update'] = {};

  if (patch.name !== undefined) update.name = patch.name.trim();
  if (patch.shortName !== undefined) update.short_name = patch.shortName.trim();
  if (patch.color !== undefined) update.color = patch.color;
  if (patch.userId !== undefined) update.user_id = patch.userId;
  if (patch.sort !== undefined) update.sort = patch.sort;

  const { data, error } = await getSupabase()
    .from('people')
    .update(update)
    .eq('id', id)
    .select('*')
    .single();

  if (error) throw error;
  return data;
}
