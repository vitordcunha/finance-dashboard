-- Finance Panel · schema inicial
-- Dinheiro em centavos (integer). RLS por household_members.
-- Ordem: helpers sem tabela → tabelas → helpers com tabela → RPCs → RLS.

create extension if not exists "pgcrypto";

-- ── Helpers sem dependência de tabela ───────────────────────────────────────

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.is_year_month(value text)
returns boolean
language sql
immutable
as $$
  select value ~ '^\d{4}-(0[1-9]|1[0-2])$';
$$;

-- ── households ──────────────────────────────────────────────────────────────

create table public.households (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  invite_code text not null unique default substr(replace(gen_random_uuid()::text, '-', ''), 1, 8),
  created_at  timestamptz not null default now()
);

create table public.household_members (
  household_id uuid not null references public.households(id) on delete cascade,
  user_id      uuid not null references auth.users(id) on delete cascade,
  role         text not null default 'member' check (role in ('owner', 'member')),
  created_at   timestamptz not null default now(),
  primary key (household_id, user_id)
);

create unique index household_members_user_unique on public.household_members (user_id);

-- ── people ──────────────────────────────────────────────────────────────────

create table public.people (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  user_id      uuid references auth.users(id) on delete set null,
  name         text not null,
  short_name   text not null,
  color        text not null default '#2f5d50',
  sort         integer not null default 0,
  created_at   timestamptz not null default now()
);

create index people_household_idx on public.people (household_id);

-- ── accounts ────────────────────────────────────────────────────────────────

create table public.accounts (
  id                 uuid primary key default gen_random_uuid(),
  household_id       uuid not null references public.households(id) on delete cascade,
  name               text not null,
  kind               text not null default 'checking'
                     check (kind in ('credit', 'checking', 'cash', 'savings')),
  person_id          uuid references public.people(id) on delete set null,
  color              text not null default '#8a8580',
  credit_limit_cents integer not null default 0 check (credit_limit_cents >= 0),
  closing_day        integer check (closing_day between 1 and 31),
  due_day            integer check (due_day between 1 and 31),
  archived           boolean not null default false,
  sort               integer not null default 0,
  created_at         timestamptz not null default now()
);

create index accounts_household_idx on public.accounts (household_id);

-- ── categories ──────────────────────────────────────────────────────────────

create table public.categories (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  name         text not null,
  kind         text not null check (kind in ('income', 'expense')),
  parent_id    uuid references public.categories(id) on delete set null,
  essential    boolean not null default false,
  color        text,
  sort         integer not null default 0,
  created_at   timestamptz not null default now(),
  unique (household_id, name, kind)
);

create index categories_household_idx on public.categories (household_id);

-- ── plan ────────────────────────────────────────────────────────────────────

create table public.plan_items (
  id                uuid primary key default gen_random_uuid(),
  household_id      uuid not null references public.households(id) on delete cascade,
  kind              text not null check (kind in ('income', 'expense')),
  name              text not null,
  category_id       uuid references public.categories(id) on delete set null,
  person_id         uuid references public.people(id) on delete set null,
  account_id        uuid references public.accounts(id) on delete set null,
  amount_cents      integer not null default 0 check (amount_cents >= 0),
  recurrence        text not null default 'monthly'
                    check (recurrence in ('monthly', 'installment', 'once')),
  start_month       text not null check (public.is_year_month(start_month)),
  end_month         text check (end_month is null or public.is_year_month(end_month)),
  installments      integer check (installments is null or installments >= 1),
  interest_rate_bps integer,
  essential         boolean not null default false,
  estimated         boolean not null default false,
  archived          boolean not null default false,
  notes             text,
  sort              integer not null default 0,
  created_at        timestamptz not null default now(),
  check (recurrence <> 'installment' or installments is not null)
);

create index plan_items_household_idx on public.plan_items (household_id, archived);

create table public.plan_overrides (
  plan_item_id uuid not null references public.plan_items(id) on delete cascade,
  month        text not null check (public.is_year_month(month)),
  amount_cents integer not null check (amount_cents >= 0),
  note         text,
  primary key (plan_item_id, month)
);

-- ── transactions ────────────────────────────────────────────────────────────

create table public.transactions (
  id                  uuid primary key default gen_random_uuid(),
  household_id        uuid not null references public.households(id) on delete cascade,
  date                date not null,
  competence_month    text not null check (public.is_year_month(competence_month)),
  kind                text not null check (kind in ('income', 'expense', 'transfer')),
  description         text not null,
  amount_cents        integer not null check (amount_cents >= 0),
  category_id         uuid references public.categories(id) on delete set null,
  person_id           uuid references public.people(id) on delete set null,
  account_id          uuid references public.accounts(id) on delete set null,
  plan_item_id        uuid references public.plan_items(id) on delete set null,
  installment_no      integer,
  installment_total   integer,
  installment_group   uuid,
  transfer_account_id uuid references public.accounts(id) on delete set null,
  notes               text,
  tags                text[] not null default '{}',
  source              text not null default 'manual'
                      check (source in ('manual', 'import', 'recurring')),
  external_id         text,
  created_at          timestamptz not null default now(),
  created_by          uuid references auth.users(id) on delete set null
);

create index transactions_month_idx on public.transactions (household_id, competence_month);
create index transactions_account_idx on public.transactions (account_id, competence_month);
create unique index transactions_external_uidx
  on public.transactions (account_id, external_id)
  where external_id is not null;

-- ── statements ──────────────────────────────────────────────────────────────

create table public.statements (
  account_id    uuid not null references public.accounts(id) on delete cascade,
  month         text not null check (public.is_year_month(month)),
  total_cents   integer check (total_cents is null or total_cents >= 0),
  paid_cents    integer check (paid_cents is null or paid_cents >= 0),
  closing_date  date,
  due_date      date,
  notes         text,
  primary key (account_id, month)
);

-- ── month closes ────────────────────────────────────────────────────────────

create table public.month_closes (
  household_id       uuid not null references public.households(id) on delete cascade,
  month              text not null check (public.is_year_month(month)),
  real_balance_cents integer not null default 0,
  notes              text,
  closed_at          timestamptz,
  primary key (household_id, month)
);

-- ── goals ───────────────────────────────────────────────────────────────────

create table public.goals (
  id             uuid primary key default gen_random_uuid(),
  household_id   uuid not null references public.households(id) on delete cascade,
  name           text not null,
  target_cents   integer not null default 0 check (target_cents >= 0),
  saved_cents    integer not null default 0 check (saved_cents >= 0),
  deadline_month text check (deadline_month is null or public.is_year_month(deadline_month)),
  priority       integer not null default 0,
  estimated      boolean not null default false,
  archived       boolean not null default false,
  notes          text,
  created_at     timestamptz not null default now()
);

create table public.goal_contributions (
  id           uuid primary key default gen_random_uuid(),
  goal_id      uuid not null references public.goals(id) on delete cascade,
  month        text not null check (public.is_year_month(month)),
  amount_cents integer not null check (amount_cents >= 0),
  notes        text,
  created_at   timestamptz not null default now()
);

create index goal_contributions_goal_idx on public.goal_contributions (goal_id, month);

-- ── settings ────────────────────────────────────────────────────────────────

create table public.settings (
  household_id uuid not null references public.households(id) on delete cascade,
  key          text not null,
  value        jsonb not null default '{}'::jsonb,
  primary key (household_id, key)
);

-- ── Helpers que dependem das tabelas ────────────────────────────────────────

create or replace function public.is_household_member(hid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.household_members hm
    where hm.household_id = hid
      and hm.user_id = auth.uid()
  );
$$;

create or replace function public.can_access_plan_item(pid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.plan_items pi
    where pi.id = pid
      and public.is_household_member(pi.household_id)
  );
$$;

create or replace function public.can_access_account(aid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.accounts a
    where a.id = aid
      and public.is_household_member(a.household_id)
  );
$$;

create or replace function public.can_access_goal(gid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.goals g
    where g.id = gid
      and public.is_household_member(g.household_id)
  );
$$;

-- ── RPCs de bootstrap ───────────────────────────────────────────────────────

create or replace function public.create_household(p_name text)
returns public.households
language plpgsql
security definer
set search_path = public
as $$
declare
  hid uuid;
  result public.households;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  if exists (select 1 from public.household_members where user_id = auth.uid()) then
    raise exception 'user already in a household';
  end if;

  insert into public.households (name)
  values (coalesce(nullif(trim(p_name), ''), 'Nossa casa'))
  returning * into result;

  hid := result.id;

  insert into public.household_members (household_id, user_id, role)
  values (hid, auth.uid(), 'owner');

  insert into public.people (household_id, user_id, name, short_name, color, sort)
  values
    (hid, auth.uid(), 'Eu', 'Eu', '#2f5d50', 0),
    (hid, null, 'Parceiro(a)', 'Par', '#8a5a44', 1);

  insert into public.categories (household_id, name, kind, essential, sort) values
    (hid, 'Salário', 'income', true, 0),
    (hid, 'Moradia', 'expense', true, 10),
    (hid, 'Mercado', 'expense', true, 20),
    (hid, 'Delivery', 'expense', false, 30),
    (hid, 'Transporte', 'expense', false, 40),
    (hid, 'Assinaturas', 'expense', false, 50),
    (hid, 'Lazer', 'expense', false, 60),
    (hid, 'Saúde', 'expense', true, 70),
    (hid, 'Outros', 'expense', false, 90);

  insert into public.accounts (household_id, name, kind, color, sort) values
    (hid, 'Conta corrente', 'checking', '#3d5a80', 0);

  insert into public.accounts (
    household_id, name, kind, color, credit_limit_cents, closing_day, due_day, sort
  ) values
    (hid, 'Cartão principal', 'credit', '#6b4f4f', 500000, 25, 5, 1);

  return result;
end;
$$;

create or replace function public.join_household(p_invite_code text)
returns public.households
language plpgsql
security definer
set search_path = public
as $$
declare
  result public.households;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  if exists (select 1 from public.household_members where user_id = auth.uid()) then
    raise exception 'user already in a household';
  end if;

  select * into result
  from public.households
  where invite_code = lower(trim(p_invite_code));

  if result.id is null then
    raise exception 'invalid invite code';
  end if;

  insert into public.household_members (household_id, user_id, role)
  values (result.id, auth.uid(), 'member');

  update public.people
  set user_id = auth.uid()
  where id = (
    select p.id
    from public.people p
    where p.household_id = result.id
      and p.user_id is null
    order by p.sort
    limit 1
  );

  return result;
end;
$$;

create or replace function public.get_my_household()
returns public.households
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  result public.households;
begin
  select h.* into result
  from public.households h
  join public.household_members hm on hm.household_id = h.id
  where hm.user_id = auth.uid()
  limit 1;
  return result;
end;
$$;

-- ── RLS ─────────────────────────────────────────────────────────────────────

alter table public.households enable row level security;
alter table public.household_members enable row level security;
alter table public.people enable row level security;
alter table public.accounts enable row level security;
alter table public.categories enable row level security;
alter table public.plan_items enable row level security;
alter table public.plan_overrides enable row level security;
alter table public.transactions enable row level security;
alter table public.statements enable row level security;
alter table public.month_closes enable row level security;
alter table public.goals enable row level security;
alter table public.goal_contributions enable row level security;
alter table public.settings enable row level security;

create policy households_select on public.households
  for select using (public.is_household_member(id));

create policy households_update on public.households
  for update using (public.is_household_member(id));

create policy household_members_select on public.household_members
  for select using (public.is_household_member(household_id));

create policy people_all on public.people
  for all using (public.is_household_member(household_id))
  with check (public.is_household_member(household_id));

create policy accounts_all on public.accounts
  for all using (public.is_household_member(household_id))
  with check (public.is_household_member(household_id));

create policy categories_all on public.categories
  for all using (public.is_household_member(household_id))
  with check (public.is_household_member(household_id));

create policy plan_items_all on public.plan_items
  for all using (public.is_household_member(household_id))
  with check (public.is_household_member(household_id));

create policy plan_overrides_all on public.plan_overrides
  for all using (public.can_access_plan_item(plan_item_id))
  with check (public.can_access_plan_item(plan_item_id));

create policy transactions_all on public.transactions
  for all using (public.is_household_member(household_id))
  with check (public.is_household_member(household_id));

create policy statements_all on public.statements
  for all using (public.can_access_account(account_id))
  with check (public.can_access_account(account_id));

create policy month_closes_all on public.month_closes
  for all using (public.is_household_member(household_id))
  with check (public.is_household_member(household_id));

create policy goals_all on public.goals
  for all using (public.is_household_member(household_id))
  with check (public.is_household_member(household_id));

create policy goal_contributions_all on public.goal_contributions
  for all using (public.can_access_goal(goal_id))
  with check (public.can_access_goal(goal_id));

create policy settings_all on public.settings
  for all using (public.is_household_member(household_id))
  with check (public.is_household_member(household_id));

grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant execute on function public.create_household(text) to authenticated;
grant execute on function public.join_household(text) to authenticated;
grant execute on function public.get_my_household() to authenticated;
grant execute on function public.is_household_member(uuid) to authenticated;
