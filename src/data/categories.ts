import { getSupabase } from '@/data/supabase/client';
import type { Category, Database } from '@/data/supabase/types';

export type CategoryKind = Category['kind'];

export type CreateCategoryInput = {
  householdId: string;
  name: string;
  kind: CategoryKind;
  essential?: boolean;
  color?: string | null;
  parentId?: string | null;
  sort?: number;
};

export type UpdateCategoryInput = {
  name?: string;
  kind?: CategoryKind;
  essential?: boolean;
  color?: string | null;
  parentId?: string | null;
  sort?: number;
};

export async function listCategories(householdId: string): Promise<Category[]> {
  const { data, error } = await getSupabase()
    .from('categories')
    .select('*')
    .eq('household_id', householdId)
    .order('sort', { ascending: true });

  if (error) throw error;
  return data ?? [];
}

export async function createCategory(
  input: CreateCategoryInput,
): Promise<Category> {
  const { data, error } = await getSupabase()
    .from('categories')
    .insert({
      household_id: input.householdId,
      name: input.name.trim(),
      kind: input.kind,
      essential: input.essential ?? false,
      color: input.color ?? null,
      parent_id: input.parentId ?? null,
      sort: input.sort ?? 0,
    })
    .select('*')
    .single();

  if (error) throw error;
  return data;
}

export async function updateCategory(
  id: string,
  patch: UpdateCategoryInput,
): Promise<Category> {
  const update: Database['public']['Tables']['categories']['Update'] = {};

  if (patch.name !== undefined) update.name = patch.name.trim();
  if (patch.kind !== undefined) update.kind = patch.kind;
  if (patch.essential !== undefined) update.essential = patch.essential;
  if (patch.color !== undefined) update.color = patch.color;
  if (patch.parentId !== undefined) update.parent_id = patch.parentId;
  if (patch.sort !== undefined) update.sort = patch.sort;

  const { data, error } = await getSupabase()
    .from('categories')
    .update(update)
    .eq('id', id)
    .select('*')
    .single();

  if (error) throw error;
  return data;
}
