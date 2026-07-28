# Deploy (Vercel + Supabase)

O app é um **SPA Vite**. A Vercel serve o front estático; o **Supabase** continua sendo Auth + Postgres + RLS.

```text
Browser → Vercel (dist/) → Supabase (API / Auth)
```

Não há backend próprio na Vercel. Nunca coloque `service_role` / `sb_secret_...` nas env vars do front.

---

## Pré-requisitos

1. Conta na [Vercel](https://vercel.com) (GitHub conectado).
2. Projeto Supabase de produção com migrations aplicadas — ver [SUPABASE-SETUP.md](./SUPABASE-SETUP.md).
3. Repo no GitHub (branch `main` ou a que for deployar).

---

## 1. Variáveis de ambiente (Vercel)

No projeto Vercel → **Settings → Environment Variables**, crie (Production e Preview):

| Nome | Valor | Onde pegar |
|------|-------|------------|
| `VITE_SUPABASE_URL` | `https://xxxx.supabase.co` | Supabase → Project Settings → General / Connect |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | `sb_publishable_...` | Supabase → API Keys → Publishable |

São chaves **públicas** (embutidas no bundle no build). A proteção é o RLS.

Opcional (só se ainda usar a aba Legacy): `VITE_SUPABASE_ANON_KEY` em vez da publishable.

Depois de mudar env, faça um **Redeploy** (Build Cache off se o build antigo ficou sem as vars).

---

## 2. Conectar o repo na Vercel

1. [vercel.com/new](https://vercel.com/new) → Import do GitHub.
2. Selecione o repositório `finance-panel`.
3. Confirme (o `vercel.json` já define framework, install, build e `dist`):
   - **Framework Preset:** Vite
   - **Build Command:** `pnpm build`
   - **Output Directory:** `dist`
   - **Install Command:** `pnpm install`
4. Cole as env vars do passo 1 (se ainda não tiver).
5. **Deploy**.

URL típica: `https://finance-panel-….vercel.app`.

### CLI (alternativa)

```bash
pnpm dlx vercel login
pnpm dlx vercel        # preview
pnpm dlx vercel --prod # produção
```

Na primeira vez a CLI pergunta o escopo/projeto; as env vars ainda precisam estar no dashboard (ou `vercel env add`).

---

## 3. Auth no Supabase (URLs)

Em **Authentication → URL Configuration**:

| Campo | Valor |
|-------|--------|
| **Site URL** | `https://SEU-PROJETO.vercel.app` (ou domínio custom) |
| **Redirect URLs** | Site URL +, se quiser previews: `https://*.vercel.app/**` |

Hoje o app usa email/senha (`signInWithPassword`). Mesmo assim, configure Site URL para links de e-mail (confirmação, reset) apontarem para produção.

Em **Authentication → Providers → Email**:

- Em produção, prefira **Confirm email** ligado (signup só completa após confirmar).
- Para smoke test rápido, pode deixar desligado temporariamente — volte a ligar depois.

---

## 4. Domínio custom (opcional)

1. Vercel → Project → **Settings → Domains** → adicione `app.seudominio.com` (ou similar).
2. Ajuste DNS conforme a Vercel indicar.
3. Atualize **Site URL** e **Redirect URLs** no Supabase para o domínio novo.

---

## 5. Checklist pós-deploy

- [ ] Abre a URL e cai em `/login` (ou `/setup` se env faltar).
- [ ] Signup / login funciona.
- [ ] Onboarding: criar casa ou entrar com código de convite.
- [ ] Refresh em `/settings` ou `/cards` **não** dá 404 (rewrite SPA).
- [ ] Dados aparecem só da própria household (RLS).
- [ ] `robots.txt` responde `Disallow: /` e a página tem `noindex`.

Se a tela for `/setup`: as env `VITE_*` não entraram no build — confira o passo 1 e redeploy.

---

## 6. Quem pode usar

App de casal, não SaaS público. Controles práticos:

1. **Invite code** no onboarding (já existe) — conta sem código não entra na casa.
2. Opcional: desligar signup público no Supabase e criar os 2 usuários no Dashboard.
3. URL “obscura” + `noindex` (já configurado) — não é segurança; é só anti-descoberta.

---

## Arquivos deste repo

| Arquivo | Função |
|---------|--------|
| `vercel.json` | Vite, build, rewrite SPA, headers (`noindex`, cache de assets) |
| `public/robots.txt` | Bloqueia crawlers |
| `package.json` → `packageManager` | Garante pnpm na Vercel |

---

## Problemas comuns

| Sintoma | Causa provável |
|---------|----------------|
| `/setup` em produção | Falta `VITE_SUPABASE_*` no build |
| 404 ao dar F5 em rota interna | Rewrite SPA ausente (não deveria com este `vercel.json`) |
| Login ok, queries vazias | Migration não aplicada / usuário fora do household |
| Preview de PR sem dados | Env não marcada para **Preview**; ou outro projeto Supabase |
| Build falha no `tsc` | Rode `pnpm typecheck` localmente e corrija antes do push |
