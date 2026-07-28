-- Fase 9: account_balances (âncora de saldo real)

create table public.account_balances (
  id             uuid primary key default gen_random_uuid(),
  household_id   uuid not null references public.households(id) on delete cascade,
  account_id     uuid not null references public.accounts(id) on delete cascade,
  as_of_date     date not null,
  balance_cents  integer not null,
  notes          text,
  created_at     timestamptz not null default now(),
  created_by     uuid references auth.users(id) on delete set null,
  unique (account_id, as_of_date)
);

create index account_balances_household_idx
  on public.account_balances (household_id, as_of_date desc);

create index account_balances_account_idx
  on public.account_balances (account_id, as_of_date desc);

comment on table public.account_balances is
  'Saldo real informado — âncora de projeção. Ativo positivo; crédito = dívida negativa.';

comment on column public.account_balances.balance_cents is
  'Centavos. Corrente/poupança/cash: positivo = quanto tem. Crédito: negativo = quanto deve.';

alter table public.account_balances enable row level security;

create policy account_balances_all on public.account_balances
  for all
  using (public.is_household_member(household_id))
  with check (public.is_household_member(household_id));

grant select, insert, update, delete on public.account_balances to authenticated;
