# Modelo de dados (Supabase / Postgres)

## Conceitos

| Conceito | Pergunta que responde |
|----------|------------------------|
| **Household** | De qual casa são estes dados? |
| **Profile / Person** | Quem (você / parceiro / casa)? |
| **Account** | Por qual canal o dinheiro passou? (cartão, conta, dinheiro) |
| **Category** | Classificação income/expense (árvore rasa, máx. 2 níveis) |
| **Transaction** | O que aconteceu **ou está previsto** (`status`) |
| **Série** | Lançamento que repete todo mês (`recurrence`) |
| **Exceção de série** | O mês que fugiu do padrão (`series_id`) |
| **Statement** | O que o banco diz que a fatura totalizou (camada B) |
| **Statement payment** | Qual lançamento quitou (parte da) fatura (camada C→B) |
| **Import batch / line** | Extrato anexado e cada linha candidata a conciliação |
| **Account balance** | Saldo real informado / âncora |
| **Month close** | Snapshot de fechamento do mês |
| **Goal** | Meta de reserva / objetivo |
| **Contribution rule** | Como calcular cota Eu da Casa (`settings`) |

`person_id` / dono `NULL` = **da casa** (compartilhado).  
**Sem** privacidade por RLS entre membros: os dois veem tudo; lente Eu/Casa é só UI + filtros.

## Dinheiro

- Sempre `integer` em **centavos**: `amount_cents`, `credit_limit_cents`, etc.
- UI formata com `core/money.formatBRL`.
- Nunca persistir `double`/`real` para valores monetários.
- Percentuais de cota em **basis points** (`integer`, 10000 = 100%) quando persistidos.

## Datas

- Dia: `date` ISO `yyyy-MM-dd`
- Mês de competência: `text` `yyyy-MM`
- Timestamps: `timestamptz`

## Camadas do cartão (obrigatório entender)

| Camada | Entidade | Conta como despesa de consumo? |
|--------|----------|--------------------------------|
| **A · Compras** | `transactions` em conta `credit` | Sim |
| **B · Fatura** | `statements` | Não (agregação) |
| **C · Pagamento** | `transactions` (transfer) + `statement_payments` | Não |

Gap da fatura = `statement.total_cents − soma(A da competence)`.  
Pago = soma(`statement_payments.amount_cents`) (preferir ao `paid_cents` solto; este pode ser cache/derivado).

## Transferência — invariante

`kind = 'transfer'` significa **dinheiro que trocou de conta dentro da casa** e exige
`transfer_account_id` preenchido, diferente de `account_id`. Sem destino conhecido o
dinheiro deixou a casa: é `expense`.

Nunca inferir transferência pelo texto do extrato. "TRANSF ENVIADA PIX" pode ser
gasto (pagou alguém) ou transferência (foi para outra conta sua) — o arquivo não
distingue, e chutar `transfer` esconde gasto real do plano × realizado.

Regra de caixa relacionada: **cartão de crédito não guarda caixa**. Nada que sai
de uma conta `credit` move dinheiro no dia em que acontece — a compra vira
dívida. O caixa só se mexe quando a fatura é paga: `transfer` da corrente para o
cartão, que conta como saída **e não** como entrada no destino. Contar a compra
e o pagamento seria pagar duas vezes. Ver `core/timeline/events.occurrenceDelta`
e `core/cashflow/movements`.

## Tabelas (alvo)

### households
- `id uuid pk`
- `name text`
- `created_at`

### household_members
- `household_id` → households
- `user_id` → auth.users
- `role text` (`owner` | `member`)
- unique `(household_id, user_id)`

### people
Pessoas “lógicas” do casal (além do login), para atribuir gastos e resolver “Eu”.
- `id uuid`
- `household_id`
- `user_id` nullable (liga ao login — **necessário** para escopo Eu)
- `name`, `short_name`, `color`, `sort`

### accounts
- `id`, `household_id`
- `name`, `kind` (`credit` | `checking` | `cash` | `savings`)
- `person_id` nullable (dono visual; não esconde dados)
- `color`, `credit_limit_cents`
- `closing_day`, `due_day` (1–31, credit)
- `archived`, `sort`

### categories
- `id`, `household_id`
- `name`, `kind` (`income` | `expense`)
- `parent_id` nullable
- `essential boolean`
- `color`, `sort`
- unique `(household_id, name, kind)`

### plan_items · **legado**

Substituída por `transactions.status` + `recurrence`. Nenhum código lê estas duas
tabelas; ficam no banco como histórico. Ver `supabase/rollback-2026-07-27-plan-items.json`.

- `id`, `household_id`
- `kind` (`income` | `expense`)
- `name`, `category_id`, `person_id`, `account_id`
- `amount_cents`
- `recurrence` (`monthly` | `installment` | `once`)
- `start_month`, `end_month`, `installments`
- `due_day` (1–31, nullable) — dia de vencimento, com clamp no último dia do mês.
  `31` = "último dia" (fevereiro vira 28/29). Null = sem dia; a linha do tempo
  ancora no fim do mês. **Necessário para projeção**: sem dia não dá para saber
  o que ainda falta acontecer no mês corrente.
- `interest_rate_bps` nullable
- `essential`, `estimated`, `archived`
- `notes`, `sort`, `created_at`

Renda por pessoa alimenta a **cota %**. Itens `estimated` = variável prevista.

### plan_overrides
- `plan_item_id`, `month` (`yyyy-MM`)
- `amount_cents`, `note`
- pk `(plan_item_id, month)`

### transactions
- `id`, `household_id`
- `date`, `competence_month`
- `kind` (`income` | `expense` | `transfer`)
- `description`
- `amount_cents` (≥ 0; sinal pelo `kind`)
- `category_id`, `person_id`, `account_id`
- `status` (`actual` | `planned` | `skipped`) — `planned` é lançamento futuro; o
  planejamento vive aqui, não numa segunda tabela. `skipped` é marcador de
  ocorrência de série cancelada (exige `series_id` e `amount_cents = 0`).
- `recurrence` (`none` | `monthly`) + `recurrence_end` nullable — na linha-modelo
  de uma série. Os meses seguintes são **virtuais**, não linhas gravadas.
- `series_id` nullable → `transactions(id)` — exceção de um mês da série. Única
  por `(series_id, competence_month)`. Ver ARCHITECTURE, "Previsto e realizado
  são a mesma entidade".
- `plan_item_id` nullable — **legado**, não lido por nenhum código. `plan_items`
  e `plan_overrides` seguem no banco só como histórico.
- `installment_no`, `installment_total`, `installment_group`
- `transfer_account_id` nullable — **obrigatório quando `kind = 'transfer'`**
- `notes`, `tags` (`text[]`)
- `source` (`manual` | `import` | `recurring` | `telegram`)
- `external_id` nullable
- `created_at`, `created_by` (user_id)
- unique parcial `(account_id, external_id)` onde external_id not null

**Competência de cartão:** compra com `date` após o fechamento cai no `competence_month` da próxima fatura. Helper em `core/` usando `closing_day`.

### statements
- `account_id`, `month`
- `total_cents`
- `paid_cents` nullable (opcional; preferir derivar de `statement_payments`)
- `closing_date`, `due_date`, `notes`
- `status` opcional (`open` | `closed`)
- pk `(account_id, month)`

### statement_payments
Vínculo C→B (um pagamento pode cobrir parcial; uma fatura pode ter N pagamentos).
- `id uuid pk`
- `statement_account_id` + `statement_month` → statements  
  (ou `statement` via FK composta / surrogate `statement_id` se migrar pk)
- `transaction_id` → transactions (pagamento / transfer)
- `amount_cents`
- `created_at`
- unique `(transaction_id, statement_account_id, statement_month)` (ajuste se usar `statement_id`)

### import_batches
- `id uuid pk`
- `household_id`
- `account_id`
- `source` (`ofx` | `csv`)
- `file_name`, `checksum` nullable
- `period_start`, `period_end` nullable
- `competence_month` nullable
- `status` (`pending` | `reviewed` | `applied`)
- `created_at`, `created_by`

### import_lines
- `id uuid pk`
- `batch_id` → import_batches
- `posted_on` date
- `amount_cents` (≥ 0)
- `kind` (`expense` | `income`) — direção; amount sempre absoluto
- `description_raw`
- `external_id` nullable
- `status` (`suggested` | `matched` | `created` | `ignored` | `unmatched`)
- `matched_transaction_id` nullable
- `match_confidence` integer nullable (**0–100**; ≥85 = alta confiança / auto-match)
- `created_transaction_id` nullable

Match v1 em `core/`: amount exato + mesma conta + data ±2 dias + fuzzy leve de descrição.  
No **upload**, qualquer match fica como `suggested` (prévia) — não cria transaction.  
No **Importar automaticamente**: alta confiança (≥85) → `matched`; sem match → cria lançamento (`created`) com o `person_id` do setup (default = Eu); toast com undo.  
Sugestão média permanece para revisão; ações em lote cobrem o restante.

### account_balances
Saldo real informado (âncora de projeção e visão).
- `id uuid pk` (ou pk `(account_id, as_of_date)`)
- `household_id`
- `account_id`
- `as_of_date` date
- `balance_cents` integer (sinal: ativo positivo; crédito pode ser dívida negativa ou convenção explícita na UI)
- `notes`, `created_at`, `created_by`

### month_closes
- `household_id`, `month`
- `real_balance_cents` (snapshot agregado ou da conta principal — documentar na UI)
- `notes`, `closed_at`
- pk `(household_id, month)`

Preferir projetar a partir de `account_balances` mais recentes; `month_closes` = ritual de fechamento.

### goals
- `id`, `household_id`
- `name`, `target_cents`, `saved_cents`
- `person_id` nullable (meta da casa vs de alguém)
- `deadline_month`, `priority`, `estimated`, `archived`, `notes`

### goal_contributions
- `id`, `goal_id`, `month`, `amount_cents`, `notes`

### categorization_rules
Regras aprendidas no import: fingerprint da descrição → categoria.
- `id`, `household_id`
- `fingerprint` text (chave normalizada; unique com household)
- `match_example` text (descrição original — só UI)
- `category_id`, `person_id` nullable
- `hits` integer, `enabled` boolean
- `created_at`, `updated_at`

Match determinístico em `core/categorization/` (sem regex/fuzzy).  
Ao criar lançamento no import: checkbox “aplicar iguais” + “lembrar”.  
No auto-import / criar pendentes: aplica regras salvas como `category_id`.

### settings
- `household_id`, `key`, `value` (jsonb)
- pk `(household_id, key)`

Chaves previstas:
- `contribution_mode`: `income_share` | `equal_50` | `custom`
- `contribution_custom_bps`: `{ "<person_id>": 6000, ... }` (soma 10000)
- defaults de captura / preferências leves

### telegram_links
Vínculo Telegram ↔ membro (captura pelo bot).
- `id`, `household_id`, `user_id`, `person_id` nullable (default de “quem”; null = Casa)
- `telegram_user_id`, `telegram_chat_id`
- `default_account_id` nullable
- `linked_at`, `revoked_at` nullable
- unique parcial ativos: `user_id`, `telegram_user_id` onde `revoked_at is null`

### telegram_link_codes
Código de pairing de uso único (`/start CODIGO`).
- `code`, `household_id`, `user_id`, `person_id`, `expires_at`, `used_at`
- RPC `create_telegram_link_code(p_person_id, p_ttl_minutes)`

### capture_drafts
Rascunho do bot antes de confirmar (service role).
- `telegram_user_id`, `household_id`, `user_id`, `payload` jsonb
- `status` (`pending` | `confirmed` | `cancelled` | `expired`)
- `last_transaction_id` nullable (para `/desfazer`)
- `expires_at`

### telegram_digest_log
Idempotência do cron de lembrete de fatura.
- `household_id`, `account_id`, `statement_month`, `kind` (`due_soon` | `due_today` | `overdue`)
- `sent_on` (date America/Sao_Paulo)
- unique `(household_id, account_id, statement_month, kind, sent_on)`

Canal: ver `docs/TELEGRAM.md`.

## Cota (domínio em `core/`, não só UI)

Entradas típicas:
- rendas do mês por pessoa (expand do plano + incomes realizadas / estimated)
- total Casa do mês (`person_id` null expenses)
- mode em `settings`

Saídas:
- `share_bps` por pessoa
- `household_share_cents` (cota)
- `personal_spendable_cents`
- `fairness_cents` (pago em Casa − cota)
- `effective_burden_cents` (pessoais + rateio Casa × share) — métrica analítica

Testes Vitest obrigatórios.

## RLS (obrigatório)

Padrão em toda tabela com `household_id`:

- `SELECT/INSERT/UPDATE/DELETE` apenas se `auth.uid()` ∈ `household_members` daquele `household_id`.

Tabelas filhas sem `household_id` direto: policy via join no pai.

Nunca expor `service_role` no client.

## Views / RPC úteis (opcional nas fases)

- Soma de transactions por `competence_month` + account (gap de fatura)
- Totais do mês por kind/category/person
- Soma de `statement_payments` por fatura

Preferir agregar no client via `core/` no início se a query for simples; RPC quando pesar.

## Seed mínimo

- 1 household
- 2 people (com `user_id` no owner)
- Contas: 1 checking + 1–2 credit cards
- Categorias básicas
- 3–5 plan_items (incluir **duas rendas** por pessoa para exercitar cota)
- settings `contribution_mode = income_share`

## Migração a partir do SQLite legado

O arquivo `server/migrations/001_init.sql` (se ainda existir como referência) é domínio, **não** schema final. Diferenças principais na ida ao Supabase:

- `uuid` em vez de ids texto aleatórios
- `household_id` em tudo
- `*_cents integer` em vez de `real`
- Auth real + RLS
- `people.user_id` opcional ligado a `auth.users`

Novas tabelas (`statement_payments`, `import_*`, `account_balances`) entram em migrations **depois** da init — uma migration por fase que as exigir.

## Geração de tipos

```bash
supabase gen types typescript --local > src/data/supabase/types.ts
```

Não editar `types.ts` à mão.
