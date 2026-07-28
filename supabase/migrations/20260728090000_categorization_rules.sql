-- Regras de categorização por fingerprint de descrição de extrato.
-- Match determinístico (sem regex/fuzzy). Ver core/categorization.

create table public.categorization_rules (
  id             uuid primary key default gen_random_uuid(),
  household_id   uuid not null references public.households(id) on delete cascade,
  fingerprint    text not null,
  match_example  text not null default '',
  category_id    uuid not null references public.categories(id) on delete cascade,
  person_id      uuid references public.people(id) on delete set null,
  hits           integer not null default 0 check (hits >= 0),
  enabled        boolean not null default true,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (household_id, fingerprint)
);

create index categorization_rules_household_idx
  on public.categorization_rules (household_id)
  where enabled;

comment on table public.categorization_rules is
  'Regra: fingerprint estável da descrição → category. Aplicada no import.';

comment on column public.categorization_rules.fingerprint is
  'Chave normalizada (core/categorization/fingerprint). Unique por household.';

comment on column public.categorization_rules.match_example is
  'Descrição original que gerou a regra — só para UI.';

alter table public.categorization_rules enable row level security;

create policy categorization_rules_all on public.categorization_rules
  for all
  using (public.is_household_member(household_id))
  with check (public.is_household_member(household_id));

grant select, insert, update, delete on public.categorization_rules to authenticated;
