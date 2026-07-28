-- Seed local / demo.
-- Household pronto para o casal entrar com o código: casa2026
-- (após criar usuários no Auth, cada um usa "Entrar com código")

create extension if not exists "pgcrypto";

-- limpa demo anterior se re-seed
delete from public.households where invite_code = 'casa2026';

insert into public.households (id, name, invite_code)
values ('11111111-1111-1111-1111-111111111111', 'Casa demo', 'casa2026');

insert into public.people (id, household_id, name, short_name, color, sort) values
  ('22222222-2222-2222-2222-222222222201', '11111111-1111-1111-1111-111111111111', 'Vitor', 'Vitor', '#2f5d50', 0),
  ('22222222-2222-2222-2222-222222222202', '11111111-1111-1111-1111-111111111111', 'Parceira', 'Par', '#8a5a44', 1);

insert into public.categories (id, household_id, name, kind, essential, sort) values
  ('33333333-3333-3333-3333-333333333301', '11111111-1111-1111-1111-111111111111', 'Salário', 'income', true, 0),
  ('33333333-3333-3333-3333-333333333302', '11111111-1111-1111-1111-111111111111', 'Moradia', 'expense', true, 10),
  ('33333333-3333-3333-3333-333333333303', '11111111-1111-1111-1111-111111111111', 'Mercado', 'expense', true, 20),
  ('33333333-3333-3333-3333-333333333304', '11111111-1111-1111-1111-111111111111', 'Delivery', 'expense', false, 30),
  ('33333333-3333-3333-3333-333333333305', '11111111-1111-1111-1111-111111111111', 'Transporte', 'expense', false, 40),
  ('33333333-3333-3333-3333-333333333306', '11111111-1111-1111-1111-111111111111', 'Assinaturas', 'expense', false, 50);

insert into public.accounts (id, household_id, name, kind, color, sort) values
  ('44444444-4444-4444-4444-444444444401', '11111111-1111-1111-1111-111111111111', 'Conta corrente', 'checking', '#3d5a80', 0);

insert into public.accounts (
  id, household_id, name, kind, color, credit_limit_cents, closing_day, due_day, sort
) values
  ('44444444-4444-4444-4444-444444444402', '11111111-1111-1111-1111-111111111111', 'Nubank', 'credit', '#820ad1', 800000, 25, 5, 1),
  ('44444444-4444-4444-4444-444444444403', '11111111-1111-1111-1111-111111111111', 'Inter', 'credit', '#ff7a00', 400000, 10, 17, 2);

insert into public.plan_items (
  id, household_id, kind, name, category_id, person_id, account_id,
  amount_cents, recurrence, start_month, essential, sort
) values
  (
    '55555555-5555-5555-5555-555555555501',
    '11111111-1111-1111-1111-111111111111',
    'income', 'Salário Vitor',
    '33333333-3333-3333-3333-333333333301',
    '22222222-2222-2222-2222-222222222201',
    '44444444-4444-4444-4444-444444444401',
    1200000, 'monthly', '2026-01', true, 0
  ),
  (
    '55555555-5555-5555-5555-555555555506',
    '11111111-1111-1111-1111-111111111111',
    'income', 'Salário Parceira',
    '33333333-3333-3333-3333-333333333301',
    '22222222-2222-2222-2222-222222222202',
    '44444444-4444-4444-4444-444444444401',
    800000, 'monthly', '2026-01', true, 1
  ),
  (
    '55555555-5555-5555-5555-555555555502',
    '11111111-1111-1111-1111-111111111111',
    'expense', 'Aluguel',
    '33333333-3333-3333-3333-333333333302',
    null,
    '44444444-4444-4444-4444-444444444401',
    370000, 'monthly', '2026-01', true, 10
  ),
  (
    '55555555-5555-5555-5555-555555555503',
    '11111111-1111-1111-1111-111111111111',
    'expense', 'Mercado',
    '33333333-3333-3333-3333-333333333303',
    null,
    '44444444-4444-4444-4444-444444444401',
    150000, 'monthly', '2026-01', true, 20
  ),
  (
    '55555555-5555-5555-5555-555555555504',
    '11111111-1111-1111-1111-111111111111',
    'expense', 'Netflix',
    '33333333-3333-3333-3333-333333333306',
    null,
    '44444444-4444-4444-4444-444444444402',
    5590, 'monthly', '2026-01', false, 30
  ),
  (
    '55555555-5555-5555-5555-555555555505',
    '11111111-1111-1111-1111-111111111111',
    'expense', 'Cama (parcelas)',
    '33333333-3333-3333-3333-333333333302',
    null,
    '44444444-4444-4444-4444-444444444402',
    70000, 'installment', '2026-06', false, 40
  );

update public.plan_items
set installments = 10
where id = '55555555-5555-5555-5555-555555555505';

-- Cota proporcional à renda (60/40 com os salários acima
insert into public.settings (household_id, key, value)
values (
  '11111111-1111-1111-1111-111111111111',
  'contribution_mode',
  '{"mode":"income_share"}'::jsonb
);