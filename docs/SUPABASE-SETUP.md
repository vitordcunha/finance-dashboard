# Setup Supabase (Fase 1)

Sem Docker neste ambiente de desenvolvimento, use um **projeto remoto** no [Supabase Dashboard](https://supabase.com/dashboard).

## 1. Criar projeto

1. Crie um projeto no Supabase.
2. Em **Project Settings → API Keys**:
   - **Publishable and secret API keys** → copie a **Publishable key** (`sb_publishable_...`)
   - Em **Project Settings → General** (ou Connect) → Project URL
3. Aba **Legacy** ainda tem `anon` / `service_role`, mas a anon será descontinuada até o fim de 2026 — use publishable no front.
4. Crie `.env` (ou `.env.local`) na raiz:

```bash
cp .env.example .env
```

```bash
VITE_SUPABASE_URL=https://xxxx.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
```

**Nunca** coloque `sb_secret_...` / `service_role` no front — isso bypassa RLS.

## 2. Aplicar migration + seed

### Opção A — CLI linkado (recomendado)

```bash
supabase login
supabase link --project-ref SEU_REF
supabase db push
# seed manual (SQL Editor) — cole o conteúdo de supabase/seed.sql
```

### Opção B — SQL Editor

1. Abra **SQL Editor** no Dashboard.
2. Cole e rode `supabase/migrations/20260725190000_init.sql`.
3. Cole e rode `supabase/migrations/20260725200000_statement_payments.sql` (Fase 8 — faturas).
4. Cole e rode `supabase/migrations/20260725210000_account_balances.sql` (Fase 9 — saldo).
5. Cole e rode `supabase/migrations/20260725220000_goals_person_id.sql` (Fase 12 — metas).
6. Cole e rode `supabase/migrations/20260725230000_import_batches.sql` (Fase 13 — import).
7. Cole e rode `supabase/seed.sql` (cria a casa demo `casa2026`).

## 3. Auth

Em **Authentication → Providers → Email**:

- Habilite Email.
- Para dev rápido: desative **Confirm email** (senão o signup não cria sessão).

Crie 2 usuários (signup pela UI do app ou Dashboard).

## 4. Entrar no app

```bash
npm run dev
```

1. Abra `/login` e crie/entre com o usuário 1.
2. Em onboarding: **Tenho código** → `casa2026` (seed) **ou** **Criar casa**.
3. Usuário 2: signup → **Tenho código** → use o `invite_code` da sidebar do usuário 1 (ou `casa2026` se ainda disponível / seed).

## 5. Local com Docker (opcional)

Quando Docker estiver disponível:

```bash
supabase start
supabase db reset   # migration + seed
# URL/keys impressas no terminal → .env.local
supabase gen types typescript --local > src/data/supabase/types.ts
```

## RLS

Todas as tabelas de negócio filtram por `household_members`.  
Queries autenticadas só veem a casa do `auth.uid()`. Cross-household falha via policy.

## Produção (Vercel)

Depois do schema no ar, publique o front: [DEPLOY.md](./DEPLOY.md)  
(Site URL / Redirect URLs do Auth apontando para o domínio Vercel.)

## Tipos TypeScript

`src/data/supabase/types.ts` espelha a migration da Fase 1.  
Quando houver CLI + DB: regenere com `supabase gen types` e substitua o arquivo (não editar à mão depois disso).
