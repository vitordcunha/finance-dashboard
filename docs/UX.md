# UX e interface

Documento normativo para UI. Se conflitar com “inventar um dashboard genérico”, este doc vence.

## Princípios

1. **Captura em ~5 segundos** — valor → descrição → salvar. Resto é opcional.
2. **Um herói por tela** — um número ou mensagem principal; o resto é suporte.
3. **Casa calma · Eu denso** — home da casa sem grade de KPIs; escopo Eu pode mostrar métricas de suporte sob o herói.
4. **Três modos separados** — não misturar captura, organização e visão na mesma hierarquia visual.
5. **Português humano** — “Quanto ainda posso gastar”, não “remaining_variable_budget”.
6. **Vermelho só para problema** — gap de fatura, estouro, saldo negativo. Saída normal é neutra.
7. **Mobile-first** — polegar na zona inferior; `+` sempre acessível.
8. **Prazeroso, não infantil** — motion curto e útil; sem confete, sem emoji decorativo em massa.
9. **Sem privacidade falsa** — tudo visível aos dois; separação é **lente**, não ACL.

## Escopo Casa · Eu · Tudo — **desligado por ora**

O chip saiu do shell. Ele mudava o **significado** dos números em silêncio: a
reserva de vencimentos, por exemplo, só era descontada quando a lente era "Eu"
*e* era o mês corrente, então o mesmo mês valia coisas diferentes conforme o
chip. Com uma pessoa só usando o app, era superfície confusa sem contrapartida.

O domínio continua inteiro (`core/contribution/`, `person_id` em tudo): quando o
segundo login entrar, a lente volta como modo opt-in em Config. Regra ao
reativar: **saldo de conta nunca é filtrado por pessoa** — saldo é fato do
banco. A lente vale para detalhamento de gasto, não para o caixa.

## Navegação

| Rota | Nome UI | Trabalho |
|------|---------|----------|
| `/` | **Mês a mês** | A aplicação: um mês por vez, com dashboard e dia a dia |
| `/more` | Mais | Hub para import, contas/saldos, cartões, metas |

Detalhe, sempre alcançável por `/more`: `/import`, `/settings`, `/cards`,
`/cards/:id`, `/goals`.

**Por que duas.** Painel, Mês, Futuro, Plano e Linha do tempo eram cinco
recortes do mesmo dado, cada um com seu cálculo — e por isso discordavam entre
si na tela. Viraram uma só. Plano sumiu porque previsto e realizado passaram a
ser a mesma entidade: **lançamento futuro é o planejamento**.

Regra que essa navegação existe para não repetir: **nenhuma rota sem link de
entrada**. `/cards`, `/goals`, `/month/:ym` e `/future` chegaram a ficar
alcançáveis só digitando a URL.

Desktop: sidebar. Mobile: bottom nav de dois itens. O botão de lançamento mora
na própria página — é ela que sabe qual mês está aberto.

## Captura (feature crítica)

### Fluxo feliz

```text
Abrir + → digitar valor (teclado numérico) → o quê → [Conta/Quem com default] → Salvar
```

### Regras

- Categoria **não** é obrigatória na captura.
- **Casa** deve ser opção explícita em Quem (`person_id` null) — não só default silencioso.
- Mostrar **recentes / atalhos** (últimos lançamentos reutilizáveis).
- “Mais opções”: categoria, parcelas, tags, vínculo com plano, competência.
- Toast com **Desfazer** após salvar.
- Optimistic update na lista.
- Três intenções claras: **Saída** · **Entrada** · **Entre contas**.

### Defaults inteligentes

- Última conta usada / último “quem” no dispositivo (`lib/storage`).
- Sugestão de categoria por texto (regras depois; no MVP pode ser recente).

## Mês a mês (`/`) — a aplicação

Um mês por vez. Tudo que era Painel, Mês, Futuro, Plano e Linha do tempo.

**A visão primária é análise; o extrato é secundário.** Lista de lançamentos
responde "o que foi lançado"; ela não responde "o mês vai apertar", que é a
pergunta que faz alguém abrir o app. Por isso o extrato entra recolhido, no fim.

1. **Cabeçalho** — nome do mês com `‹ ›`, atalho `hoje`, e o saldo real de agora
   à direita (com data da âncora). Saldo agora conta **só realizado**; previsto é
   expectativa.
2. **Fita de meses** — todos de relance, para escolher qual abrir. Resultado do
   mês é polaridade, não identidade: barra a partir de uma linha zero e sinal no
   rótulo. Verde e vermelho ficam a ΔE 7 no deuteranopia, então **posição e
   sinal** carregam a informação; cor é reforço.
3. **Herói + por dia** — a decisão do mês. Corrente: folga de caixa (piso à
   frente − colchão) com sobra do mês (renda − compromissos) no rodapé do card.
   Embaixo, ritmo × estimado × cabe — só o variável. Passado: fechou com.
   Futuro: fecha com / folga projetada.
4. **Como o saldo caminha** — gráfico dia a dia + faixa + simulador + colchão
   editável + `abriu → fecha`. Abaixo, **Saldo no fim de cada mês**: fechamento
   acumulado da janela (cheia = cadastrado · pontilhada = se mantiver o ritmo).
   Não confundir com o gráfico diário — são perguntas diferentes.
5. **O que ainda está marcado** — menor saldo à frente, ainda sai/entra,
   atrasados, agenda dos próximos 14 dias.
6. **Como você vem gastando** — renda comprometida, burn-up, estimado à frente,
   contra a média, sparkline dos meses fechados, composição
   (compromisso × fatura × variável × estimado), fatura mês a mês e base do
   forecast.
7. **Para onde foi** — categorias do mês.
8. **Extrato do mês** — recolhido, com a contagem no cabeçalho.

   Métricas que não mudam uma decisão não sobem de seção. Mês passado não tem
   "folga de caixa".

   | métrica | responde |
   |---|---|
   | Folga de caixa | quanto cabe sem furar o piso de caixa, e quanto por dia |
   | Sobra do mês | renda − compromissos — quanto do mês ainda é decisão (sem timing) |
   | Por dia · só o variável | ritmo até hoje × estimado histórico × o que cabe |
   | Folga sob ritmo alto | dias que o excesso sobre o estimado come a folga |
   | Menor saldo à frente | quando e quão fundo o saldo afunda |
   | Dias no vermelho / abaixo do colchão | por quanto tempo aperta |
   | Ainda vai sair · ainda vai entrar | comprometido (previsto/série — sem estimado) |
   | Próximos dias | agenda acionável do horizonte |
   | Estimado à frente | mediana do variável fora do cadastrado (+ /dia) |
   | Renda comprometida | quanto da entrada já tem dono, e de quê |
   | Variável acumulado | o dia em que o mês virou |
   | Divisão da casa | peso pela renda fixa × o que está agendado |
   | Fatura mês a mês | quando o custo fixo desce e quando zera |
   | Sem categoria | a dívida que trava as classificações |
   | Contas atrasadas | previsto que venceu sem confirmação |
   | Maior saída | o que puxou o mês |
   | Composição da saída | compromisso × fatura × variável × estimado |
   | Contra a média | o mês contra os meses fechados |

   Duas perguntas, dois números no herói:

   - **Folga de caixa** = **menor saldo à frente − colchão**. Embute timing
     (salário depois do aluguel). É o número que decide quanto gastar sem furar.
   - **Sobra do mês** = **renda − compromisso − fatura − variável lançado**
     (`income.freeCents`). Contábil, sem timing — a fatia que ainda é decisão.
     Mora no rodapé do card do herói e de novo na barra de renda comprometida.

   Não confundir com `saldo hoje − contas`: o piso já embute tudo que entra e sai
   até lá. Quando a sobra do mês é maior que a folga, o caixa aperta *antes* da
   próxima entrada — o herói mostra a folga; a sobra explica o mês no papel.

   O **ritmo** conta só o gasto discricionário (`core/month-metrics/outflow-kind`).
   A pergunta é "estou gastando rápido demais?", e a resposta não pode incluir
   aluguel: valor decidido uma vez por ano dividido por 30 dias não é hábito.
   Fica fora do ritmo o que é **recorrência**, **categoria essencial** (marcada em
   Ajustes) ou **pagamento de fatura** — este último porque as compras aconteceram
   no mês anterior; contá-las na quitação seria contá-las de novo. Em julho/2026 o
   corte tirou R$ 7.695,26 de dois eventos datados e o ritmo caiu de R$ 407 para
   R$ 133/dia — sem nenhum dia ter mudado de comportamento.

   As três células de "Por dia" só são comparáveis por causa disso: `cabe por dia`
   já nasce depois de descontar as contas, e o `estimado` é mediana do que não
   está cadastrado. Com aluguel no ritmo, o veredito acusava excesso todo mês.

   Se o ritmo passa do estimado, a folga que resta **não** é `folga ÷ ritmo`: a
   folga de caixa (compromissos) e o alerta com estimado são números separados.
   O que come a folga sob ritmo alto é só o surplus (`ritmo − estimado/dia`).

   O ritmo usa `nominalCents`, não o efeito no caixa: compra no cartão pesa no dia
   da compra, que é quando a decisão foi tomada. Como a fatura é quitação, nada
   conta duas vezes.

   O **estimado entra diluído por dia**, um evento por data. Concentrar o mês num
   tranco desenhava um penhasco onde existe ladeira e — pior — punha o fundo do
   poço no dia errado: em agosto/2026 o tranco caía no dia 16, depois do aperto do
   dia 10, então o "menor saldo à frente" ignorava a estimativa e dizia
   R$ 3.724,79 quando a verdade era R$ 729,55 no dia 30. `livre para gastar`
   deriva desse ponto, então o erro chegava inteiro no número que decide o mês.

   O **mês corrente entra na base** do estimado a partir de 14 dias vividos, medido
   por dias vividos e não pelo intervalo entre lançamentos. Excluí-lo por princípio
   fazia o app calcular R$ 131/dia de ritmo com 28 dias de julho na mão e ao mesmo
   tempo anunciar "sem gasto variável estimado" — dois motores medindo a mesma
   coisa e discordando na mesma tela. A régua de "variável" é uma só, em
   `core/transactions/commitment`.

   A **reta do burn-up** tem de ser independente do mês olhado. Como o estimado
   inclui o mês corrente, usá-lo ali compararia julho contra julho: reta e curva
   coincidem e o gráfico anuncia "R$ 0,04 acima". Sem mês independente a régua é o
   caixa (`cabe por dia`), que não vem do histórico.

   O **simulador de ritmo** entra no motor (`usePanel`), não numa cópia da curva:
   uma segunda projeção no componente discordaria do herói e do menor saldo ao lado
   dela. Não persiste — é lente, não orçamento.

   A **faixa** só aparece com base maior que um mês. Com piso = teto = mediana ela
   teria largura zero e sugeriria precisão inexistente.

Estados do evento, por textura e chip, nunca só por cor:

| chip | o que é |
|---|---|
| — | realizado |
| `previsto` | lançamento futuro; `↻` quando vem de série |
| `atrasado` | previsto cujo dia passou e ninguém confirmou |
| `estimado` | média do histórico, não é lançamento de ninguém |

`abertura(mês N+1) === fechamento(mês N)` cai da soma; não existe ritual de
fechamento no meio.

## Lançamento (sheet)

Um formulário para previsto e realizado — são a mesma entidade.

- **Já aconteceu · É previsto.** Data no futuro trava em previsto: não dá para
  ter acontecido amanhã.
- **Repete todo mês** + "até quando" opcional. Isto substituiu a tela de Plano
  inteira: lançamento futuro recorrente **é** o planejamento.
- Editar ou apagar um mês de uma série pergunta **"só este mês"** ou **"deste
  mês em diante"**. O passado nunca é reescrito.
- Previsto ganha **"Isso já aconteceu"** — confirma com valor e data reais, que
  raramente batem com o previsto.

## Cartões

- Hero: limite · usado · disponível.
- Fechamento / vencimento.
- Banner de **gap** se `statement.total ≠ soma compras da competence`.
- Wizard fechar fatura (3 passos): informar total → resolver gap → **vincular pagamento** à fatura.
- Pagamento = transfer corrente → crédito (ou lançamento linkado); **não** conta como despesa nova de consumo.
- Parcelas visíveis como `2/10`.
- Entrada para **importar extrato** da conta (OFX/CSV).

## Importação / conciliação

Ritual de organização (não sync contínuo):

1. Escolher conta + **dono padrão** (default = Eu / pessoa do login; Casa só se escolher) + anexar arquivo.
2. Sistema **lê e mostra** todas as linhas (prévia). Match vira sugestão; nada grava no livro ainda.
3. Revisar a lista (filtro Todas / Atenção). Resumo: vínculos óbvios, novas, possíveis PIX/TED.
4. **Importar automaticamente**: alta confiança → vincula (`matched`); sem match → cria lançamento com o dono escolhido; toast com **Desfazer**. Sugestões médias ficam para revisão.
5. **Nunca adivinhar transferência pelo texto.** O extrato só sabe o sinal (entrou / saiu), então toda saída vira `expense`. Um PIX enviado pode ser gasto (pagou alguém) ou transferência (foi para outra conta sua) — e o arquivo não distingue. Só vira `transfer` quando o usuário aponta a **conta de destino** (`É transferência…` → sheet de destino). Ver `core/transactions/transfer`.
6. Ações em lote: confirmar sugestões restantes, ignorar atenção. **Não** existe conversão em lote para transferência sem destino escolhido.
7. Por linha: confirmar, criar (com categoria + iguais/lembrar), vincular manual, ignorar ou desfazer.
8. Em listas (Hoje/Mês): menu **É transferência…** para reclassificar gasto importado — sempre pedindo a conta de destino.
9. Regras de categoria: fingerprint estável da descrição; “Lembrar” grava; próximos extratos e “aplicar iguais” no lote usam a mesma chave (sem fuzzy).

## Saldo real

- Informar / atualizar saldo por conta (e/ou fechamento do mês).
- Fechamento do mês: valor editável; default = soma dos saldos ou caixa implícito.
- Abertura do mês: derivada da **âncora** (`core/cashflow/balance-at`), que anda
  para frente e para trás. Fechamento declarado só entra como reserva sem âncora.
  **Não existe mais** "estimado pelo líquido do mês anterior": líquido é variação,
  não saldo — só coincidem se a conta começou zerada.
- Âncora visível no Futuro e no painel Caixa do Mês.
- Sem âncora, o Painel e a Linha do tempo mostram empty state pedindo o saldo — é a única coisa que o usuário precisa fazer para tudo funcionar.

## Metas

- Lista clara de objetivos; progresso e ritmo (aporte necessário vs atual).
- Aporte do mês reduz o que sobra no mês.

## Settings (Mais)

- Pessoas (ligar `user_id`, nomes, cores).
- Contas (kind, limites, fechamento/vencimento, dono opcional).
- Categorias.
- Modo de cota: proporção da renda · 50/50 · custom.
- Código da casa / convite.

## Design visual (bonito de verdade)

### Direção

- **Inspiração:** [design system do Supabase](https://supabase.com/design-system) (Studio/docs) — dark-first, verde `#3ECF8E` com contenção, bordas hairline.
- Canvas near-black (`#171717`), superfícies `#1c1c1c` / `#232323`; profundidade por borda `#2e2e2e`, não sombra pesada nem glow.
- Tipografia: **Manrope** (títulos) + **Inter** (UI/corpo) — pares próximos ao Circular do Supabase.
- Verde de marca só em CTA, nav ativa, links e destaques — não em fundos grandes.
- Entradas com verde suave; vermelho só para problema.
- Cards/painéis: superfície de interação ou empty state; evitar cardificar tudo.
- Botões primários em pill; inputs/cards com radius moderado (6–12px).
- Muito respiro; listas densas só em extrato/fatura/conciliação.
- **Evitar:** roxo/indigo glow, cream+serif+terracotta clichê, gradientes decorativos.

### Tokens (obrigatório)

Definir em `src/styles/index.css` via `@theme` / CSS variables:

- `--bg`, `--surface`, `--surface-elevated`
- `--text`, `--text-muted`
- `--accent`, `--accent-fg`
- `--income`, `--expense`, `--danger`, `--warning`
- `--radius-sm|md|lg`
- `--font-sans`, `--font-display`
- espaçamento consistente (4/8/12/16/24/32/48)

### Motion

Pelo menos 2–3 motions intencionais:

1. Sheet de captura entrando
2. Toast / hero number tick suave
3. Troca de mês / escopo com fade curto

Sem parallax exagerado, sem glow neon.

### Estados obrigatórios em toda lista/tela

- Loading (skeleton, não spinner gigante no centro sem contexto)
- Empty (mensagem + CTA)
- Erro (retry)
- Sucesso silencioso (toast só quando a ação não é óbvia)

## Acessibilidade mínima

- Contraste AA em texto principal
- Botões com área ≥ 44px no mobile
- Focus visível
- Labels em inputs (mesmo que visualmente collapsed)

## Anti-padrões (proibido)

- Card sem hierarquia: a tela **é** um dashboard detalhado (pedido explícito),
  mas com hierarquia clara — não 10 cards iguais
- Criar cálculo paralelo a `usePanel` / `core/timeline` para um número novo
- Criar rota sem link de entrada na navegação
- Criar segunda entidade para "planejado" — previsto é `status`, não tabela
- Chamar de "sobra" um número que é fluxo, ao lado de um que é saldo
- Pôr o extrato acima da análise: lista não responde "o mês vai apertar"
- Métrica que não muda decisão nenhuma ocupando espaço na grade
- Formulário de lançamento com 12 campos visíveis
- Modal de confirmação para save comum
- Esconder o `+`
- Usar vermelho em toda despesa
- Contar pagamento de fatura como gasto de consumo
- Fingir privacidade (esconder do parceiro) sem ACL real — não fazer
- Purple-on-white / indigo glow “AI default”
- Cream + serif + terracotta clichê sem decisão consciente
- Inset hero cards arredondados lotados de badges flutuantes

## Checklist de PR de UI

- [ ] Funciona em viewport ~390px e desktop
- [ ] Um herói claro (Casa ou Eu)
- [ ] Escopo respeitado se a tela for sensível a pessoa
- [ ] Loading / empty / erro
- [ ] Safe area considerada no bottom nav
- [ ] Nenhum float formatado na mão fora de `MoneyText` / `formatBRL`
- [ ] Copy em pt-BR
