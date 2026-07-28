-- Fase 13: import_batches + import_lines (OFX/CSV → conciliação)

-- ── import_batches ──────────────────────────────────────────────────────────

create table public.import_batches (
  id                 uuid primary key default gen_random_uuid(),
  household_id       uuid not null references public.households(id) on delete cascade,
  account_id         uuid not null references public.accounts(id) on delete cascade,
  source             text not null check (source in ('ofx', 'csv')),
  file_name          text not null,
  checksum           text,
  period_start       date,
  period_end         date,
  competence_month   text check (
    competence_month is null or public.is_year_month(competence_month)
  ),
  status             text not null default 'pending'
                     check (status in ('pending', 'reviewed', 'applied')),
  created_at         timestamptz not null default now(),
  created_by         uuid references auth.users(id) on delete set null
);

create index import_batches_household_idx
  on public.import_batches (household_id, created_at desc);

create index import_batches_account_idx
  on public.import_batches (account_id, created_at desc);

-- Idempotência: mesmo arquivo (checksum) na mesma conta não gera batch novo
create unique index import_batches_checksum_uidx
  on public.import_batches (account_id, checksum)
  where checksum is not null;

comment on table public.import_batches is
  'Lote de importação de extrato (OFX/CSV). Ritual de organização, não sync contínuo.';

comment on column public.import_batches.checksum is
  'SHA-256 hex do arquivo; unique parcial com account_id para idempotência.';

-- ── import_lines ────────────────────────────────────────────────────────────

create table public.import_lines (
  id                       uuid primary key default gen_random_uuid(),
  batch_id                 uuid not null references public.import_batches(id) on delete cascade,
  posted_on                date not null,
  amount_cents             integer not null check (amount_cents >= 0),
  description_raw          text not null default '',
  external_id              text,
  -- signed direction from file: expense | income (amount always ≥ 0)
  kind                     text not null default 'expense'
                           check (kind in ('expense', 'income')),
  status                   text not null default 'unmatched'
                           check (status in (
                             'suggested', 'matched', 'created', 'ignored', 'unmatched'
                           )),
  matched_transaction_id   uuid references public.transactions(id) on delete set null,
  created_transaction_id   uuid references public.transactions(id) on delete set null,
  -- Confiança 0–100 (inteiro). Alta (≥85) → auto-match.
  match_confidence         integer check (
    match_confidence is null
    or (match_confidence >= 0 and match_confidence <= 100)
  ),
  created_at               timestamptz not null default now()
);

create index import_lines_batch_idx
  on public.import_lines (batch_id, status);

create index import_lines_matched_tx_idx
  on public.import_lines (matched_transaction_id)
  where matched_transaction_id is not null;

comment on table public.import_lines is
  'Linha do extrato. Match v1: amount + conta + data ±2d + fuzzy leve.';

comment on column public.import_lines.match_confidence is
  '0–100. ≥85 = alta confiança (auto-aplica matched).';

comment on column public.import_lines.kind is
  'Direção do lançamento no extrato; amount_cents é sempre absoluto.';

-- ── RLS ─────────────────────────────────────────────────────────────────────

alter table public.import_batches enable row level security;
alter table public.import_lines enable row level security;

create policy import_batches_all on public.import_batches
  for all
  using (public.is_household_member(household_id))
  with check (public.is_household_member(household_id));

create policy import_lines_all on public.import_lines
  for all
  using (
    exists (
      select 1 from public.import_batches b
      where b.id = batch_id
        and public.is_household_member(b.household_id)
    )
  )
  with check (
    exists (
      select 1 from public.import_batches b
      where b.id = batch_id
        and public.is_household_member(b.household_id)
    )
  );

grant select, insert, update, delete on public.import_batches to authenticated;
grant select, insert, update, delete on public.import_lines to authenticated;
