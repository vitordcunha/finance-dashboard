-- Fase 3: plan_items ganha dia de vencimento.
--
-- A linha do tempo precisa colocar cada ocorrência do plano num **dia**, não
-- só num mês. Sem isso não dá para ordenar eventos futuros contra o saldo
-- corrente nem saber o que ainda falta acontecer no mês em curso.
--
-- Convenção: 1–31, com clamp para o último dia do mês (31 em fevereiro → 28/29).
-- "Último dia do mês" se representa como 31. Ver `core/projection.dueDateInMonth`.
-- Null = sem dia conhecido; a UI trata como fim do mês para ordenação.

alter table public.plan_items
  add column due_day integer
    check (due_day is null or (due_day >= 1 and due_day <= 31));

comment on column public.plan_items.due_day is
  'Dia de vencimento 1–31, clamped ao último dia do mês. 31 = último dia. Null = desconhecido.';
