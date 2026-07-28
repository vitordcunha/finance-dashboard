# Arquitetura

## Diagrama de camadas

```text
┌────────────────────────────────────────────┐
│  features/*/pages + components (UI)        │
│  — composição, estados de tela, gestos     │
├────────────────────────────────────────────┤
│  features/*/hooks                          │
│  — React Query, mutations, optimistic UI   │
├────────────────────────────────────────────┤
│  data/*                                    │
│  — Supabase client, CRUD, mapeamento DB    │
├────────────────────────────────────────────┤
│  core/*                                    │
│  — money, month, series, timeline,         │
│    month-metrics, forecast, cashflow       │
│    (puro + testes)                         │
├────────────────────────────────────────────┤
│  Supabase                                  │
│  — Auth, Postgres, RLS                     │
└────────────────────────────────────────────┘
```

**Regra de dependência (obrigatória):**

```text
components/ui  →  (ninguém de domínio)
features       →  hooks, components, core, data, lib
data           →  core (mapeamento), supabase
core           →  nada de React / Supabase / DOM
```

Proibido: `features/x` importar `features/y` em cadeia profunda. Compartilhar via `components/` ou `core/` ou `hooks/` global.

## Stack

| Peça | Tecnologia |
|------|------------|
| UI | React 19 + Vite + TypeScript |
| Estilo | Tailwind 4 + tokens CSS em `src/styles/` |
| Server state | TanStack Query v5 |
| Auth/DB | Supabase JS v2 |
| Forms | React Hook Form + Zod |
| Rotas | **React Router 7** (escolhido na Fase 0 por simplicidade) |
| Toasts | Sonner |
| Ícones | Lucide |
| Datas | date-fns; mês de competência = `yyyy-MM` |
| Testes | Vitest (`src/core/**/*.test.ts`) |
| Mobile depois | Capacitor (não na base) |

## Estrutura de pastas alvo

```text
finance-panel/
├── AGENTS.md
├── README.md
├── docs/
├── supabase/
│   ├── config.toml
│   ├── migrations/
│   └── seed.sql
├── src/
│   ├── main.tsx
│   ├── app/
│   │   ├── App.tsx
│   │   ├── providers.tsx
│   │   ├── router.tsx
│   │   └── layouts/
│   ├── core/
│   │   ├── money.ts
│   │   ├── month.ts
│   │   ├── series/
│   │   ├── timeline/
│   │   ├── month-metrics/
│   │   ├── forecast/
│   │   ├── cashflow/
│   │   ├── balance/
│   │   ├── cards/
│   │   ├── goals/
│   │   ├── reconcile/
│   │   ├── transactions/
│   │   ├── import/
│   │   └── categorization/
│   ├── data/
│   │   ├── supabase/
│   │   ├── query-keys.ts
│   │   ├── people.ts
│   │   ├── accounts.ts
│   │   ├── categories.ts
│   │   ├── categorization-rules.ts
│   │   ├── transactions.ts
│   │   ├── series.ts
│   │   ├── statements.ts
│   │   ├── goals.ts
│   │   ├── imports.ts
│   │   └── month-close.ts
│   ├── features/
│   │   ├── auth/
│   │   ├── panel/        # a aplicação: um mês por vez
│   │   ├── more/
│   │   ├── balances/
│   │   ├── capture/      # só os lookups compartilhados
│   │   ├── cards/
│   │   ├── goals/
│   │   ├── import/
│   │   ├── transactions/
│   │   └── settings/
│   ├── components/
│   │   ├── ui/
│   │   ├── money/
│   │   ├── feedback/
│   │   └── filters/
│   ├── hooks/
│   ├── lib/
│   ├── styles/
│   └── types/
└── tests/   # opcional; preferir colocados ao lado em core/
```

Cada feature:

```text
features/<nome>/
  pages/
  components/
  hooks/
  schema.ts          # zod, se houver form
```

## Path aliases

```ts
@/app/*
@/core/*
@/data/*
@/features/*
@/components/*
@/hooks/*
@/lib/*
@/types/*
@/styles/*
```

## Contratos de dados na UI

- Hooks retornam **modelos de domínio** (`types/models.ts` / `core`), não rows crus do Supabase.
- `data/*` mapeia `amount_cents` → helpers de `core/money` quando necessário; preferir manter cents até a borda de display (`MoneyText`).

## Query keys

Centralizar em `src/data/query-keys.ts`:

```ts
export const qk = {
  session: ['session'] as const,
  people: () => ['people'] as const,
  accounts: () => ['accounts'] as const,
  transactions: (ym: string) => ['transactions', ym] as const,
  timelineRows: (from: string, to: string) =>
    ['transactions', 'timeline', from, to] as const,
  cardInvoice: (accountId: string, ym: string) =>
    ['card', accountId, ym] as const,
  goals: () => ['goals'] as const,
}
```

Invalidar o mínimo necessário após mutations (mês + lista afetada).

## Auth e multi-dispositivo

- Supabase Auth (email magic link ou senha — decidir na Fase 1).
- Toda row de negócio com `household_id`.
- RLS: usuário só acessa rows do household em que é membro.
- Capacitor depois: mesmo projeto; deep link de auth documentado na fase mobile.

## Hosting

- Front: **Vercel** (SPA estático a partir de `dist/`). Config em `vercel.json`.
- Dados: **Supabase** (sem API Node na Vercel).
- Passo a passo: `docs/DEPLOY.md`.

## Dinheiro e precisão

Ver `docs/DATA-MODEL.md`. Resumo:

- Colunas `*_cents integer`
- `core/money.ts`: `add`, `sub`, `formatBRL`, `toCents`, `fromInput`
- Proibição de `number` float em persistência

## Legado

Removido na Fase 0: `server/` (Fastify + better-sqlite3), `web/`, `shared/`, scripts sqlite.  
Não reintroduzir. Stack única: Vite + `src/` + Supabase.

## Linha do tempo — engine única

Todo número de dinheiro sai de **uma** conta:

```text
saldo(d) = âncora + Σ eventos até d
```

- **Âncora** — `account_balances`, saldo real informado numa data.
  `core/cashflow/balance-at` anda dela para frente **e para trás**.
- **Ocorrências** — `core/series/expand` transforma linhas (avulsas, modelos de
  série e exceções) nas ocorrências de cada mês.
- **Eventos** — `core/timeline/events` dá sinal e rótulo às ocorrências:
  - `actual` · aconteceu
  - `planned` · previsto, inclusive ocorrência virtual de série
  - `forecast` · variável estimado pelo histórico (`core/forecast`)
- **Recorte** — `core/timeline/balance.groupTimeline` agrupa em dias e meses.
- **Análise** — `core/month-metrics` deriva o dia a dia e as métricas do mês.
  `dailySeries` preenche **todo** dia do mês carregando o saldo: `TimelineMonth.days`
  só tem os dias com movimento, o que serve para extrato e mente no gráfico —
  um mês com lançamento no dia 1 e no 28 viraria uma reta de dois pontos,
  escondendo 27 dias no fundo do poço.

Duas propriedades que caem da soma, não de regra aplicada à mão:

1. `abertura(mês N+1) === fechamento(mês N)` — sem ritual de fechamento.
2. Mês é só um recorte da linha, então não existe "fechar o mês".

### Previsto e realizado são a mesma entidade

Não existe mais `plan_items`. Um lançamento com `status = 'planned'` **é** o
planejamento, e `recurrence = 'monthly'` faz dele a linha-modelo de uma série.

| forma | `rowId` | o que é |
|---|---|---|
| avulsa | id da linha | lançamento normal |
| exceção | id da linha | mês da série que fugiu do padrão (`series_id`) |
| virtual | `null` | projetada pela recorrência, não existe no banco |

`core/series/expand` transforma linhas em ocorrências; a linha-modelo é
definição, não ocorrência — todo mês dela, o primeiro inclusive, sai da
expansão. Editar uma virtual **materializa** uma exceção (`data/series.ts`), e é
só por isso que o banco não enche de linhas especulativas.

Isso apagou uma classe inteira de bug. Antes o app tinha de adivinhar quando um
lançamento cumpria uma conta do plano — por valor exato, depois por categoria —
e errava: em julho/2026 pagou aluguel duas vezes, o real de R$ 4.295,26 mais um
fantasma de R$ 3.600 vindo do plano. Sem duas entidades não há o que conciliar.

Ocorrência prevista com o dia já passado ganha `overdue`: continua pesando no
saldo (é dívida) mas aparece como atraso, não como previsto.

**Saldo só conta realizado.** `cashBalanceAt` recebe apenas linhas com
`status = 'actual'` — previsto é expectativa, não dinheiro.

Módulos removidos por serem respostas concorrentes à mesma pergunta:
`core/projection`, `core/plan`, `core/month-summary`, `core/today`,
`core/simulation`, e as telas Painel, Mês, Futuro, Plano e Linha do tempo —
cinco recortes do mesmo dado, cada um com seu cálculo. Também caiu a abertura
"estimada pelo líquido do mês anterior" em `core/cashflow/opening` (líquido é
variação, não saldo).

Ao adicionar um número novo na UI: derive da timeline. Não crie um cálculo
paralelo — foi exatamente assim que o app passou a errar julho em R$ 9.090.
