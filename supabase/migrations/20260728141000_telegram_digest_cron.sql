-- Telegram v1.4: agendar digest de fatura via pg_cron + pg_net.
-- Segredos (project_url, service_role_key) ficam no Vault — ver TELEGRAM.md.

create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

-- Reagenda de forma idempotente.
do $$
declare
  jid bigint;
begin
  for jid in
    select jobid from cron.job where jobname = 'telegram-invoice-digest'
  loop
    perform cron.unschedule(jid);
  end loop;
end $$;

select cron.schedule(
  'telegram-invoice-digest',
  -- 12:00 UTC ≈ 09:00 America/Sao_Paulo (sem ajuste de DST no inverno)
  '0 12 * * *',
  $$
  select net.http_get(
    url := (
      select decrypted_secret
      from vault.decrypted_secrets
      where name = 'project_url'
      limit 1
    ) || '/functions/v1/telegram-bot?action=digest',
    headers := jsonb_build_object(
      'Authorization',
      'Bearer ' || (
        select decrypted_secret
        from vault.decrypted_secrets
        where name = 'service_role_key'
        limit 1
      )
    ),
    timeout_milliseconds := 30000
  );
  $$
);
