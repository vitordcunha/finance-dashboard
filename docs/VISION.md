# Visão do produto

## Problema

Casal precisa organizar dinheiro juntos **e** cada um precisa da própria gestão: ganhos (fixos e variáveis), gastos, cartão de crédito (faturas e parcelas), saldo real, previsibilidade e metas — sem planilha pesada e sem app genérico que exige 12 campos por lançamento.

## Promessa

> App de casal com captura de ~5 segundos, lente clara Casa / Eu, painel mensal (planejado vs feito), cartões com ritual de fechamento e conciliação por extrato, saldo real como âncora, plano editável sem medo, futuro projetado e metas com ritmo — sem estragar a realidade.

## Usuários

- 2 pessoas da mesma **household** (transparência total; **sem** contas privadas)
- Cada um lança do próprio celular (Capacitor depois) ou web
- Uso diário curto + ritual semanal/mensal de organização
- Precisam de **visão da casa** e de **controle pessoal** no mesmo app

## Pilares

| Pilar | Significado |
|-------|-------------|
| Captura primeiro | Se lançar for difícil, o resto não importa |
| Casa + Eu | Mesmo ledger; lente visual Casa / Eu / Tudo (sem privacidade) |
| Plano × Razão | Previsto vs realizado; diferença = insight |
| Cartão em 3 camadas | Compras (A) · Fatura (B) · Pagamento (C) — sem double-count |
| Verdade externa | Saldo real + import de extrato (arquivo), não sync contínuo |
| Precisão | Centavos inteiros; engine testada |
| Clareza | Um herói na home Casa; densidade de métricas no escopo Eu |
| Simplicidade técnica | Poucas peças; código organizado para IA |

## Modelo Casa → Eu (contribuição)

Gastos da casa **implicam** no pessoal via **cota proporcional**, não fatiando cada linha no ledger:

1. Renda do mês por pessoa (fixa do plano + variável estimada/realizada).
2. `%` = minha renda ÷ renda da casa (fallback 50/50 se faltar renda).
3. **Cota** = `%` × total de gastos da Casa no mês.
4. **Herói Eu (caixa)** ≈ abertura do mês + entradas − gastos − transferências − cota − aportes de meta − vencimentos com valor.
5. **Folga no plano** (secundário) ≈ renda do Plano − cota − pessoais − metas.

Métricas extras no painel Eu (não na home Casa): carga efetiva (rateio analítico), fairness (o que paguei de Casa − minha cota). **Sem settle-up obrigatório.**

Renda para **cota %** vem do Plano (extrato sozinho não baseia share — evita estorno/PIX avulso). Renda variável: `%` recalcula no mês corrente (v1). Média móvel = aspiracional se oscilar demais.

Abertura do mês: fechamento declarado do mês anterior, senão líquido estimado dos lançamentos do mês anterior.

## Não-objetivos

- Open Banking / sync **contínuo** com banco (import manual de OFX/CSV **é** objetivo)
- Multi-moeda
- Corretora / FIIs / análise de carteira
- Contas privadas / ACL por pessoa
- Multi-household SaaS público
- YNAB envelope completo
- Backend próprio complexo (usamos Supabase)
- Chat in-app estilo Honeydue

## Modos de uso

| Modo | Quando | Tempo | Tela |
|------|--------|-------|------|
| Captura | No gasto | ~5s | Sheet `+` |
| Organização | Domingo / fechamento | 10–20 min | Fila + Cartões + Import + Saldo |
| Visão | Dia 1 / decisões | ~15 min | Mês + Futuro + Metas |
| Pessoal | Qualquer momento | ~2 min | Escopo **Eu** (herói + métricas) |

## Métricas de qualidade (subjetivas mas explícitas)

- Lançamento feliz: valor → o quê → pronto (categoria opcional na hora)
- Fechar fatura: wizard ≤ 3 passos; pagamento vinculado à fatura
- Import: extrato casa com lançamentos (auto-match + desfazer)
- Editar plano: “só este mês” vs “daqui pra frente” (sem medo)
- Escopo Eu: um herói claro + métricas de suporte (cota, fairness, carga)
- UI Casa: calma; UI Eu: pode ser mais densa
- Código: features isoladas, componentes pequenos, `core/` puro

## Nome e tom

- Produto interno do casal (não precisa de marca pública agora)
- Tom da UI: direto, calmo, sem gamificação infantil, sem emoji decorativo em massa
- Erros e alertas só quando há problema real (gap de fatura, estouro, saldo negativo projetado)
