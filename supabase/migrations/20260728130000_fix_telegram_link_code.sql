-- Fix: gen_random_bytes vive em extensions; search_path=public quebrava o RPC.

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
