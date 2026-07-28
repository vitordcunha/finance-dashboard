-- Fase 12: meta Casa (person_id null) vs meta pessoal.
alter table public.goals
  add column person_id uuid references public.people(id) on delete set null;

create index goals_person_idx on public.goals (household_id, person_id);

-- Um aporte por meta/mês (upsert na app).
alter table public.goal_contributions
  add constraint goal_contributions_goal_month_unique unique (goal_id, month);
