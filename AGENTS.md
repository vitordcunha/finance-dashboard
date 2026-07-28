# AGENTS.md — Finance Panel

Instruções permanentes para qualquer agente de IA que trabalhe neste repositório.

## O que é este projeto

App financeiro para um casal (2 pessoas) com lente Casa/Eu. Captura rápida, plano vs realizado, cartões com fatura/pagamento, saldo real, cota proporcional, import de extrato, projeção, metas e simulação. Web primeiro (Vite + React); depois Capacitor.

**Stack:** React 19 · Vite · TypeScript · Tailwind 4 · TanStack Query · Supabase (Auth + Postgres + RLS) · Zod · Lucide · Sonner

## Antes de qualquer mudança

1. Ler `docs/VISION.md` (produto e não-objetivos).
2. Ler a fase atual em `docs/IMPLEMENTATION-PLAN.md` e só implementar o escopo dela.
3. Seguir `docs/ARCHITECTURE.md` (pastas e dependências entre camadas).
4. Em UI: seguir `docs/UX.md` (captura em 5s, hierarquia, tom visual).
5. Em dados/dinheiro: seguir `docs/DATA-MODEL.md` (centavos, household, RLS).

## Regras absolutas

- **Dinheiro sempre em centavos (`integer`)**. Nunca `float` como fonte da verdade.
- **UI não fala com Supabase direto.** Só via `src/data/*` + hooks.
- **Cálculos de domínio em `src/core/`** (puro, testável, sem React/Supabase).
- **Componentes pequenos** (~80–120 linhas em feature; pages só compõem).
- **Features por pasta** (`src/features/<nome>/`), não jogar tudo em `components/`.
- **Não inventar telas/campos** fora do plano da fase atual.
- **Não adicionar** Redux, Mongo, CSS-in-JS, design system enorme, Open Banking contínuo (import OFX/CSV manual é permitido quando a fase pedir).
- **Sem contas privadas / ACL por pessoa** — transparência total; separação é lente UI (Casa/Eu).
- **Idioma da UI:** português (Brasil). Código e nomes de arquivo: inglês.
- **Commits:** sem `Co-authored-by: Cursor` nem trailers `Made-with: Cursor`.

## Como trabalhar (IA)

Ver `docs/AI-WORKFLOW.md`. Resumo:

1. Uma fase / uma fatia vertical por vez.
2. Critérios de aceite da fase = checklist de done.
3. Preferir editar arquivos existentes a criar abstrações cedo.
4. Após UI: checar loading, empty, erro, mobile.
5. Após domínio: testes Vitest em `src/core/`.

## Mapa rápido de docs

| Doc | Uso |
|-----|-----|
| `docs/VISION.md` | Por que o produto existe |
| `docs/ARCHITECTURE.md` | Pastas, camadas, stack |
| `docs/UX.md` | Experiência e UI |
| `docs/DATA-MODEL.md` | Schema Supabase |
| `docs/IMPLEMENTATION-PLAN.md` | Fases e aceite |
| `docs/AI-WORKFLOW.md` | Como a IA deve executar tarefas |
| `docs/DEPLOY.md` | Publicar front na Vercel |

## Estado do código

Fonte da verdade: Supabase + `src/`. Legado SQLite/Fastify foi removido na Fase 0. Não reintroduzir.
