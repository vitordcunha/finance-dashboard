# Finance Panel

Painel financeiro do casal — captura rápida, plano vs realizado, cartões, projeção e simulação.

## Stack

- **Frontend:** React 19, Vite, TypeScript, Tailwind 4, React Router 7
- **Dados:** TanStack Query + Supabase (Postgres, Auth, RLS)
- **Validação:** Zod
- **Testes:** Vitest
- **Mobile (depois):** Capacitor

## Setup

```bash
pnpm install
cp .env.example .env.local   # VITE_SUPABASE_URL + VITE_SUPABASE_PUBLISHABLE_KEY
pnpm dev                     # http://localhost:5273
```

Scripts: `dev` · `build` · `test` · `lint` · `typecheck`

## Deploy (produção)

Front na **Vercel** + dados no **Supabase**. Passo a passo: [docs/DEPLOY.md](./docs/DEPLOY.md).

## Documentação

| Documento | Conteúdo |
|-----------|----------|
| [AGENTS.md](./AGENTS.md) | Regras para desenvolvimento com IA |
| [docs/VISION.md](./docs/VISION.md) | Visão do produto |
| [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md) | Arquitetura e pastas |
| [docs/UX.md](./docs/UX.md) | UX / UI |
| [docs/DATA-MODEL.md](./docs/DATA-MODEL.md) | Modelo de dados |
| [docs/SUPABASE-SETUP.md](./docs/SUPABASE-SETUP.md) | Setup do banco e auth |
| [docs/DEPLOY.md](./docs/DEPLOY.md) | Publicar na Vercel |
| [docs/IMPLEMENTATION-PLAN.md](./docs/IMPLEMENTATION-PLAN.md) | Plano por fases |
| [docs/AI-WORKFLOW.md](./docs/AI-WORKFLOW.md) | Workflow para agentes |

## Status

App web (Vite + Supabase). Setup local: [docs/SUPABASE-SETUP.md](./docs/SUPABASE-SETUP.md).  
Publicar: [docs/DEPLOY.md](./docs/DEPLOY.md).
