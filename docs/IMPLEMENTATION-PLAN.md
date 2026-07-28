# Plano de implementação

Plano para construir o **mínimo completo** de fluxo de caixa a dois (Casa + Eu), com qualidade de produto e código.  
Cada fase é uma fatia vertical entregável. **Não avançar de fase sem cumprir o aceite.**

Agentes de IA: implementar **uma fase por conversa/PR** sempre que possível. Atualizar o checkbox da fase ao concluir.

Decisões de produto: ver `VISION.md`. UX: `UX.md`. Schema: `DATA-MODEL.md`.

---

## Visão das fases

| Fase | Nome | Resultado |
|------|------|-----------|
| 0 | Fundação do repo | Vite/React/Tailwind/Supabase limpos; legado removido |
| 1 | Auth + household + schema | Login, RLS, seed, tipos |
| 2 | Core money/month + shell UI | Tokens, layout, rotas, MoneyText |
| 3 | Captura + transactions | `+` fluido, lista, undo |
| 4 | Plano | CRUD + override “só este mês” |
| 5 | Mês (resumo) | Planejado vs realizado |
| 6 | Hoje | Hero spendable Casa + fila |
| **7** | **Settings + escopo Casa/Eu** | Config usável + lente global |
| **8** | **Cartões + fatura + pagamento** | Gap, wizard, vínculo C→B |
| **9** | **Saldo real + fechamento** | Âncora para projeção |
| **10** | **Cota % + painel Eu** | Gestão pessoal + métricas |
| **11** | **Futuro (projeção)** | 6–12 meses com âncora |
| **12** | **Metas + ritmo** | Goals no spendable e no Futuro |
| **13** | **Import + auto-match** | OFX/CSV → conciliação |
| **14** | **Simulação e se…** | Cenários sem gravar à toa |
| **15** | **Polish + Capacitor-ready** | a11y, mobile prep, aspiracional leve |

**Mínimo completo** = fases **0–13**.  
**Aspiracional imediato** = 14–15 (+ itens opcionais no fim).

Fases 0–6 estão feitas. A partir da 7, o caminho prioriza Settings/Eu → Cartão verdadeiro → Saldo → Cota → Futuro → Metas → Import.

---

## Fase 0 — Fundação do repo

### Objetivo
Repo alinhado à arquitetura Supabase; zero SQLite/Fastify no caminho crítico.

### Tarefas
- [x] Remover ou isolar legado: `server/`, scripts sqlite, deps `fastify` / `better-sqlite3` / correlatas
- [x] Garantir app Vite + React 19 + TS + Tailwind 4 em `src/`
- [x] Path aliases (`@/…`) no `vite.config` + `tsconfig`
- [x] Estrutura de pastas vazia conforme `ARCHITECTURE.md`
- [x] `.env.example` com `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY`
- [x] ESLint + scripts: `dev`, `build`, `test`, `lint`
- [x] Vitest configurado
- [x] Atualizar `package.json` description (Supabase, não SQLite)
- [x] Escolher router (React Router 7 **recomendado** por simplicidade) e anotar em `ARCHITECTURE.md`

### Aceite
- [x] `npm run dev` sobe só o front
- [x] `npm run build` passa
- [x] Não há import de `better-sqlite3` / fastify no código ativo
- [x] Pastas `src/core`, `src/data`, `src/features`, `src/components` existem

### Fora de escopo
Schema completo, telas de produto, Capacitor.

---

## Fase 1 — Auth + schema + seed

### Objetivo
Dois usuários podem entrar no mesmo household; schema e RLS no ar.

### Tarefas
- [x] Init Supabase (`supabase/` + migrations)
- [x] Migration: households, members, people, accounts, categories, plan_*, transactions, statements, month_closes, goals*
- [x] Valores em `*_cents integer`
- [x] RLS em todas as tabelas
- [x] Seed local
- [x] `src/data/supabase/client.ts`
- [x] Tipos gerados em `src/data/supabase/types.ts`
- [x] Feature `auth`: login + sessão + redirect
- [x] Helper `getHouseholdId()` / contexto de household

### Aceite
- [x] Login funciona (dev) — requer `.env.local` + migration aplicada (ver `docs/SUPABASE-SETUP.md`)
- [x] Seed cria 1 casa, 2 people, contas, categorias
- [x] Query autenticada retorna só dados do household
- [x] Tentativa cross-household falha via RLS

### Fora de escopo
UI de captura, engine de projeção.

---

## Fase 2 — Core + design system mínimo + shell

### Objetivo
App “parece produto”: tokens, layout, tipografia, rotas vazias bonitas.

### Tarefas
- [x] `core/money.ts` + testes (add/sub/format/parse)
- [x] `core/month.ts` + testes (addMonths, range, format pt-BR)
- [x] `styles/index.css` tokens (ver `UX.md`) — direção visual definida e documentada em comentário no CSS
- [x] Fontes (display + body) via Google/fonts locais
- [x] `components/ui`: Button, Input, Sheet, Skeleton, EmptyState
- [x] `components/money/MoneyText.tsx`
- [x] `app/layouts`: desktop sidebar + mobile bottom nav + FAB `+` (pode abrir placeholder)
- [x] Rotas stub: Hoje, Mês, Plano, Cartões, Futuro, Metas, Settings
- [x] `providers.tsx`: QueryClient + Auth

### Aceite
- [x] Navegação mobile e desktop usáveis
- [x] Tokens aplicados (sem roxo genérico default)
- [x] Testes de money/month verdes
- [x] Empty states nas rotas stub com copy pt-BR

### UX check
- [x] Primeiro viewport do shell é limpo e calmo
- [x] FAB acessível com polegar

---

## Fase 3 — Captura + lançamentos

### Objetivo
A melhor parte do app: lançar é prazeroso e rápido.

### Tarefas
- [x] `data/transactions.ts` + `query-keys`
- [x] `features/capture`: CaptureSheet, AmountKeypad, RecentShortcuts
- [x] Schema Zod (valor obrigatório; categoria opcional)
- [x] Mutation com **optimistic update** + Sonner **Desfazer**
- [x] Lista recente na Hoje (mínimo) ou página transactions
- [x] Swipe/menu: editar, duplicar, excluir (mínimo: editar + excluir)
- [x] Defaults: conta e pessoa via `lib/storage`
- [ ] Parcelar (N×) gerando grupo `installment_group` → **mover para Fase 8.1 ou 15** se ainda aberto

### Aceite
- [x] Lançar saída em ≤ 4 toques no fluxo feliz
- [x] Aparece na lista sem reload manual
- [x] Desfazer remove o lançamento
- [x] `amount_cents` correto (ex.: 19,90 → 1990)
- [x] Sem categoria permitido

### UX check
- [x] Keypad grande; sheet suave
- [x] Não há formulário “administrativo” no fluxo feliz

---

## Fase 4 — Plano

### Objetivo
Orçamento vivo editável sem medo.

### Tarefas
- [x] `data/plan-items.ts` + overrides
- [x] `core/plan/expand.ts` + testes (monthly / installment / once + override)
- [x] UI PlanPage com grupos
- [x] Inline edit de valor → scope **Só este mês** | **Daqui pra frente**
- [x] Sheet novo item (3 templates)
- [x] Arquivar item

### Aceite
- [x] Expand gera linhas corretas para 3 tipos de recorrência
- [x] Override não altera outros meses
- [x] “Daqui pra frente” atualiza `amount_cents` do plan_item
- [x] Testes do expand verdes

### Nota para fases seguintes
Criação de item ainda defaulta pessoa/conta sem seletor explícito — corrigir na **Fase 7** (Settings/Plano) e reforçar na **10** (rendas por pessoa).

---

## Fase 5 — Mês (planejado vs realizado)

### Objetivo
Acompanhar o mês com clareza.

### Tarefas
- [x] `useMonthData`: combina expand(plan) + transactions do `ym`
- [x] MonthSwitcher (URL `/month/:ym`)
- [x] MonthSummary (planejado / realizado / diferença)
- [x] CategoryBreakdown (toque → lista filtrada)
- [x] PersonBreakdown (Casa / P1 / P2)
- [x] Frase humana de insight (regra simples)

### Aceite
- [x] Trocar mês é instantâneo (cache Query)
- [x] Totais batem com centavos (teste de integração ou unit no aggregator)
- [x] Copy pt-BR clara

---

## Fase 6 — Hoje

### Objetivo
Home útil, não dashboard inchado (**Casa**).

### Tarefas
- [x] Cálculo “ainda posso gastar” (teto variável − gasto variável do mês)
- [x] Upcoming dues (próximas faturas / itens do plano)
- [x] ReviewQueue (sem categoria)
- [x] RecentTransactions reutilizando componentes da Fase 3

### Aceite
- [x] Um número herói
- [x] CTA óbvio para lançar / revisar
- [x] Sem excesso de cards

### Nota
Herói atual é da **casa**. Escopo Eu + cota entram nas Fases **7** e **10**.

---

## Fase 7 — Settings + escopo Casa / Eu / Tudo

### Objetivo
Configuração usável e lente global. Desbloqueia gestão pessoal e operação do dia a dia.

### Tarefas
- [x] `data/people.ts`, `data/accounts.ts`, `data/categories.ts` (CRUD mínimo) + query-keys
- [x] Settings: editar pessoas (nome, cor, ligar `user_id`), contas, categorias
- [x] Contexto/hook de escopo: `Casa | Eu | Tudo` persistido em `lib/storage`
- [x] Chip de escopo no shell (desktop + mobile)
- [x] Filtrar Hoje / Mês / Plano / listas recentes pelo escopo
- [x] Capture: opção explícita **Casa** em Quem; defaults coerentes com escopo
- [x] Plano: seletor de pessoa (e conta) ao criar/editar item
- [x] Atalho mobile para Plano (não só enterrado em Mais)
- [x] Settings: chave `contribution_mode` (UI pode ser stub até Fase 10; persistir default `income_share`)

### Aceite
- [x] Dá para cadastrar/editar pessoa, conta e categoria sem SQL
- [x] Trocar escopo muda copy/filtros na Hoje e no Mês sem reload manual
- [x] `Eu` resolve via `people.user_id === auth.uid()`
- [x] Casa = `person_id` null tratada de forma explícita na captura
- [x] Home Casa continua com **um** herói (sem grade de KPIs)

### UX check
- [x] Chip acessível; estado óbvio
- [x] Settings com empty/loading/erro

### Fora de escopo
Cálculo completo de cota (Fase 10), cartões (8), import (13).

---

## Fase 8 — Cartões + fatura + pagamento vinculado

### Objetivo
Cartão deixade ser caixa-preta: gap visível, wizard de fechamento, pagamento **não** double-count.

*(Absorve a antiga Fase 7 e adiciona camada C→B.)*

### Tarefas
- [x] Migration: `statement_payments` (+ `statements.status` se ainda não existir) — ver `DATA-MODEL.md`
- [x] `core`: competence month a partir de `closing_day` + testes
- [x] `core`: gap = total fatura − soma compras da competence + testes
- [x] `data/statements.ts` + `data/statement-payments.ts`
- [x] CardsPage + CardDetail
- [x] Invoice list por `competence_month`
- [x] InvoiceGapBanner
- [x] CloseInvoiceWizard (3 passos): total → gap → **vincular pagamento**
- [x] Registrar pagamento como transfer (corrente → crédito) **ou** linkar transaction existente via `statement_payments`
- [x] UI: pago/parcial derivado da soma dos links (não tratar pagamento como despesa de consumo no Mês)
- [ ] (Opcional nesta fase) Parcelar N× na captura se couber sem estourar

### Aceite
- [x] Gap = `statement.total_cents − soma expenses da competence` (centavos)
- [x] Wizard completa o fluxo feliz
- [x] Limite / usado / disponível corretos
- [x] Após vincular pagamento, fatura reflete valor pago; Mês **não** infla gasto de consumo com o PIX da fatura
- [x] Testes de competence + gap verdes

### UX check
- [x] Vermelho só no gap real
- [x] Copy pt-BR clara (fatura / compras / pagamento)

### Fora de escopo
Import de arquivo (Fase 13), projeção (11).

---

## Fase 9 — Saldo real + fechamento do mês

### Objetivo
Âncora de verdade para visão e Futuro.

### Tarefas
- [x] Migration: `account_balances` (se ainda não existir)
- [x] `data/account-balances.ts` + `data/month-closes.ts`
- [x] UI: informar/atualizar saldo por conta (Settings e/ou atalho em Cartões/Mais)
- [x] Ritual `month_closes` (snapshot do mês + nota)
- [x] Expor âncora atual para hooks do Futuro (mesmo que FuturePage ainda stub)
- [x] Testes `core` de “saldo âncora + moviment do plano” se houver helper puro

### Aceite
- [x] Consigo registrar saldo de pelo menos uma conta corrente e ver o valor persistido
- [x] Fechar mês grava `month_closes` sem apagar lançamentos
- [x] Convenção de sinal do cartão documentada na UI (dívida vs limite)

### UX check
- [x] Não transformar Hoje num dashboard de saldos

### Fora de escopo
Projeção visual completa (Fase 11).

---

## Fase 10 — Cota proporcional + painel Eu

### Objetivo
Gestão financeira individual de verdade: herói Eu + métricas (cota, pessoais, carga, fairness).

### Tarefas
- [x] `core/contribution/` (share bps, cota, spendable Eu, fairness, effective burden) + testes
- [x] Renda do mês por pessoa: expand de incomes do plano + overrides + variável (`estimated` / realizado)
- [x] Settings UI: `income_share` | `equal_50` | `custom` (bps)
- [x] Hoje no escopo Eu: herói “ainda posso gastar” com fórmula VISION
- [x] Cards de suporte no Eu: cota · pessoais · fairness · carga efetiva
- [x] Mês no escopo Eu: insights “Você…” + bloco fairness opcional
- [x] Metas ainda não descontam spendable (hook opcional; desconto real na Fase 12)
- [x] Seed/docs: duas rendas de exemplo por pessoa

### Aceite
- [x] Com rendas 60/40 e Casa R$X, cotas batem em centavos (teste)
- [x] Sem renda cadastrada, fallback 50/50 (ou equal) explícito na UI
- [x] Escopo Casa inalterado em calma (1 herói)
- [x] Fairness visível no Eu sem forçar settle-up

### UX check
- [x] Densidade só no Eu; Casa sem grade de KPIs

### Fora de escopo
Settle-up / “quem deve a quem” como produto.

---

## Fase 11 — Futuro (projeção)

### Objetivo
Ver 6–12 meses à frente com a engine do plano **e** âncora de saldo.

*(Antiga Fase 8, reforçada.)*

### Tarefas
- [x] `core/projection/project.ts` + testes (determinístico)
- [x] FuturePage: saldo projetado, faturas futuras, fim de parcelas
- [x] Usa `account_balances` / `month_closes` como âncora quando existir
- [x] Respeita escopo Casa (obrigatório); Eu se os números forem claros
- [x] Empty state se não houver âncora: copy pedindo saldo (Fase 9)

### Aceite
- [x] Projeção determinística (testes)
- [x] UI legível (não planilha crua)
- [x] Com âncora, o mês 0 parte do saldo real; sem âncora, comportamento explícito

### Fora de escopo
Simulação “e se…” (Fase 14).

---

## Fase 12 — Metas + ritmo

### Objetivo
Metas motivam de verdade: progresso, aporte, impacto no spendable e no Futuro.

*(Parte da antiga Fase 9 — metas antes da simulação.)*

### Tarefas
- [x] `data/goals.ts` + contributions
- [x] Goals CRUD (casa ou person)
- [x] UI ritmo: aporte necessário vs atual até o deadline
- [x] Aporte do mês reduz spendable Casa e/ou Eu
- [x] Metas aparecem no Futuro (ritmo / saldo reservado)
- [x] Testes de ritmo em `core/`

### Aceite
- [x] Criar meta + registrar aporte atualiza progresso
- [x] Spendable reflete aporte do mês corrente
- [x] Copy pt-BR clara

### Fora de escopo
Simulação (14).

---

## Fase 13 — Import de extrato + auto-match

### Objetivo
Anexar OFX/CSV, importar linhas do mês e conciliar com lançamentos (e com o ritual de fatura).

### Tarefas
- [x] Migration: `import_batches`, `import_lines`
- [x] Parser OFX + CSV mínimo (presets BR depois se precisar)
- [x] `core/import/match.ts` + testes (amount + conta + data ±2d + fuzzy leve)
- [x] Wizard: arquivo → **revisar prévia** → **Importar automaticamente** → concluir
- [x] Upload só cria batch/lines + sugestões; não grava no livro
- [x] Alta confiança no CTA: aplica (`matched`) + toast **Desfazer**
- [x] Sem match no CTA: **cria lançamento** com dono do setup (default Eu) + desfazer lote
- [x] Setup do lote: conta + **lançar como** (Eu / Casa / pessoa)
- [x] Ações em lote: confirmar sugestões, ignorar atenção, PIX → transferência
- [x] Ações: vincular manual, criar lançamento, ignorar
- [x] Idempotência via `external_id` / checksum do batch
- [x] Entrada a partir de Cartões (conta credit) e Contas (checking)
- [x] Após import de fatura, gap/reconciliation da Fase 8 se beneficia das compras criadas/matched

### Aceite
- [x] Anexar extrato de teste cria batch + lines **sem** criar transactions
- [x] “Importar automaticamente” vincula alta confiança e cria as novas; desfazer reverte
- [x] Não duplica transaction com mesmo `external_id` na conta
- [x] Fluxo usável em ~viewport mobile

### UX check
- [x] Ritual de organização (não parece sync bancário mágico)
- [x] Status da fila legíveis em pt-BR
- [x] Prévia legível antes de gravar no livro

### Fora de escopo
PDF/OCR, Open Finance contínuo.

---

## Fase 14 — Simulação “e se…”

### Objetivo
Brincar com cenários sem estragar o plano real.

*(Restante da antiga Fase 9.)*

### Tarefas
- [x] `core/simulation/applyPatches.ts` + testes
- [x] Toggle visual de simulação no Futuro
- [x] Comparar Base | Simulado
- [x] Descartar / aplicar no plano (aplicar = confirmação forte)

### Aceite
- [x] Simulação não grava no plano sem “Aplicar” confirmado
- [x] Visual distinto (rascunho) conforme `UX.md`

---

## Fase 15 — Polish + pronto para Capacitor (+ aspiracional leve)

### Objetivo
Acabar o mínimo completo com qualidade de produto; opcionais leves.

### Tarefas (obrigatórias)
- [ ] Revisar empty/loading/erro em todas as rotas
- [ ] Safe-area / `viewport-fit=cover`
- [ ] `lib/storage` sem quebrar SSR/native
- [ ] Documentar passos Capacitor em `docs/MOBILE.md`
- [ ] Auditoria UX contra `UX.md` anti-padrões
- [ ] README com setup Supabase real
- [ ] Parcelar N× na captura se ainda não feito

### Tarefas (aspiracionais — só se couber)
- [ ] Patrimônio simples (soma saldos − dívidas de cartão)
- [ ] Alertas proativos (estouro, vencimento, saldo baixo)
- [ ] Média móvel 3 meses da % de cota (renda variável)
- [ ] Export CSV / backup
- [ ] `⌘K` busca leve
- [ ] Money date / checklist de ritual mensal

### Aceite
- [ ] Checklist UX.md passa
- [ ] Build de produção ok
- [ ] Docs mobile rascunhadas
- [ ] Fases 0–13 utilizáveis ponta a ponta no fluxo feliz do casal

---

## Ordem de prioridade se precisar cortar

**Nunca cortar antes do mínimo:**  
`7 → 8 → 9 → 10 → 11 → 12 → 13`

**Cortar primeiro:** 14 (simulação), aspiracionais da 15, patrimônio, alertas, média móvel.

**Pode adiar com dor aceitável:** Parcelar N×; fairness visual (manter cálculo); import CSV se OFX bastar.

Cartão (8) e saldo (9) antes de Futuro (11): projeção sem âncora e sem fatura é frágil.  
Metas (12) antes de simulação (14): motivação real > “e se” cedo.  
Import (13) depois do modelo A/B/C (8): evita double-count.

---

## Definição de “mínimo completo”

O sistema está completo o bastante para largar planilha paralela quando:

1. Dois logins no mesmo household lançam e veem os mesmos dados (transparência total).
2. Captura é rápida e prazerosa (Fase 3).
3. Plano expande certo; mês compara planejado vs feito (4–5).
4. Escopo Casa / Eu / Tudo funciona; Settings edita pessoas/contas/categorias (7).
5. Cartão mostra gap, fecha fatura e **vincula pagamento** sem double-count (8).
6. Saldo real ancora o mês/Futuro (9).
7. Painel Eu: cota proporcional + herói + fairness/carga (10).
8. Futuro projeta 6–12 meses com âncora (11).
9. Metas têm ritmo e afetam spendable (12).
10. Extrato importa e auto-match casa com lançamentos (13).
11. Código segue `core` / `data` / `features`; dinheiro só em centavos; testes nos motores novos.

---

## Canal Telegram + GPT (paralelo às fases 0–15)

Captura pelo Telegram (comandos, texto livre, foto de cupom). Não bloqueia o mínimo completo do painel.

### Tarefas
- [x] Migration: `telegram_links`, `telegram_link_codes`, `capture_drafts`, `source=telegram`
- [x] `src/core/capture/` + testes (draft, cheap-parse, hints)
- [x] Edge Function `supabase/functions/telegram-bot` (webhook, vínculo, GPT texto/vision, confirmar, desfazer)
- [x] Settings → Telegram (gerar código, defaults, desvincular)
- [x] Docs: `TELEGRAM.md`, DATA-MODEL, DEPLOY, ARCHITECTURE

### Aceite
- [ ] Migration aplicada no projeto Supabase
- [ ] Function deployada + webhook + secrets (`TELEGRAM_BOT_TOKEN`, `OPENAI_API_KEY`)
- [ ] Membros vinculam via Settings e `/start CODIGO`
- [ ] `/saida 35,90 café` → confirmar → aparece no painel (`amount_cents` ok)
- [ ] Foto de cupom → rascunho → confirmar (sem gravar automático)
- [ ] `/desfazer` remove o último do bot
- [ ] Nenhuma key OpenAI/Telegram no bundle Vercel

### Fora de escopo (v1)
Fatura, import OFX, plano/séries, consultas “como está o mês”, áudio.

Setup operacional: `docs/TELEGRAM.md`.

### Telegram v1.1 — Fluidez (paralelo)
- [x] Typing + editar mensagem + limpar teclado
- [x] Preview rico (conta/categoria/data/quem)
- [x] Cache curto de contexto household
- [x] Cheap-parse ampliado + auto-confirm (≥ 0,95)
- [x] Correção por reply na preview

### Telegram v1.2 — Captura mais rica
- [x] Teclado Conta / Categoria / Data
- [x] Aprende `categorization_rules` ao mudar categoria
- [x] `/ultimo` + valor
- [x] Caption hints na foto
- [x] Batch multi-linha
- [x] PDF de cupom/NF (confirmação obrigatória)

### Telegram v1.3 — Canal avançado
- [x] Áudio (Whisper)
- [x] Cupom multi-item (botão Itens)
- [x] Parcelas Nx (`installment_group`)
- [x] Transferência real + Destino
- [x] Enrich híbrido (cheap trava valor; LLM categoriza)

### Telegram v1.4 — Assistente
- [x] `/mes`, `/saldo`, `/cota` (`src/core/assistant/` + handlers no bot)
- [x] Digest fatura (`?action=digest`, migration `telegram_digest_log`)
- Notificação in-app do parceiro: **fora de escopo** (descartado)

---

## Mapeamento do plano antigo → novo

| Antigo | Novo |
|--------|------|
| Fase 7 Cartões | Fase **8** (+ `statement_payments`) |
| Fase 8 Futuro | Fase **11** (+ âncora obrigatória na prática) |
| Fase 9 Simulação + metas | **12** Metas → **14** Simulação |
| Fase 10 Polish | Fase **15** |
| — | **7** Settings + escopo |
| — | **9** Saldo real |
| — | **10** Cota + painel Eu |
| — | **13** Import + match |

---

## Tracking

Marque checkboxes neste arquivo ao concluir. Se uma tarefa mudar de escopo, atualize o aceite **antes** de implementar (para a IA não “completar” a meta errada).
