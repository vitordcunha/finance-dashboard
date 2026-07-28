# Canal Telegram (captura + GPT)

Bot de captura rápida para o casal: texto, comandos, foto ou PDF de cupom/NF.  
Grava no **mesmo** Postgres do app (`source = telegram`). A LLM só **extrai**; o lançamento só nasce após **Confirmar** (exceto cheap-parse de alta confiança — ver abaixo).

## Arquitetura

```text
Telegram → Edge Function `telegram-bot`
  → cheap-parse OU OpenAI (texto/vision/PDF)
  → capture_drafts (pending)  OU  auto-grava (cheap-parse ≥ 0,95)
  → Confirmar → transactions
React app ← TanStack Query (mês/extrato)
```

Secrets da function (nunca no Vite/Vercel front):

| Secret | Uso |
|--------|-----|
| `TELEGRAM_BOT_TOKEN` | BotFather |
| `TELEGRAM_WEBHOOK_SECRET` | opcional; header `X-Telegram-Bot-Api-Secret-Token` |
| `OPENAI_API_KEY` | texto livre + foto + PDF |
| `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` | injetados pelo runtime |

Env do front (opcional):

| Var | Uso |
|-----|-----|
| `VITE_TELEGRAM_BOT_USERNAME` | deep link `t.me/bot?start=CODE` em Settings |

## Setup

Projeto linkado: **finance-dashboard** (`zrqlbqevkpiejnmeqvax`).  
Function URL:

```text
https://zrqlbqevkpiejnmeqvax.supabase.co/functions/v1/telegram-bot
```

1. **Migration** `20260728120000_telegram_capture.sql` — já aplicada via `supabase db push`.
2. Criar bot no [@BotFather](https://t.me/BotFather) → copiar token + username.
3. Deploy da function (já feito uma vez; redeploy após mudanças no código):

```bash
supabase functions deploy telegram-bot --project-ref zrqlbqevkpiejnmeqvax --no-verify-jwt
```

(`verify_jwt = false` em `supabase/config.toml` — o webhook do Telegram não manda JWT do Supabase.)

4. Secrets:

```bash
supabase secrets set TELEGRAM_BOT_TOKEN=...
supabase secrets set OPENAI_API_KEY=...
# TELEGRAM_WEBHOOK_SECRET — já configurado no projeto; use o mesmo valor no setWebhook
```

5. Webhook (substitua TOKEN e SECRET):

```bash
curl "https://api.telegram.org/bot<TOKEN>/setWebhook" \
  -d "url=https://zrqlbqevkpiejnmeqvax.supabase.co/functions/v1/telegram-bot" \
  -d "secret_token=<TELEGRAM_WEBHOOK_SECRET>"
```

6. No app / Vercel: `VITE_TELEGRAM_BOT_USERNAME=finance_panel_bot` (sem `@`).
7. Configurações → Telegram → Gerar código → `/start CODIGO` no bot
   ([@finance_panel_bot](https://t.me/finance_panel_bot)).

## Comandos

| Entrada | Efeito |
|---------|--------|
| `/start CODIGO` | Vincula Telegram ↔ usuário |
| `/saida 35,90 café` | Auto-grava (cheap-parse) |
| `/entrada 500 freelance` | Auto-grava |
| `/casa …` / `/eu …` | Força pessoa + auto-grava se parse ok |
| `35 café` / `café 35,90` | Cheap-parse natural |
| `gastei 40 uber` / `recebi 500 freelance` | Cheap-parse com verbo |
| `ontem 50 farmácia` | Data relativa no parse |
| texto livre (não estruturado) | GPT → rascunho → Confirmar |
| foto de cupom | GPT vision → rascunho → Confirmar |
| PDF de cupom/NF (≤ 8 MB) | GPT (Responses) → rascunho → Confirmar |
| áudio / voice | Whisper → parse/GPT → Confirmar ou auto |
| `transferir 500 nubank inter` | Transferência real (origem + destino) |
| `1200 notebook 10x` | N parcelas (1ª actual, demais planned) |
| Itens (no preview) | Alterna total vs linhas do cupom |
| valor sozinho (ex. `47,90`) | Corrige valor do rascunho pendente |
| reply na preview + texto | Corrige descrição / valor / quem |
| Confirmar / Cancelar / Casa / Eu | Inline buttons (edita a mesma msg) |
| Conta / Categoria / Data | Submenus no rascunho GPT/foto/PDF |
| `/ultimo` | Atalhos das descrições recentes |
| várias linhas (`35 café`↵`40 uber`) | Batch auto-grava |
| foto/PDF + `eu nubank` | Hints de pessoa/conta no caption |
| `/desfazer` | Apaga o último lançamento do bot |
| `/cancelar` | Descarta rascunho |
| `/mes` | Folga + resumo do mês (read-only) |
| `/saldo` | Caixa hoje por conta (âncoras) |
| `/cota` | Cota Casa + fairness da pessoa vinculada |
| `/ajuda` | Lista curta |

## Comportamento (híbrido)

- **Texto estruturado:** cheap-parse trava valor/kind → LLM **enriquece** (descrição, categoria, conta, quem) → auto-grava se confiança alta e sem conflito de valor; senão preview.
- Valor da LLM **nunca sobrescreve** o parse local; se discordar, warning + Confirmar.
- **Várias linhas** → enrich por linha + batch (auto as ok, preview da pendente).
- **GPT puro** só quando cheap-parse falha (texto livre) ou mídia (foto/PDF).
- **Áudio** → Whisper → mesmo pipeline híbrido.
- Transferência / parcelas → sempre preview.
- PDF: máx. **8 MB**; foto/PDF nunca auto-grava.
- Mudar **Categoria** no teclado → upsert em `categorization_rules`.
- `/ultimo` → valor + descrição → também passa por enrich.
- Preview e ajustes **editam a mesma mensagem**; `typing` no GPT.

## Código

| Peça | Onde |
|------|------|
| Schema | `supabase/migrations/20260728120000_telegram_capture.sql` + `…_telegram_digest_log.sql` |
| Function | `supabase/functions/telegram-bot/` |
| Domínio captura + testes | `src/core/capture/` |
| Domínio consulta + testes | `src/core/assistant/` (espelho Deno em `telegram-bot/assistant.ts`) |
| UI vínculo | `src/features/settings/components/TelegramSection.tsx` |
| Data | `src/data/telegram.ts` |

## Digest de fatura (cron)

Endpoint (aceita webhook secret **ou** `Authorization: Bearer <service_role>`):

```bash
curl -s "https://zrqlbqevkpiejnmeqvax.supabase.co/functions/v1/telegram-bot?action=digest" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY"
```

Envia lembrete em **D−3**, **D0** e **D+1** (venceu ontem) para faturas `unpaid`/`partial`.  
Um chat por household (primeiro `telegram_links` ativo). Idempotente via `telegram_digest_log`.

**Agendado via CLI + migration** (`20260728141000_telegram_digest_cron.sql`):

- `pg_cron` job `telegram-invoice-digest` — `0 12 * * *` UTC (~09:00 America/Sao_Paulo)
- HTTP via `pg_net` usando secrets do Vault: `project_url`, `service_role_key`

Conferir:

```bash
npx supabase@2.110.0 db query --linked \
  "select jobid, jobname, schedule, active from cron.job where jobname = 'telegram-invoice-digest';"
```

Dashboard: [Integrations → Cron](https://supabase.com/dashboard/project/zrqlbqevkpiejnmeqvax/integrations/cron/jobs).

## Regras de produto

- Dinheiro em **centavos integer** — parse local é fonte da verdade do valor (LLM só enriquece).
- Sem gravação automática em foto/PDF — sempre confirmação.
- Sem fatura/import/plano pelo bot (v1). Consulta de fatura = só lembrete de vencimento.
- Categoria: hint da LLM (enrich) ou `categorization_rules` por fingerprint.
- `/mes` é digest (caixa hoje − previsto restante − colchão), **não** o herói `lowestAhead` do painel.

## Roadmap

### v1.1 — Fluidez

- [x] `sendChatAction` (typing)
- [x] Editar mensagem + limpar teclado após confirmar/cancelar/ajustar
- [x] Preview rico (conta · categoria · data · quem)
- [x] Cache curto do contexto do household
- [x] Cheap-parse ampliado (ordem natural, verbos, datas relativas)
- [x] Auto-confirm no cheap-parse (≥ 0,95)
- [x] Correção por reply na preview

### v1.2 — Captura mais rica

- [x] Teclado: Conta / Categoria / Data no rascunho
- [x] Aprender `categorization_rules` quando o usuário corrige categoria
- [x] Atalhos: últimos merchants / `/ultimo`
- [x] Caption na foto como hints (`eu nubank`)
- [x] Batch: várias linhas → N lançamentos
- [x] PDF de cupom/NF (≤ 8 MB, confirmação obrigatória)

### v1.3 — Canal avançado

- [x] Áudio (Whisper) — voice/áudio → texto → parse/GPT
- [x] Cupom multi-item (botão Itens no preview quando GPT listar ≥2)
- [x] Parcelas (`1200 notebook 10x`) — grupo `installment_*`; 1ª actual, demais planned
- [x] Transferência real (`transferir 500 nubank inter` + teclado Destino)
- [x] Enrich híbrido: cheap-parse trava valor; LLM categoriza/formata

### v1.4 — Assistente (consulta)

- [x] `/mes`, `/saldo`, `/cota` (read-only; domínio em `src/core/assistant/` + espelho Deno)
- [x] Digest / lembrete de fatura (`?action=digest` + `telegram_digest_log`)
- [ ] ~~Notificação no app quando o parceiro lança via bot~~ (descartado)

**Princípios:** Telegram ≠ segundo painel; foto/PDF/áudio nunca auto-grava sem parse claro; centavos após parse local; preferir editar mensagem a spammar chat.
