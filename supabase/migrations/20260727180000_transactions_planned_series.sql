-- Lançamento previsto e recorrência dentro de `transactions`.
--
-- Antes: `plan_items` guardava o recorrente e `transactions` o realizado, e o
-- app precisava adivinhar quando um cumpria o outro (por categoria, por valor,
-- por vínculo). Essa adivinhação era a origem dos números errados — julho/2026
-- chegou a pagar aluguel duas vezes.
--
-- Agora é uma entidade só: o lançamento futuro **é** o planejamento.

alter table public.transactions
  add column status text not null default 'actual'
    check (status in ('actual', 'planned', 'skipped')),

  -- Recorrência mora na linha-modelo. As ocorrências dos meses seguintes são
  -- virtuais (expandidas em `core/series`), não linhas gravadas.
  add column recurrence text not null default 'none'
    check (recurrence in ('none', 'monthly')),
  add column recurrence_end date,

  -- Exceção de um mês da série: aponta para a linha-modelo. A expansão pula o
  -- mês de qualquer exceção — é como "editar só este" e "pular este" funcionam.
  add column series_id uuid references public.transactions (id) on delete cascade;

-- Recorrência só faz sentido na linha-modelo.
alter table public.transactions
  add constraint transactions_series_not_recurring
    check (series_id is null or recurrence = 'none');

-- `skipped` é marcador de ausência: não pode carregar valor nem existir solto.
alter table public.transactions
  add constraint transactions_skipped_is_series_marker
    check (status <> 'skipped' or (series_id is not null and amount_cents = 0));

create index transactions_series_id_idx
  on public.transactions (series_id)
  where series_id is not null;

create index transactions_recurring_idx
  on public.transactions (household_id, date)
  where recurrence <> 'none';

-- Uma exceção por mês da série.
create unique index transactions_series_month_uniq
  on public.transactions (series_id, competence_month)
  where series_id is not null;

comment on column public.transactions.status is
  'actual = aconteceu; planned = previsto; skipped = ocorrência da série cancelada.';
comment on column public.transactions.recurrence is
  'monthly gera ocorrências virtuais nos meses seguintes até recurrence_end.';
comment on column public.transactions.series_id is
  'Exceção de um mês: substitui a ocorrência virtual daquele mês.';
