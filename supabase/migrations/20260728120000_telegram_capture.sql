-- Canal Telegram: vínculo, códigos de pairing, drafts e source=telegram.

-- ── source telegram em transactions ─────────────────────────────────────────

alter table public.transactions
  drop constraint if exists transactions_source_check;

alter table public.transactions
  add constraint transactions_source_check
  check (source in ('manual', 'import', 'recurring', 'telegram'));

-- ── telegram_links ──────────────────────────────────────────────────────────

create table public.telegram_links (
  id                  uuid primary key default gen_random_uuid(),
  household_id        uuid not null references public.households(id) on delete cascade,
  user_id             uuid not null references auth.users(id) on delete cascade,
  person_id           uuid references public.people(id) on delete set null,
  telegram_user_id    bigint not null,
  telegram_chat_id    bigint not null,
  default_account_id  uuid references public.accounts(id) on delete set null,
  linked_at           timestamptz not null default now(),
  revoked_at          timestamptz
);

create unique index telegram_links_user_active_uidx
  on public.telegram_links (user_id)
  where revoked_at is null;

create unique index telegram_links_tg_user_active_uidx
  on public.telegram_links (telegram_user_id)
  where revoked_at is null;

create index telegram_links_household_idx
  on public.telegram_links (household_id);

comment on table public.telegram_links is
  'Vínculo Telegram ↔ membro do household. Bot usa service role; UI via RLS.';

-- ── telegram_link_codes ─────────────────────────────────────────────────────

create table public.telegram_link_codes (
  id           uuid primary key default gen_random_uuid(),
  code         text not null,
  household_id uuid not null references public.households(id) on delete cascade,
  user_id      uuid not null references auth.users(id) on delete cascade,
  person_id    uuid references public.people(id) on delete set null,
  expires_at   timestamptz not null,
  used_at      timestamptz,
  created_at   timestamptz not null default now(),
  constraint telegram_link_codes_code_unique unique (code)
);

create index telegram_link_codes_user_idx
  on public.telegram_link_codes (user_id, created_at desc);

comment on table public.telegram_link_codes is
  'Código de uso único para /start no bot. Expira em minutos.';

-- ── capture_drafts ──────────────────────────────────────────────────────────

create table public.capture_drafts (
  id                   uuid primary key default gen_random_uuid(),
  telegram_user_id     bigint not null,
  household_id         uuid not null references public.households(id) on delete cascade,
  user_id              uuid not null references auth.users(id) on delete cascade,
  payload              jsonb not null default '{}'::jsonb,
  status               text not null default 'pending'
                       check (status in ('pending', 'confirmed', 'cancelled', 'expired')),
  last_transaction_id  uuid references public.transactions(id) on delete set null,
  expires_at           timestamptz not null,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

create index capture_drafts_tg_user_pending_idx
  on public.capture_drafts (telegram_user_id, status, created_at desc);

comment on table public.capture_drafts is
  'Rascunho de captura do bot (confirmação antes de gravar). Só service role.';

-- ── RLS ─────────────────────────────────────────────────────────────────────

alter table public.telegram_links enable row level security;
alter table public.telegram_link_codes enable row level security;
alter table public.capture_drafts enable row level security;

create policy telegram_links_select on public.telegram_links
  for select using (user_id = auth.uid() and public.is_household_member(household_id));

create policy telegram_links_update on public.telegram_links
  for update using (user_id = auth.uid() and public.is_household_member(household_id));

create policy telegram_links_delete on public.telegram_links
  for delete using (user_id = auth.uid() and public.is_household_member(household_id));

-- Insert de link só via bot (service role). Codes: usuário cria.

create policy telegram_link_codes_select on public.telegram_link_codes
  for select using (user_id = auth.uid());

create policy telegram_link_codes_insert on public.telegram_link_codes
  for insert with check (
    user_id = auth.uid()
    and public.is_household_member(household_id)
  );

-- capture_drafts: sem policies para authenticated (só service role / bypass RLS)

grant select, update, delete on public.telegram_links to authenticated;
grant select, insert on public.telegram_link_codes to authenticated;

-- ── RPC: gerar código de vínculo ────────────────────────────────────────────

create or replace function public.create_telegram_link_code(
  p_person_id uuid default null,
  p_ttl_minutes integer default 15
)
returns public.telegram_link_codes
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  hid uuid;
  uid uuid := auth.uid();
  result public.telegram_link_codes;
  raw text;
  code text;
  ttl integer := greatest(5, least(coalesce(p_ttl_minutes, 15), 60));
begin
  if uid is null then
    raise exception 'not authenticated';
  end if;

  select hm.household_id into hid
  from public.household_members hm
  where hm.user_id = uid
  limit 1;

  if hid is null then
    raise exception 'no household';
  end if;

  if p_person_id is not null and not exists (
    select 1 from public.people p
    where p.id = p_person_id and p.household_id = hid
  ) then
    raise exception 'person not in household';
  end if;

  -- Código curto legível (sem 0/O/1/I)
  raw := encode(gen_random_bytes(6), 'base64');
  raw := upper(regexp_replace(raw, '[^A-Z2-9]', '', 'g'));
  code := substr(raw || 'ABCDEFGH', 1, 8);

  insert into public.telegram_link_codes (
    code, household_id, user_id, person_id, expires_at
  ) values (
    code, hid, uid, p_person_id, now() + make_interval(mins => ttl)
  )
  returning * into result;

  return result;
end;
$$;

grant execute on function public.create_telegram_link_code(uuid, integer) to authenticated;
