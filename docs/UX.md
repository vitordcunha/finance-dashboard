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

**Quatro camadas, uma pergunta cada.** A ordem anterior era treze seções seguidas
sem hierarquia — a divisão da casa caía no meio, depois de um gráfico de treze
meses, e ~35 números ficavam abertos ao mesmo tempo. Contexto é obrigatório; ficar
aberto por padrão, não.

1. **Cabeçalho** — nome do mês com `‹ ›`, atalho `hoje`, e o saldo real de agora
   à direita (com data da âncora). Saldo agora conta **só realizado**; previsto é
   expectativa.
2. **Fita de meses** — seletor, não gráfico. Mês + resultado com sinal, uma linha.
   A versão com barra a partir de um eixo zero ocupava 80px acima do herói para
   codificar deltas que, na janela real, são todos parecidos (+7k a +8,9k): muita
   área, nenhuma comparação. O sinal no texto carrega o que a barra carregava, e a
   forma de verdade está na trajetória acumulada da camada 4.
3. **Camada 1 · dá para gastar?** — o herói, **um** número, e o comparativo por dia.
   Corrente: folga de caixa (piso à frente − colchão). Passado: fechou com. Futuro:
   fecha com. A sobra do mês **não** mora aqui: dois números grandes apontando para
   lados opostos (`falta R$ 1.277` em vermelho e `sobra R$ 3.592` logo abaixo) leem
   como app quebrado, mesmo estando os dois certos.
4. **Camada 2 · por quê?** — gráfico dia a dia + faixa, a legenda `abriu → sobrou →
   fecha` em uma linha, o simulador de ritmo e o colchão editável (**da lente
   aberta**).
5. **Camada 3 · o que eu faço?** — fila de categorização, divisão da casa, menor
   saldo com o agendado, ainda sai/entra, atrasados, agenda dos próximos 14 dias.
   Ação, não KPI.
6. **Camada 4 · entender o mês** — **recolhida**. Renda comprometida, burn-up,
   maior saída, contra a média, sparkline dos meses fechados, fatura mês a mês,
   base do forecast, `Para onde foi` e `Saldo no fim de cada mês`.
7. **Extrato do mês** — recolhido, com a contagem no cabeçalho.

   Métricas que não mudam uma decisão não sobem de seção. Mês passado não tem
   "folga de caixa".

   | métrica | responde |
   |---|---|
   | Folga de caixa | quanto cabe sem furar o piso de caixa, e quanto por dia |
   | Por dia · só o variável | ritmo até hoje × estimado histórico × o que cabe |
   | Folga sob ritmo alto | dias que o excesso sobre o estimado come a folga |
   | Menor saldo com o agendado | quando e quão fundo o saldo afunda, só com lançamentos |
   | Ainda vai sair · ainda vai entrar | comprometido (previsto/série — sem estimado) |
   | Próximos dias | agenda acionável do horizonte |
   | Renda comprometida | quanto da entrada já tem dono, e de quê (+ a sobra do mês) |
   | Variável acumulado | o dia em que o mês virou |
   | Divisão da casa | cota pela política × ônus real × a parcela que fecha a conta |
   | Fatura mês a mês | quando o custo fixo desce e quando zera |
   | Sem categoria | a dívida que trava as classificações |
   | Contas atrasadas | previsto que venceu sem confirmação |
   | Maior saída | o que puxou o mês |
   | Contra a média | o mês contra os meses fechados |
   | Saldo no fim de cada mês | o pior mês à frente, e onde a janela chega |

   Duas perguntas contábeis diferentes, **um** número no herói:

   - **Folga de caixa** = **menor saldo à frente − colchão**. Embute timing
     (salário depois do aluguel). É o número que decide quanto gastar sem furar, e é
     o único que fica no herói.
   - **Sobra do mês** = **renda − compromisso − fatura − variável lançado**
     (`income.freeCents`). Contábil, sem timing. Mora **só** na barra de renda
     comprometida, onde as outras fatias ao lado explicam o que ela significa. No
     rodapé do herói ela competia com a folga e o card parecia se contradizer.

   Não confundir com `saldo hoje − contas`: o piso já embute tudo que entra e sai
   até lá. Quando a sobra do mês é maior que a folga, o caixa aperta *antes* da
   próxima entrada.

   **Um número, um rótulo.** `Menor saldo à frente` era o nome do tile (curva de
   lançamentos) **e** da linha do simulador (que aplica o ritmo estimado), com
   valores diferentes na mesma tela — R$ 223 no dia 28 e R$ 114,46 no dia 30. Dois
   valores sob o mesmo nome fazem o usuário concluir que o app não sabe a resposta.
   Hoje são `menor saldo com o agendado` e `neste ritmo, o menor saldo à frente`.

   **Não repetir um número em corpo grande.** A sobra do mês aparecia três vezes
   (rodapé do herói, fita, régua do `abriu → fecha`) e o estimado **nove**. O
   estimado é *alerta*: repeti-lo mais que qualquer número real inverte a hierarquia.
   Saíram "Composição da saída" (mesmas fatias da barra de renda, outro denominador),
   o tile "Estimado à frente" e "Dias abaixo do colchão" — a contagem assusta (17 num
   mês que fecha positivo) e a faixa vermelha do gráfico mostra o mesmo melhor.

   O **ritmo** conta só o gasto discricionário (`core/month-metrics/outflow-kind`).
   A pergunta é "estou gastando rápido demais?", e a resposta não pode incluir
   aluguel: valor decidido uma vez por ano dividido por 30 dias não é hábito.
   Fica fora do ritmo o que é **recorrência**, **parcelamento**, **categoria
   essencial** (marcada em Ajustes), **pagamento de fatura** ou **repasse interno**.
   A fatura porque as compras aconteceram no mês anterior; contá-las na quitação
   seria contá-las de novo. Em julho/2026 o corte tirou R$ 7.695,26 de dois eventos
   datados e o ritmo caiu de R$ 407 para R$ 133/dia — sem nenhum dia ter mudado de
   comportamento.

   **Parcela é compromisso.** `Dívida · parcela 1 de 2` e `Rateio casa · parcela 2`
   não têm série (cada mês é uma linha com valor próprio) nem categoria essencial,
   então caíam em "variável" por eliminação: agosto/2026 mostrava R$ 1.566,25 de
   gasto discricionário que era dívida parcelada e rateio. O valor de uma parcela foi
   decidido no dia da compra; nenhum dia deste mês decidiu nada sobre ela.

   **Repasse interno não é gasto nem renda.** O rateio é um par espelhado (sai da
   conta de um, entra na do outro) e o modelo não liga os dois lados — a linha do
   tempo nunca credita o *destino* de uma transferência. A detecção é por assinatura
   (data + valor + descrição normalizada, contas diferentes) e vive **em um lugar**,
   `buildTimelineEvents`, marcando `internal` no evento. Quando cada consumidor
   redescobria o par, `householdSplit` conhecia o repasse e `metrics` não: a casa
   "recebia" R$ 16.666 em agosto/2026 tendo recebido R$ 14.400, e todos os
   percentuais da barra de renda saíam de um denominador inflado.

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

   **O estimado se aplica por mês, não pela janela.** A defesa contra dobrar com o
   plano — categoria já cadastrada não é prevista de novo pelo histórico — é decidida
   no mês-alvo (`applicableForecast`), não na amostragem. Quando era na amostragem, um
   `Supermercado` cadastrado a partir de agosto apagava a mediana de Mercado do
   estimado de **julho**: o painel anunciava R$ 54,27/dia de estimado contra
   R$ 119,59/dia de ritmo medido, e em cima disso o veredito "mês mais caro que o
   habitual". Os dois números tinham deixado de falar do mesmo conjunto.

   A **reta do burn-up** tem de ser independente do mês olhado. Como o estimado
   inclui o mês corrente, usá-lo ali compararia julho contra julho: reta e curva
   coincidem e o gráfico anuncia "R$ 0,04 acima". Sem mês independente a régua é o
   caixa (`cabe por dia`), que não vem do histórico.

   **A mesma proteção vale para o veredito por dia.** `ritmo × estimado` só compara
   quando existe mês independente na amostra; sem isso a tela diz por que não compara.
   A proteção existia num lugar e faltava no outro, e o resultado era um veredito
   sobre o próprio mês que definiu o habitual.

   **A trajetória acumula o estimado.** `TimelineMonth.closingWithEstimateCents`
   reinicia do caixa real todo mês, e com razão — o alerta do mês aberto não deve
   herdar o chute do anterior. Mas numa janela de treze meses isso descontava **um**
   mês de variável de treze meses de sobra, e o card prometia R$ 105.332 em jul/2027:
   o número mais destacado do painel era o menos defensável. A trajetória soma o
   estimado de cada mês projetado ao dos anteriores, e o headline virou o **pior mês à
   frente** — saldo terminal de doze meses não decide nada.

   O **simulador de ritmo** entra no motor (`usePanel`), não numa cópia da curva:
   uma segunda projeção no componente discordaria do herói e do menor saldo ao lado
   dela. Não persiste — é lente, não orçamento.

   A **faixa** só aparece com base maior que um mês. Com piso = teto = mediana ela
   teria largura zero e sugeriria precisão inexistente.

   O **teto do gráfico dia a dia é robusto** (percentil 85 dos saldos), e a ponta que
   passar é cortada e anotada. Com o teto no dado máximo, o pico do salário mandava na
   escala: julho passa o mês entre R$ 0 e R$ 3 mil e recebe R$ 11.900 no dia 31, então
   os trinta dias em que a decisão acontece ficavam nos 15% de baixo — uma reta rente à
   base — e o único traço visível era o penhasco do último dia. O valor exato da ponta
   está no toque e na legenda.

   O **colchão é por lente**. Um valor único aplicado a Casa, Eu e Greicy deixava a
   lente dela em alerta permanente: R$ 1.500 dimensionado para uma casa de R$ 14,4k
   cobria o gráfico inteiro de uma conta que gira R$ 2,4k, e o herói dizia "falta
   R$ 1.410 para o colchão" sobre um saldo de R$ 90, todo dia. Lente de pessoa sem
   valor próprio fica **sem colchão**: alarme errado é pior que alarme ausente.

   **`Para onde foi` mede `nominalCents`**, sem fatura, sem estimado e sem repasse. Com
   o efeito em caixa, compra no cartão vale zero e desaparece: o mês inteiro de compras
   sumia e no lugar aparecia `Cartão de credito R$ 3.400` — 29% de julho num balde que
   não diz o que foi comprado. A base do aviso de categorização é **a mesma**; quando
   divergiam, a tela dizia 15% num lugar e 19% no outro sobre o mesmo mês.

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
- **Divisão da casa** — duas decisões, juntas: quais categorias são **conta da casa**
  (o pote) e **como ela se divide** (proporcional à renda recorrente · 50/50 ·
  personalizado).
- Código da casa / convite.

### Divisão da casa

**O pote é declarado, não inferido.** O painel deduzia a conta da casa como
"recorrente ou categoria essencial", que captura o que é *recorrente*, não o que é
*compartilhado*: em agosto/2026 entravam no pote o pagamento do drone da mãe dele
(R$ 500), o transporte dele (R$ 200) e 100% da fatura do cartão dele (R$ 2.000), e
ficava fora todo o compartilhado variável. O card então acusava "Greicy: falta
R$ 442,54" sobre um rateio que estava exatamente na regra combinada — os R$ 442,54
eram 34% de R$ 1.300 de itens que não são da casa. Seguir o conselho do card faria ela
pagar 34% do transporte dele.

`transactions.person_id` seria o campo natural (`null` = casa) e `core/contribution`
foi construído em cima disso, mas no banco ele está preenchido com o **dono da conta**
(`Aluguel → Eu`, `Luz → Eu`): ligar essa lógica hoje daria um pote de R$ 140. A
marcação é por **categoria** (`household_shared_categories` em `settings`), que resolve
aluguel, luz, internet, gás e mercado de uma vez e cai no fluxo de categorizar que já
existe. Exceção se resolve movendo o lançamento de categoria.

**Pagamento de fatura nunca entra no pote.** As compras dentro dela já contaram, cada
uma na própria categoria e no próprio dia. Ratear a quitação cobraria de um lado um
pedaço das compras pessoais do outro, e contaria as compras da casa duas vezes.

**Uma política, um motor.** Havia dois: `core/month-metrics/household-split`
(proporcional à renda, fixo) e `core/contribution` (três modos, arredondamento sem
perder centavo) — que Ajustes editava e **nenhuma tela lia**. Escolher 50/50 não mudava
nada em lugar nenhum. Hoje a política vem de `computeShareBps`/`computeQuotas`, e as
cotas somam o pote exatamente.

**O card diz o número.** Antes ele dizia "ajuste as parcelas para voltar à proporção" e
não dizia para quanto: a base do rateio vivia numa planilha fora do app, e quando o
supermercado previsto subiu de R$ 500 para R$ 1.100 a parcela ficou R$ 204/mês
desatualizada sem ninguém perceber. Hoje `suggestedTransferCents` é derivado —
`cota − o que a pessoa já paga direto`, zero para quem paga as contas (essa pessoa
**recebe**) — e o card mostra a diferença contra o que está agendado. Escrever a linha
continua sendo decisão de quem edita.

O peso é a **renda recorrente do mês olhado**, e o card diz isso: em julho/2026 só a
primeira quinzena dela está agendada (79,8/20,2) e a partir de agosto, com as três
recorrências ativas, é 66/34. Renda eventual fica fora de propósito — como base, faria
a divisão oscilar todo mês.

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
- **Dois números grandes no mesmo card apontando para lados opostos** — cada um pode
  estar certo e o conjunto lê como app quebrado
- **O mesmo rótulo em dois números diferentes** na mesma tela
- **Repetir o mesmo valor em corpo grande** em mais de um lugar; e nunca repetir um
  *alerta* (o estimado) mais que os números reais
- **Deixar o pico governar a escala** de um gráfico cujo interesse está na faixa baixa
- **Alarme que nunca apaga** — colchão global numa conta pessoal, contagem assustadora
  sem ação possível
- **Comparar um mês com uma média que inclui esse mês** e chamar de anomalia
- **Inferir uma regra que o usuário deveria declarar** (o que é conta da casa) e depois
  acusar alguém com base nela
- Configuração que nenhuma tela lê
- Criar cálculo paralelo a `usePanel` / `core/timeline` para um número novo
- Redescobrir em cada consumidor uma heurística que devia viver na construção da
  timeline (o par espelhado do rateio)
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
