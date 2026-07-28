import { getSupabase } from '@/data/supabase/client';
import type {
  GoalContributionRow,
  GoalRow,
  Database,
} from '@/data/supabase/types';
import type { Goal, GoalContribution } from '@/types/models';

function mapGoal(row: GoalRow): Goal {
  return {
    id: row.id,
    householdId: row.household_id,
    name: row.name,
    targetCents: row.target_cents,
    savedCents: row.saved_cents,
    personId: row.person_id,
    deadlineMonth: row.deadline_month,
    priority: row.priority,
    estimated: row.estimated,
    archived: row.archived,
    notes: row.notes,
    createdAt: row.created_at,
  };
}

function mapContribution(row: GoalContributionRow): GoalContribution {
  return {
    id: row.id,
    goalId: row.goal_id,
    month: row.month,
    amountCents: row.amount_cents,
    notes: row.notes,
    createdAt: row.created_at,
  };
}

export type CreateGoalInput = {
  householdId: string;
  name: string;
  targetCents: number;
  savedCents?: number;
  personId?: string | null;
  deadlineMonth?: string | null;
  priority?: number;
  estimated?: boolean;
  notes?: string | null;
};

export type UpdateGoalInput = {
  name?: string;
  targetCents?: number;
  personId?: string | null;
  deadlineMonth?: string | null;
  priority?: number;
  estimated?: boolean;
  archived?: boolean;
  notes?: string | null;
};

export async function listGoals(
  householdId: string,
  options: { includeArchived?: boolean } = {},
): Promise<Goal[]> {
  let query = getSupabase()
    .from('goals')
    .select('*')
    .eq('household_id', householdId)
    .order('priority', { ascending: false })
    .order('created_at', { ascending: true });

  if (!options.includeArchived) {
    query = query.eq('archived', false);
  }

  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []).map(mapGoal);
}

export async function createGoal(input: CreateGoalInput): Promise<Goal> {
  const { data, error } = await getSupabase()
    .from('goals')
    .insert({
      household_id: input.householdId,
      name: input.name.trim(),
      target_cents: input.targetCents,
      saved_cents: input.savedCents ?? 0,
      person_id: input.personId ?? null,
      deadline_month: input.deadlineMonth ?? null,
      priority: input.priority ?? 0,
      estimated: input.estimated ?? false,
      notes: input.notes?.trim() || null,
    })
    .select('*')
    .single();

  if (error) throw error;
  return mapGoal(data);
}

export async function updateGoal(
  id: string,
  patch: UpdateGoalInput,
): Promise<Goal> {
  const update: Database['public']['Tables']['goals']['Update'] = {};

  if (patch.name !== undefined) update.name = patch.name.trim();
  if (patch.targetCents !== undefined) update.target_cents = patch.targetCents;
  if (patch.personId !== undefined) update.person_id = patch.personId;
  if (patch.deadlineMonth !== undefined) {
    update.deadline_month = patch.deadlineMonth;
  }
  if (patch.priority !== undefined) update.priority = patch.priority;
  if (patch.estimated !== undefined) update.estimated = patch.estimated;
  if (patch.archived !== undefined) update.archived = patch.archived;
  if (patch.notes !== undefined) {
    update.notes = patch.notes?.trim() || null;
  }

  const { data, error } = await getSupabase()
    .from('goals')
    .update(update)
    .eq('id', id)
    .select('*')
    .single();

  if (error) throw error;
  return mapGoal(data);
}

export async function archiveGoal(id: string): Promise<Goal> {
  return updateGoal(id, { archived: true });
}

export async function listContributionsForMonth(
  householdId: string,
  month: string,
): Promise<GoalContribution[]> {
  const goals = await listGoals(householdId, { includeArchived: true });
  if (goals.length === 0) return [];

  const goalIds = goals.map((g) => g.id);
  const { data, error } = await getSupabase()
    .from('goal_contributions')
    .select('*')
    .in('goal_id', goalIds)
    .eq('month', month);

  if (error) throw error;
  return (data ?? []).map(mapContribution);
}

export async function listContributionsForGoal(
  goalId: string,
): Promise<GoalContribution[]> {
  const { data, error } = await getSupabase()
    .from('goal_contributions')
    .select('*')
    .eq('goal_id', goalId)
    .order('month', { ascending: false });

  if (error) throw error;
  return (data ?? []).map(mapContribution);
}

/**
 * Define o aporte do mês (upsert). Ajusta `saved_cents` pela diferença.
 */
export async function upsertMonthContribution(input: {
  goalId: string;
  month: string;
  amountCents: number;
  notes?: string | null;
}): Promise<{ contribution: GoalContribution; goal: Goal }> {
  if (input.amountCents < 0) {
    throw new Error('Aporte não pode ser negativo');
  }

  const { data: goalRow, error: goalError } = await getSupabase()
    .from('goals')
    .select('*')
    .eq('id', input.goalId)
    .single();

  if (goalError) throw goalError;

  const { data: existing, error: existingError } = await getSupabase()
    .from('goal_contributions')
    .select('*')
    .eq('goal_id', input.goalId)
    .eq('month', input.month)
    .maybeSingle();

  if (existingError) throw existingError;

  const previousAmount = existing?.amount_cents ?? 0;
  const delta = input.amountCents - previousAmount;
  const nextSaved = Math.max(0, goalRow.saved_cents + delta);

  let contributionRow: GoalContributionRow;

  if (existing) {
    const { data, error } = await getSupabase()
      .from('goal_contributions')
      .update({
        amount_cents: input.amountCents,
        notes: input.notes?.trim() || null,
      })
      .eq('id', existing.id)
      .select('*')
      .single();
    if (error) throw error;
    contributionRow = data;
  } else {
    const { data, error } = await getSupabase()
      .from('goal_contributions')
      .insert({
        goal_id: input.goalId,
        month: input.month,
        amount_cents: input.amountCents,
        notes: input.notes?.trim() || null,
      })
      .select('*')
      .single();
    if (error) throw error;
    contributionRow = data;
  }

  const { data: updatedGoal, error: updateError } = await getSupabase()
    .from('goals')
    .update({ saved_cents: nextSaved })
    .eq('id', input.goalId)
    .select('*')
    .single();

  if (updateError) throw updateError;

  return {
    contribution: mapContribution(contributionRow),
    goal: mapGoal(updatedGoal),
  };
}
