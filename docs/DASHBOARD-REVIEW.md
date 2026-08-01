# Revisão do painel — hierarquia, informação e rateio

Revisão feita em 28/07/2026 sobre os dados reais (julho e agosto/2026, lente Casa e
lente Greicy). Cada afirmação abaixo foi conferida na tela **e** no código ou no
banco.

> **Status: corrigido.** Tudo o que este documento aponta foi implementado na mesma
> sessão. O texto ficou como está — descrevendo o defeito no presente — porque é o
> registro de *por que* o código é como é hoje; os comentários no código apontam para
> os mesmos casos. O que mudou está no fim, em **§7 O que foi feito**.

Referência normativa: `docs/UX.md`. Dois princípios de lá estão violados hoje na
home da casa: **"um herói por tela"** e **"Casa calma · Eu denso — home da casa sem
grade de KPIs"**. Hoje a home tem 13 seções, 6 gráficos, ~35 números e **duas**
grades de KPI.

---

## 1. Informação errada ou enganosa

### 1.1 Dois "menor saldo à frente" com valores diferentes, na mesma tela

Julho, lente Casa:

| Onde | Valor | Dia |
|---|---|---|
| Herói | `abaixo do colchão no dia 28` | 28 |
| Tile "Menor saldo à frente" | R$ 223,00 | 28 |
| Simulador "Menor saldo à frente" | R$ 114,46 | 30 |

Mesmo rótulo, bases diferentes: o tile lê `metrics.lowestAhead`, que é a curva **só
de lançamentos**; o simulador lê `lowestAheadAtRate`, que aplica o estimado como
delta diário. Os dois estão certos e o rótulo é o mesmo — é o pior tipo de erro,
porque quem lê conclui que o app não sabe a resposta.

### 1.2 A legenda de "Sobra do mês" mente

`HeroSpendable` → `MonthSurplusRow`: *"Renda − compromissos — sem olhar o timing"*.

O número é `income.freeCents = renda − compromisso − fatura − variável lançado`.
Agosto: `16.666,25 − 6.960 − 2.800 − 1.566,25 = 5.340`. Não é renda menos
compromissos; é renda menos tudo que já saiu ou está marcado. A legenda foi escrita
para a definição antiga.

### 1.3 A renda da casa está inflada pelo rateio

Agosto diz *"de R$ 16.666,25 que entram"*. A casa recebe **R$ 14.400** (9.500 +
2.400 + 1.500 + 1.000). Os R$ 2.266,25 restantes são o rateio dela atravessando a
conta dele — dinheiro que já estava dentro de casa.

Consequência: todos os percentuais da barra "Renda comprometida" usam denominador
inflado (59% comprometido deveria ser ~68%; "Sobra 32%" deveria ser ~37% de uma base
menor). `householdSplit` **já sabe** detectar o par espelhado (`internalSignature`);
`metrics.ts` não sabe. A mesma tela usa duas definições de "entrada".

### 1.4 Rateio e parcelamento entram em "Variável"

Agosto, "Variável R$ 1.566,25" = Rateio parcela 2 (1.266,25) + Dívida parcela 2 de 2
(300). Nenhum dos dois é discricionário.

A causa é um buraco em `isCommitment`: a régua é `seriesId` **ou** categoria
essencial. Um parcelamento avulso não tem série nem categoria, então cai em
"variável" por eliminação. Hoje o dano é só de rótulo porque são `planned` e o
forecast só usa `actual` — **quando esses lançamentos forem confirmados, eles entram
no ritmo de gasto e no estimado**, e o ritmo volta a inflar exatamente como inflava
com o aluguel.

### 1.5 O estimado é cego para Mercado — e o veredito é circular

`plannedCategoriesIn(occurrences)` varre a **janela inteira** (19 meses), não o mês
em questão. O `Supermercado R$ 1.100` planejado a partir de agosto elimina o
histórico da categoria Mercado do estimado **de julho**. Julho gastou R$ 1.687,03 em
Mercado; a estimativa considera R$ 0.

Resultado em cadeia:

- estimado = R$ 1.682,50/mês (~54,27/dia), composto só de `Sem categoria` +
  `Lazer` + `Delivery`;
- ritmo real = R$ 119,59/dia (R$ 3.348,50 em 28 dias), que **inclui** Mercado;
- o painel compara os dois e conclui: *"Ritmo acima do estimado histórico. Mês mais
  caro que o habitual."*

Duas coisas erradas de uma vez. Primeiro, as duas células não medem o mesmo conjunto
— o docstring de `PaceCompare` afirma que medem. Segundo, o estimado de julho é
apurado **em julho** (`partialMonthUsed = 2026-07`): o app compara julho com julho e
chama de anomalia. O burn-up já se defende disso (`burnupBudget` exige um mês
independente) e é por isso que o gráfico "Variável acumulado" **não aparece na tela
hoje** — a proteção existe num lugar e falta no outro.

### 1.6 A trajetória de 13 meses promete R$ 105 mil

`balance.ts:106` — `runningWithEstimate = running` no início de cada mês. A corrente
de alerta reseta todo mês, então a projeção de 13 meses acumula 13 meses de sobra
com **um** mês de gasto variável descontado. O rodapé do card admite isso entre
parênteses ("o chute não acumula de um mês no outro").

O número mais destacado do painel — `jul 2027 R$ 105.332,25 +97k`, no headline do
card — é o menos confiável de todos. Somando o estimado corretamente daria ~85k, e
como o estimado subestima o variável real em mais de 2× (1.682 estimado × 3.698
lançado em julho), o valor honesto está mais perto de 60k. A ordem de grandeza do
erro é maior que o patrimônio atual.

### 1.7 "Para onde foi" esconde as compras dentro da fatura

`CategoryBars` filtra `deltaCents < 0`, ou seja **efeito em caixa**. Compra no
cartão tem `deltaCents = 0` e desaparece; o que aparece é o pagamento da fatura,
rotulado com a categoria `Cartão de credito`. Em julho isso põe R$ 3.400 — 29% do
mês — num balde que não diz nada sobre o que foi comprado.

Pelo mesmo mecanismo, transferências internas entram como gasto: agosto tem
`Sem categoria R$ 3.366,25` como segunda maior "destinação", composta de rateio
(2.266,25) + dívida (300) + fatura do cartão dela (800).

### 1.8 Três valores para "sem categoria" na mesma tela

Julho:

| Fonte | Valor | % |
|---|---|---|
| Aviso de categorização | R$ 1.240,82 | 15% |
| "Para onde foi" | R$ 1.590,82 | 13% |
| Nota do estimado | R$ 1.373,77 | — |

As diferenças têm explicação (o aviso só conta `actual`; o gráfico conta `planned`
também; a nota é mediana histórica). Nenhuma dessas explicações está na tela.

### 1.9 O colchão é global e a lente Greicy fica em alerta permanente

`useMinimumBalance` é um valor único aplicado a Casa, Eu e Greicy. Na lente dela o
mínimo de R$ 1.500 cobre o gráfico inteiro e o herói anuncia *"Falta para o colchão
R$ 1.410,00"* sobre um saldo de R$ 90 — verdadeiro, inútil e permanente. Um colchão
de R$ 1.500 dimensionado para uma casa de R$ 14,4k não descreve uma conta pessoal
que gira R$ 2,4k.

### 1.10 O pote do rateio muda com descuido de cadastro

`householdSplit` considera compromisso o que tem série **ou** categoria essencial.
`Cartão de credito` está marcada `essential = true`. Então:

- `Pagamento fatura · Cartão principal` de agosto (2.000) tem categoria → **entra no
  pote**;
- `Pagamento fatura · Cartão Greicy` (800) não tem categoria → **fica fora**;
- `Pagamento fatura · Cartão principal` de outubro (1.289,03) também perdeu a
  categoria → o pote de outubro encolhe R$ 1.289 sem nada ter mudado na vida real.

O valor a dividir depende de alguém ter lembrado de marcar uma categoria.

---

## 2. Informação repetida

| Número | Onde aparece |
|---|---|
| Sobra do mês (5.340) | rodapé do herói · fita "SOBROU" do MonthDashboard · fatia "Sobra" da barra de renda |
| As 3 fatias de saída | "Renda comprometida" **e** "Composição da saída" — mesmas fatias, mesmos valores absolutos, denominadores diferentes (42/17/9 × 54/22/12) |
| Menor saldo à frente | herói · tile · simulador (com **dois** valores, §1.1) |
| Fechamento do mês | MonthDashboard · ponto do TrajectoryChart · delta da MonthStrip |
| Piso do mês | herói · marcador do gráfico · tile · simulador |
| **Estimado** | tile "Estimado à frente" · "Estimado à parte" na barra de renda · fatia da Composição · fatia de "Para onde foi" · PaceCompare · simulador · ForecastNotice · linha pontilhada do gráfico · "fecha perto de" do MonthDashboard — **9 lugares** |

O último item é o mais grave em termos de intenção: o estimado acabou de ser
rebaixado a *alerta*, e hoje é o número mais repetido da tela. A hierarquia diz o
contrário do que foi decidido.

---

## 3. Hierarquia visual

**O herói tem dois números grandes que apontam para lados opostos.** Julho:
`FALTA PARA O COLCHÃO R$ 1.277,00` em vermelho, 3xl, e logo abaixo
`SOBRA DO MÊS R$ 3.592,46` em lg. As duas leituras são corretas e contábeis, e
juntas produzem a impressão de app quebrado. Um herói, um número.

**A fita de 14 meses ocupa o topo, antes do herói.** Ela codifica *delta*, e como os
deltas são todos parecidos (+7k a +8,9k), as barras têm quase a mesma altura: muita
área, pouca informação, na posição mais valiosa da tela.

**A escala do gráfico dia a dia é governada pelo pico do salário.** Julho: eixo até
11,8k por causa do dia 31; a zona onde a decisão acontece (0 a 1,5k) fica nos 15%
inferiores do plot. Os rótulos colidem de verdade — na tela lê-se
`menor 2·hoje dia 28` e o texto `mínimo 1,5k` cai sobre a curva.

**O TrajectoryChart não é legível.** Eixo 0–107k, os rótulos do eixo x sobrepostos
(`jun/2jul/26`), e as duas séries (cadastrado × com ritmo) praticamente coincidem
nessa escala — a legenda descreve uma distinção que o olho não encontra.

**A ordem não segue nenhuma pergunta.** Hoje: fita → herói → ritmo → curva →
simulador → colchão → abriu/fecha → trajetória 13 meses → categorização →
divisão da casa → 6 tiles → próximos dias → renda → 2 tiles → composição → fatura
mês a mês → nota do estimado → categorias → extrato.

A divisão da casa — a única seção que fala de duas pessoas, e o assunto que motivou
esta revisão — está no meio, depois de um gráfico de 13 meses.

### Proposta: quatro camadas, uma pergunta cada

**Camada 1 — "dá para gastar?"** (acima da dobra, um herói)
Folga de caixa, o dia do piso, o "cabe por dia". Três linhas. A sobra do mês sai
daqui (ou vira uma linha de texto, sem tamanho de herói).

**Camada 2 — "por quê?"**
A curva dia a dia com a escala focada na faixa de decisão (o pico do salário pode
ser cortado com quebra de eixo ou marcador), o estimado como linha recessiva, e o
simulador logo abaixo. `MonthDashboard` desaparece: "abriu com / fecha com" são as
duas pontas da própria curva.

**Camada 3 — "o que eu faço hoje?"**
Fila de categorização · rateio · contas atrasadas · próximos dias. Ações, não KPIs.
É aqui que a divisão da casa sobe.

**Camada 4 — "entender o mês"** (colapsada por padrão)
Composição da saída, categorias, comparação com a média, fatura mês a mês,
trajetória. Uma seção expansível resolve a tensão entre "Casa calma" e a vontade
legítima de ter os gráficos.

Candidatos a remoção direta (não a mudança de lugar):

- "Composição da saída" — absorvida por "Renda comprometida" (mesmas fatias);
- tile "Estimado à frente" — o número já está em 8 outros lugares;
- tile "Dias abaixo do colchão" — o gráfico mostra isso melhor e a contagem assusta
  sem sugerir ação;
- fatia "Estimado" em "Para onde foi" — mistura chute com lançamento no mesmo
  ranking;
- fita de 14 meses no topo — vira seletor compacto ou desce para a camada 4.

Redução estimada: de ~35 números visíveis para ~12 acima da dobra + o resto sob
demanda.

---

## 4. Rateio e divisão de contas

Esta é a parte com mais erro de cálculo, e não de forma.

### 4.1 O estado atual, verificado no banco

A régua que gerou as parcelas em banco é: **34,0278% × (4.660 + fatura dele)**, onde
4.660 = aluguel 3.600 + supermercado 500 + luz 300 + internet 140 + gás 120.
Conferido mês a mês:

| mês | fatura dele | base | cota dela | parcela 1 | parcela 2 em banco |
|---|---|---|---|---|---|
| ago/26 | 2.000,00 | 6.660,00 | 2.266,25 | 1.000 | **1.266,25** ✓ |
| set/26 | 1.449,00 | 6.109,00 | 2.078,75 | 1.000 | **1.078,75** ✓ |
| out/26 | 1.289,03 | 5.949,03 | 2.024,33 | 1.000 | **1.024,33** ✓ |
| nov/26 | 1.137,03 | 5.797,03 | 1.972,60 | 1.000 | **972,60** ✓ |
| dez/26 · jan/27 | 842,66 | 5.502,66 | 1.872,43 | 1.000 | **872,43** ✓ |
| fev–abr/27 | 459,29 | 5.119,29 | 1.741,97 | 1.000 | **741,97** ✓ |
| mai/27 → | 0 | 4.660,00 | 1.585,69 | 1.000 | **585,69** ✓ recorrente |

Os pesos 9.500 : 4.900 = 65,97% / 34,03% também já estão certos na tela de agosto,
porque em agosto todas as recorrências dela existem (2.400 + 1.500 + 1.000).

### 4.2 O card acusa uma dívida que não existe

Agosto, "Divisão da casa": pote R$ 7.960,00 → *"Greicy: falta R$ 442,54 abaixo do
que a proporção pede"*, com o aviso *"Ajuste as parcelas para voltar à proporção"*.

A diferença é inteiramente de definição de pote:

```
pote inferido pelo app     7.960,00
pote da regra acordada     6.660,00
diferença                  1.300,00  = drone da mãe 500
                                     + Transporte dele 200
                                     + Supermercado 1.100 vs 500 na base
34,0278% × 1.300,00 = 442,36 ≈ os 442,54 cobrados
```

Seguir o conselho do card faria ela pagar 34% do transporte dele e 34% do pagamento
do drone da mãe dele. O card está confiante e errado.

### 4.3 A causa raiz: nada no modelo diz "esta despesa é da casa"

`householdSplit` infere o pote como *"tem série **ou** categoria essencial"*. Isso
captura o que é **recorrente**, não o que é **compartilhado** — pega o drone da mãe,
o transporte dele e a fatura dele, e perde todo o compartilhado variável (mercado
além dos 1.100 planejados, farmácia, PIX de casa).

O campo que serviria existe e está ocupado com outro significado:
`transactions.person_id`. `core/contribution` foi construído em cima de
`person_id === null` = Casa (`sumCasaExpenses`). Mas no banco hoje `person_id` está
preenchido com o **dono da conta**: `Aluguel → pessoa=Eu`, `Luz → pessoa=Eu`,
`Supermercado → pessoa=Eu`. A única linha com `null` é a `Internet`. Ou seja, se
alguém ligasse a lógica de "Casa" hoje, o pote seria R$ 140.

Duas saídas:

- **(a) redefinir `person_id`** como "de quem é a despesa" e migrar tudo. Semântica
  mais limpa, migração grande, e perde a informação de quem pagou (que hoje vem do
  dono da conta — então talvez não perca nada).
- **(b) marcação explícita de "casa"**: flag na categoria (`shared`) + override por
  lançamento. Encaixa no fluxo de categorizar em lote que já existe, não mexe em
  `person_id`, e resolve o pote e o "Para onde foi" ao mesmo tempo.

Recomendo **(b)**. Uma categoria marcada como compartilhada resolve aluguel, luz,
internet, gás e mercado de uma vez, e o override cobre o caso do drone.

### 4.4 A base do rateio envelhece em silêncio — e é isso que o usuário pediu

A base 4.660 usa `supermercado 500`. O lançamento planejado hoje é **1.100**. A base
está R$ 600/mês desatualizada, o que significa R$ 204,17/mês a menos de contribuição
dela — e nem o usuário nem o card percebem, porque:

- a base não existe em lugar nenhum do app (vive no cálculo que fizemos fora dele);
- o card compara contra um pote **diferente** dessa base, então o alerta que ele dá
  (442,54) não é o desvio real (204,17) e aponta para o lado errado da conta.

O app precisa **derivar** a parcela, não conferir. Com o pote declarado (§4.3), a
conta inteira sai do próprio dado:

```
cota dela  = peso(renda recorrente dela ÷ renda recorrente total) × pote do mês
parcela 2  = cota dela − o que já sai da conta dela para itens do pote
```

E aí o card pode oferecer *"ajustar parcela de agosto para R$ X"* como botão, em vez
de dizer "ajuste as parcelas" e não ajustar nada.

### 4.5 Ratear o pagamento da fatura é ratear as compras erradas

Hoje 100% da fatura dele entra no pote — ela paga 34% das compras pessoais dele. O
correto é ratear **as compras que estão dentro da fatura**, que já têm data,
categoria e `nominalCents`; o pagamento é só liquidação. Isso resolve o rateio e o
§1.7 com a mesma mudança: o pote passa a olhar compras, não trilho de pagamento.

### 4.6 Dois motores de rateio, e o dos Ajustes é decorativo

| | `core/contribution` | `core/month-metrics/household-split` |
|---|---|---|
| Política | `income_share` / `equal_50` / `custom` (bps) | proporcional à renda, fixo |
| Base "Casa" | `person_id === null` | série ou categoria essencial |
| Arredondamento | largest remainder, sem perder centavo | `Math.round` por pessoa |
| Consumido por | nada no painel | `HouseholdSplitCard` |

`Ajustes → Cota da casa` está **vivo**: três modos, campo de porcentagem
personalizada, grava em `household_settings`, e diz *"visível no painel Eu"*. O
painel Eu não existe mais e o dashboard ignora o modo. **Escolher 50/50 nos Ajustes
não muda nada em nenhuma tela.** Uma configuração que não configura nada é pior que
configuração ausente.

Recomendação: manter a **política** em `core/contribution` (é onde vivem os modos e o
arredondamento correto) e fazer `householdSplit` consumi-la, passando o pote apurado
da timeline. Um motor, uma política, um lugar para mudar.

### 4.7 O rateio tem de sair de "variável" e de "renda que entra"

Sem corrigir §1.3 e §1.4, a divisão da casa vai discordar do resto da tela: a mesma
transferência interna aparece como renda dele, como gasto variável dela, e como
contribuição no card. Três leituras do mesmo dinheiro.

O modelo tem uma lacuna estrutural aqui: a timeline nunca credita o **destino** de
uma transferência, e é por isso que o rateio é cadastrado como par entrada/saída e a
detecção é heurística (`internalSignature` comparando data + valor + `merchantKey`).
Enquanto isso não mudar, a heurística é o que há — mas ela deveria ser aplicada em
**um** lugar (a construção da timeline), não redescoberta em cada consumidor.

---

## 5. Limpeza que aparece de graça

- `src/core/assistant/*` — nenhum consumidor fora do módulo.
- `src/core/capture/*` — nenhum consumidor fora do módulo.
- `src/core/contribution/*` — usado só por `assistant` (morto) e pela seção de
  Ajustes que não afeta nada. Vira o motor de política (§4.6) ou sai.
- `BurnupChart` — não renderiza no mês corrente porque `burnupBudget` exige um mês
  independente e só existe julho na amostra. Aparece quando junho for importado.
- `plan_items` / `plan_overrides` no banco — sem leitor no código; snapshot em
  `supabase/rollback-2026-07-27-plan-items.json`.

---

## 6. Ordem sugerida

Correções de verdade primeiro — hierarquia bonita sobre número errado não ajuda.

1. **Números que se contradizem** (§1.1, §1.2, §1.3, §1.8) — rótulos e bases. Barato.
2. **Buracos de classificação** (§1.4 parcelamento, §1.5 `plannedCategoriesIn` por
   mês, §1.6 corrente do estimado na trajetória). Isso destrava o ritmo, o estimado,
   o burn-up e a trajetória de uma vez.
3. **Pote declarado + motor único de rateio** (§4.3, §4.4, §4.6, §4.7) — é o pedido
   central e depende do item 2 para não herdar a classificação errada.
4. **Reorganização em camadas** (§3) e remoção dos repetidos (§2).
5. **Colchão por lente** (§1.9) e fatura rateada por compra (§4.5, §1.7).

---

## 7. O que foi feito

### Régua de classificação

`isCommitment` reconhece **parcelamento** (`isInstallment`, `/\bparcela\s*\d+/i`):
`Dívida · parcela 1 de 2` e `Rateio casa · parcela 2` saíram de "variável".

`TimelineEvent` ganhou **`internal`**, marcado numa passada única em
`buildTimelineEvents` (`markInternalTransfers`): entrada e saída de mesma data, mesmo
valor e mesmo `merchantKey` em **contas diferentes**. A heurística que `householdSplit`
redescobria sozinho passou a viver onde a linha do tempo é construída, e
`outflowKind` ganhou o caso `'internal'`.

Efeito em agosto/2026: renda da casa **R$ 16.666,25 → R$ 14.400,00**; a fatia
`Variável R$ 1.566,25` desapareceu (era rateio + dívida); `Ainda vai entrar` deixou de
anunciar o rateio como próxima receita.

### Estimado por mês, e trajetória que acumula

`forecastVariable` amostra o histórico **puro**; a defesa contra dobrar com o plano
virou `applicableForecast(forecast, plannedCategoriesDoMês)`, aplicada por mês-alvo.
`buildTimelineEvents` aceita `forecastMonthlyByYm`.

Julho deixou de ter o histórico de Mercado apagado pelo `Supermercado` de agosto: o
estimado foi de **R$ 1.682,50 → R$ 3.707,27/mês** (~R$ 119,59/dia, contra R$ 119,59/dia
de ritmo medido — os dois números agora medem o mesmo conjunto).

`PaceCompare` só compara ritmo com estimado quando existe **mês independente na
amostra**; sem isso diz por que não compara, e a régua passa a ser o caixa. O veredito
"mês mais caro que o habitual" sobre o próprio mês da amostra não acontece mais.

`trajectory` acumula `estimatedOutCents` ao longo dos meses projetados: a promessa de
**R$ 105.332 → R$ 86.466**, e o headline do card virou o **pior mês à frente** em vez
do saldo terminal de treze meses.

### Coerência de números

`metrics` desconta o repasse da renda e o mantém fora de todos os baldes de saída
(`internalOutCents`); `compareToAverage` e a sparkline usam `householdOutCents`.

`CategoryBars` passou a medir **`nominalCents`** sem fatura, sem estimado e sem
repasse: as compras do cartão aparecem na própria categoria (Transporte R$ 141,80
surgiu) e o balde `Cartão de credito R$ 3.400` sumiu. A base do aviso de categorização
é a mesma da barra — os R$ 1.240,82 / 15% × R$ 1.590,82 / 19% viraram um só número.

Rótulos: `Sobra do mês` diz a fórmula certa; o simulador diz "**neste ritmo**, o menor
saldo à frente"; o tile diz "menor saldo **com o agendado**".

### Rateio

Pote **declarado**: `household_shared_categories` em `settings` (sem DDL), editável em
Ajustes → Divisão da casa. Marcado nesta sessão: **Moradia, Mercado, Cachorros**.

`householdSplit` reescrito sobre esse pote e sobre `computeShareBps` +
`computeQuotas` de `core/contribution` — o modo escolhido em Ajustes governa a conta,
e o rateio de centavos usa *largest remainder* (as cotas somam o pote exatamente).
Fatura nunca entra. Novos campos: `paidDirectCents`, `transferredCents`,
`receivedCents`, `burdenCents`, `driftCents`, **`suggestedTransferCents`**.

Agosto/2026, antes e depois:

| | antes | depois |
|---|---|---|
| pote | R$ 7.960,00 (com drone, transporte e 100% da fatura dele) | **R$ 5.260,00** |
| veredito | "Greicy: **falta** R$ 442,54" | "Greicy: **paga R$ 476,27 acima** da cota" |
| parcela | "ajuste as parcelas" (sem dizer para quanto) | **R$ 1.789,98** (agendado R$ 2.266,25) |

O sinal inverteu porque as parcelas em banco embutem 34% da fatura dele — que a regra
acordada nunca deveria ter cobrado dela.

### Hierarquia

Quatro camadas com uma pergunta cada; **Entender o mês** colapsada (renda,
categorias, fatura, trajetória). Herói com **um** número. Fita de meses virou seletor
compacto. `MonthDashboard` virou uma linha de legenda embaixo da curva. Saíram
"Composição da saída" (duplicata da barra de renda), o tile "Estimado à frente" (9ª
aparição do mesmo número) e "Dias abaixo do colchão".

Gráfico dia a dia: teto **robusto** (percentil 85) com a ponta do salário cortada e
anotada — o mês inteiro de julho saiu de uma reta rente à base para a forma real. O
`menor 2·hoje dia 28` sobreposto virou `menor 223 · hoje`.

Colchão **por lente**: a de Greicy parou de acusar "falta R$ 1.410" todo dia sobre uma
conta de R$ 90.

### Testes

313 passando (eram 285). Novos: `commitment.test.ts`, repasse interno e estimado por
mês em `timeline.test.ts`, `applicableForecast` e parcelamento em `variable.test.ts`,
acúmulo da trajetória e `householdSplit` inteiro reescrito em `visuals.test.ts`.

### Fica para depois

- Botão que **escreve** a parcela sugerida no lançamento (hoje o card mostra o número;
  quem edita é você).
- Ratear as compras dentro da fatura por dono (§4.5 só resolveu não ratear a fatura).
- Limpeza de `core/assistant` e `core/capture` (§5) — sem consumidor, mas mexer neles
  não muda nada na tela.
