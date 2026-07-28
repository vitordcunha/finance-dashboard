# Workflow para desenvolvimento com IA

Este projeto será construído majoritariamente com agentes de IA. Este doc define **como** pedir e executar trabalho para manter qualidade.

## Fonte da verdade

Ordem de precedência quando houver dúvida:

1. `AGENTS.md` (regras absolutas)
2. Fase atual em `IMPLEMENTATION-PLAN.md` (escopo + aceite)
3. `UX.md` / `DATA-MODEL.md` / `ARCHITECTURE.md`
4. Código existente no mesmo feature (imitar padrões)
5. Instrução solta do chat (não pode furar 1–3)

## Tamanho da tarefa

**Bom**
- “Implementar Fase 3 até o aceite, sem Parcelar se estourar escopo”
- “Adicionar InvoiceGapBanner + cálculo em core com testes”

**Ruim**
- “Faz o app inteiro”
- “Melhora a UI” (sem tela/critério)
- “Refatora tudo para ficar limpo”

Uma conversa ≈ **uma fase** ou **um sub-aceite** de fase.

## Prompt template (copiar)

```text
Leia AGENTS.md e docs/IMPLEMENTATION-PLAN.md.

Implemente a Fase N — <nome>.
Escopo: apenas as tarefas listadas nessa fase.
Não avance para a fase seguinte.
Não reintroduza SQLite/Fastify.
Siga docs/UX.md para qualquer UI.
Dinheiro em centavos; cálculos em src/core com testes.

Ao terminar:
1. Liste o que foi feito
2. Marque mentalmente o aceite (e atualize checkboxes do plano se tiver permissão)
3. Diga o que ficou de fora e por quê
```

## Regras de execução para o agente

### Sempre
- Ler docs da fase antes de criar arquivos
- Reusar `components/ui` e tokens — não inventar estilo paralelo
- Componentes novos pequenos; pages só compõem
- Após mudar `core/`: testes
- Após UI: loading / empty / erro
- pt-BR na interface

### Nunca
- Criar abstração “para o futuro” sem uso na fase
- Importar Supabase dentro de component de feature
- Usar `float` para dinheiro
- Expandir escopo (“já que estou aqui…”) sem o usuário pedir
- Apagar docs ou checkboxes de fases futuras
- Commitar secrets (`.env.local`)

### Quando o código legado conflitar
- Remover na Fase 0; depois disso, **não** portar Fastify
- Schema antigo SQLite = referência de domínio, não copiar `REAL` money

## Padrão de arquivo novo

Ao criar feature:

```text
features/<nome>/
  pages/<Name>Page.tsx
  components/<Algo>.tsx      # um conceito por arquivo
  hooks/use<Algo>.ts
  schema.ts                  # se houver form
```

Hook fala com `data/` + `core/`.  
Component recebe props já prontas.

## Definition of Done (micro)

Uma tarefa só está done se:

- [ ] Aceite da fase relacionado passa
- [ ] `npm run build` (ou pelo menos tsc + testes tocados) ok
- [ ] Sem bypass de camada (UI → Supabase)
- [ ] UI em pt-BR; valores via MoneyText/formatBRL
- [ ] Não quebrou navegação existente

## UI com IA — cuidados extras

Modelos tendem a:
- roxo / gradiente indigo
- muitos cards
- formulários longos
- Inter everywhere

**Antes de merge visual**, confrontar com `docs/UX.md` anti-padrões.  
Pedir explicitamente: “revise contra docs/UX.md anti-padrões”.

## Reviews sugeridos (prompts)

**Precisão**
```text
Revise apenas src/core e mapeamentos de amount_cents.
Procure float, arredondamento errado e testes faltando.
```

**Arquitetura**
```text
Liste imports que violam a regra de camadas em ARCHITECTURE.md.
```

**UX**
```text
Avalie a tela X contra docs/UX.md.
Liste anti-padrões encontrados e correções concretas.
```

## Commits (quando o usuário pedir)

- Mensagens em português ou inglês — seguir histórico do repo
- Focar no porquê
- Sem coautoria Cursor
- Não commitar `.env.local`, service role, seeds com segredo

## Atualizando o plano

Quando uma decisão de produto mudar:
1. Atualizar `VISION.md` ou `UX.md` / `DATA-MODEL.md`
2. Ajustar aceite da fase afetada em `IMPLEMENTATION-PLAN.md`
3. Só então implementar

Código sem doc = a próxima sessão de IA desfaz a decisão.

## Fase mobile (depois)

Não misturar Capacitor antes do mínimo completo (Fases 0–13).  
Quando chegar a hora: criar `docs/MOBILE.md` na Fase 15.
