-- Fase 8: statement_payments (C→B) + status em statements

-- ── statements.status ───────────────────────────────────────────────────────

alter table public.statements
  add column if not exists status text not null default 'open'
    check (status in ('open', 'closed'));

comment on column public.statements.status is
  'open = fatura em aberto; closed = ritual de fechamento concluído';

-- ── statement_payments ──────────────────────────────────────────────────────

create table public.statement_payments (
  id                   uuid primary key default gen_random_uuid(),
  statement_account_id uuid not null,
  statement_month      text not null check (public.is_year_month(statement_month)),
  transaction_id       uuid not null references public.transactions(id) on delete cascade,
  amount_cents         integer not null check (amount_cents >= 0),
  created_at           timestamptz not null default now(),
  foreign key (statement_account_id, statement_month)
    references public.statements (account_id, month) on delete cascade,
  unique (transaction_id, statement_account_id, statement_month)
);

create index statement_payments_statement_idx
  on public.statement_payments (statement_account_id, statement_month);

create index statement_payments_transaction_idx
  on public.statement_payments (transaction_id);

comment on table public.statement_payments is
  'Vínculo C→B: qual lançamento (transfer) quitou parte da fatura';

-- ── RLS ─────────────────────────────────────────────────────────────────────

alter table public.statement_payments enable row level security;

create policy statement_payments_all on public.statement_payments
  for all
  using (public.can_access_account(statement_account_id))
  with check (public.can_access_account(statement_account_id));

grant select, insert, update, delete on public.statement_payments to authenticated;
