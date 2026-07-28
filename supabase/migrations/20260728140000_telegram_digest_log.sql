-- Telegram v1.4: log de digest/lembrete de fatura (idempotência diária).

create table if not exists public.telegram_digest_log (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  account_id uuid not null references public.accounts (id) on delete cascade,
  statement_month text not null
    check (statement_month ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  kind text not null
    check (kind in ('due_soon', 'due_today', 'overdue')),
  sent_on date not null default ((timezone('America/Sao_Paulo', now()))::date),
  created_at timestamptz not null default now(),
  unique (household_id, account_id, statement_month, kind, sent_on)
);

create index if not exists telegram_digest_log_sent_on_idx
  on public.telegram_digest_log (sent_on);

comment on table public.telegram_digest_log is
  'Evita reenviar o mesmo lembrete de fatura no mesmo dia (cron do bot).';

alter table public.telegram_digest_log enable row level security;

-- Só service role escreve (bot). Membros podem ler o próprio household se útil.
create policy telegram_digest_log_select on public.telegram_digest_log
  for select
  using (
    household_id in (
      select hm.household_id
      from public.household_members hm
      where hm.user_id = auth.uid()
    )
  );
