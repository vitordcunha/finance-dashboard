/**
 * Métricas de um mês — o que o extrato não conta.
 *
 * Todas derivam da mesma linha do tempo que desenha o gráfico. Nenhuma refaz
 * conta por fora: número na tela sem origem única foi o que fez o app se
 * contradizer entre telas.
 */

import { differenceInCalendarDays, parseISO } from 'date-fns';
import { monthCoverage } from '@/core/forecast';
import { monthRange, type YearMonth } from '@/core/month';
import type { TimelineEvent, TimelineMonth } from '@/core/timeline';
import { lowestAhead, lowestPoint, type DayPoint } from '@/core/month-metrics/daily';
import { outflowKind } from '@/core/month-metrics/outflow-kind';

export type Highlight = {
  label: string;
  cents: number;
  date: string;
};

export type MonthMetrics = {
  /** Dia de menor saldo no mês inteiro. */
  lowest: DayPoint | null;
  /** Menor saldo de hoje em diante — o buraco que ainda dá para evitar. */
  lowestAhead: DayPoint | null;
  daysBelowMinimum: number;
  /** Primeiro dia do mês em que o saldo fura o colchão (pode ser passado). */
  firstBelowMinimum: string | null;
  /** Primeiro furo de hoje em diante — o que ainda dá para evitar. */
  firstBelowAhead: string | null;
  /** Dias civis até `firstBelowAhead`. Null se não há furo à frente. */
  daysUntilBelow: number | null;

  /**
   * Folga de caixa: quanto dá para gastar sem furar o colchão até o fim do mês.
   *
   * É `menor saldo daqui pra frente − colchão`, só com **lançamentos**
   * (realizado + previsto). O estimado do histórico **não** entra — é alerta,
   * não compromisso. O menor saldo já embute o timing (salário depois do
   * aluguel). Não é `renda − contas` bruto — essa é `income.freeCents`
   * (sobra do mês), exibida ao lado no herói.
   */
  freeToSpendCents: number | null;
  /**
   * Folga se o variável estimado se concretizar — alerta paralelo ao herói.
   * Null quando não há estimado à frente.
   */
  freeToSpendWithEstimateCents: number | null;
  /** O mesmo, dividido pelos dias que faltam. */
  safeDailyCents: number | null;
  daysLeft: number;

  /** Previsto (série/lançamento) que ainda sai — sem o estimado. */
  committedAheadCents: number;
  /** Estimado do histórico que ainda “sai” neste mês. */
  estimatedAheadCents: number;
  /** Previsto que ainda entra neste mês. */
  incomingAheadCents: number;

  /**
   * Ritmo diário do gasto **discricionário** já realizado.
   *
   * Fora da conta: recorrência, categoria essencial, pagamento de fatura e
   * estimado. Aluguel dividido por 30 não é ritmo — é um evento datado fingindo
   * ser hábito, e era o que fazia este número triplicar sem nenhum dia ter
   * mudado de comportamento.
   */
  dailyBurnCents: number;
  /** Numerador do ritmo: variável já gasto até hoje. */
  realizedVariableCents: number;
  /** O que ficou fora do ritmo: compromisso fixo + fatura, já realizados. */
  realizedCommittedCents: number;
  /**
   * Estimado variável ainda à frente, diluído pelos dias que faltam
   * (depois de hoje no mês corrente; mês inteiro no futuro).
   */
  estimatedDailyCents: number;
  /** Dias já vividos do mês (base do ritmo). */
  elapsedDays: number;
  /** Dias depois de hoje com saldo projetado (base do estimado/dia). */
  daysAhead: number;

  /**
   * Ritmo − estimado/dia. Positivo = mês mais caro que o habitual.
   * Null quando não há os dois lados para comparar.
   */
  paceGapCents: number | null;
  /**
   * Quantos dias a folga (`freeToSpend`, só compromissos) aguenta o ritmo.
   *
   * Como o livre **não** embute o estimado, divide-se pelo ritmo cheio — é o
   * alerta "se mantiver R$ X/dia, a folga acaba em N dias".
   */
  headroomBurnDays: number | null;

  /** Compromisso: recorrência ou categoria essencial. */
  fixedOutCents: number;
  /** Pagamento de fatura — quitação, não gasto novo. */
  settlementOutCents: number;
  /** Discricionário: decidido durante o mês. */
  variableOutCents: number;
  /** Saída sintética do forecast. */
  estimatedOutCents: number;
  /**
   * Repasse entre as contas do casal — fora de todos os outros baldes.
   *
   * Não é gasto da casa: o dinheiro trocou de conta e ficou. Estava caindo em
   * "variável" (R$ 1.266,25 de rateio aparecendo como gasto discricionário de
   * agosto) e a mesma transferência ainda inflava a renda do mês.
   */
  internalOutCents: number;

  biggestExpense: Highlight | null;
  nextIncome: Highlight | null;

  overdueCount: number;
  overdueCents: number;

  /** Saídas do mês ÷ entradas do mês, em basis points. Null sem entrada. */
  burnRateBps: number | null;

  /**
   * A entrada do mês repartida — quanto já tem dono antes de qualquer decisão.
   *
   * `Saídas ÷ entradas: 77%` era a mesma ideia sem dizer *de quê*: um mês em que
   * 77% é aluguel e um em que 77% é delivery pedem decisões opostas e liam igual.
   * Aqui `comprometido` é só compromisso + fatura: o variável fica de fora porque
   * é o que você ainda decide, e é justamente a parte sobre a qual dá para agir.
   */
  income: IncomeSplit | null;
};

export type IncomeSplit = {
  /** Entrada da casa, já sem o repasse interno do rateio. */
  incomeCents: number;
  /** Recorrência e categoria essencial. */
  fixedCents: number;
  /** Pagamento de fatura. */
  settlementCents: number;
  /** Variável lançado (realizado + previsto avulso) — sem o estimado. */
  variableCents: number;
  /** Estimado do histórico, à parte: alerta, não fatia do "livre". */
  estimatedCents: number;
  /**
   * Sobra do mês: renda − compromisso − fatura − variável lançado.
   *
   * O estimado **não** come esta fatia — mora no alerta. Sem timing — diferente da
   * folga de caixa (`freeToSpendCents`). Note que **não** é "renda − compromissos":
   * o variável já gasto também sai daqui, e a tela dizia a fórmula errada no
   * rodapé do herói.
   */
  freeCents: number;
  /** (compromisso + fatura) ÷ entrada, em basis points. */
  committedBps: number;
};

export type MonthMetricsInput = {
  month: TimelineMonth;
  points: ReadonlyArray<DayPoint>;
  today: string;
  minimumCents: number;
  /**
   * Categorias marcadas como essenciais em Ajustes. Saída nelas é compromisso,
   * não hábito — sai do ritmo. Sem a lista, só recorrência conta como fixo.
   */
  essentialCategoryIds?: ReadonlySet<string> | null;
};

function allEvents(month: TimelineMonth): TimelineEvent[] {
  return month.days.flatMap((d) => d.events);
}

export function monthMetrics(input: MonthMetricsInput): MonthMetrics {
  const { month, points, today, minimumCents } = input;
  const essential = input.essentialCategoryIds ?? null;
  const { start, end } = monthRange(month.ym as YearMonth);

  const isPast = end < today;
  const isFuture = start > today;
  const events = allEvents(month);

  // O que a casa de fato recebeu. O rateio dela chega na conta dele, então
  // `inCents` cru contava o mesmo dinheiro duas vezes na vida da casa.
  const incomeCents = month.inCents - month.internalInCents;

  const from = isFuture ? start : today;
  const ahead = isPast ? null : lowestAhead(points, from);

  // Dias que ainda contam para diluir o que sobrou. Mês futuro conta inteiro.
  const remaining = points.filter((p) =>
    isFuture ? true : !isPast && p.date >= today,
  );
  const daysLeft = remaining.length;

  const freeToSpendCents =
    ahead == null ? null : ahead.balanceCents - minimumCents;

  // Menor saldo à frente na corrente com estimado — alerta, não herói.
  let freeToSpendWithEstimateCents: number | null = null;
  if (!isPast) {
    let bestEst: number | null = null;
    for (const p of points) {
      if (p.date < from) continue;
      if (bestEst == null || p.balanceWithEstimateCents < bestEst) {
        bestEst = p.balanceWithEstimateCents;
      }
    }
    if (bestEst != null) freeToSpendWithEstimateCents = bestEst - minimumCents;
  }

  const safeDailyCents =
    freeToSpendCents == null || daysLeft === 0 || freeToSpendCents <= 0
      ? null
      : Math.floor(freeToSpendCents / daysLeft);

  let committedAheadCents = 0;
  let estimatedAheadCents = 0;
  let incomingAheadCents = 0;
  let fixedOutCents = 0;
  let settlementOutCents = 0;
  let variableOutCents = 0;
  let estimatedOutCents = 0;
  let internalOutCents = 0;
  let overdueCount = 0;
  let overdueCents = 0;
  let biggestExpense: Highlight | null = null;
  let nextIncome: Highlight | null = null;

  for (const event of events) {
    const out = event.deltaCents < 0;
    const abs = Math.abs(event.deltaCents);
    const isForecast = event.kind === 'forecast';
    // Repasse interno não é entrada nem saída da casa: sai de uma conta e chega
    // na outra. Fica fora dos baldes, do "ainda vai sair/entrar" e da maior saída.
    const isInternal = Boolean(event.internal);

    if (out) {
      const nature = outflowKind(event, essential);
      if (nature === 'internal') internalOutCents += abs;
      else if (nature === 'estimated') estimatedOutCents += abs;
      else if (nature === 'settlement') settlementOutCents += abs;
      else if (nature === 'fixed') fixedOutCents += abs;
      else variableOutCents += abs;

      // Estimado não “puxou o mês” — é mediana, não lançamento.
      if (
        !isForecast &&
        !isInternal &&
        (!biggestExpense || abs > biggestExpense.cents)
      ) {
        biggestExpense = { label: event.label, cents: abs, date: event.date };
      }
    }

    if (event.overdue) {
      overdueCount += 1;
      overdueCents += abs;
    }

    const future = event.date > today;
    if (event.kind !== 'actual' && future && !isInternal) {
      if (out) {
        if (isForecast) estimatedAheadCents += abs;
        else committedAheadCents += abs;
      } else {
        incomingAheadCents += event.deltaCents;
      }
    }

    if (event.deltaCents > 0 && future && !isInternal && !nextIncome) {
      nextIncome = {
        label: event.label,
        cents: event.deltaCents,
        date: event.date,
      };
    }
  }

  const elapsedDays = points.filter((p) => !p.projected).length;
  // Estimado é “o que ainda vai sair” — dilui só nos dias depois de hoje.
  // No mês futuro, todos os dias ainda estão à frente.
  const daysAhead = points.filter((p) =>
    isFuture ? true : !isPast && p.date > today,
  ).length;
  // O ritmo mede decisão, não trilho de pagamento: usa `nominalCents`, então
  // compra no cartão pesa no dia da compra (o caixa só se move na fatura, mas o
  // hábito aconteceu ali). Como a fatura é `settlement`, nada conta duas vezes.
  let realizedVariableCents = 0;
  let realizedCommittedCents = 0;

  for (const event of month.days
    .filter((d) => d.date <= today)
    .flatMap((d) => d.events)) {
    if (event.kind !== 'actual') continue;
    const nature = outflowKind(event, essential);
    // Repasse não é ritmo nem "compromisso já pago" — não é gasto.
    if (nature === 'internal') continue;
    if (nature === 'variable') {
      if (event.nominalCents < 0) realizedVariableCents += -event.nominalCents;
    } else if (event.deltaCents < 0) {
      realizedCommittedCents += -event.deltaCents;
    }
  }

  const below = points.filter((p) => p.belowMinimum);
  const firstBelowMinimum = below[0]?.date ?? null;
  const firstBelowAhead =
    points.find((p) => p.date >= today && p.belowMinimum)?.date ?? null;
  const daysUntilBelow =
    firstBelowAhead == null
      ? null
      : differenceInCalendarDays(parseISO(firstBelowAhead), parseISO(today));

  const dailyBurnCents =
    elapsedDays > 0 ? Math.round(realizedVariableCents / elapsedDays) : 0;
  const estimatedDailyCents =
    estimatedAheadCents > 0 && daysAhead > 0
      ? Math.round(estimatedAheadCents / daysAhead)
      : 0;

  const paceGapCents =
    dailyBurnCents > 0 && estimatedDailyCents > 0
      ? dailyBurnCents - estimatedDailyCents
      : null;

  // Livre = só compromissos. O ritmo cheio come a folga.
  let headroomBurnDays: number | null = null;
  if (
    freeToSpendCents != null &&
    freeToSpendCents > 0 &&
    dailyBurnCents > 0
  ) {
    headroomBurnDays = Math.floor(freeToSpendCents / dailyBurnCents);
  }

  return {
    lowest: lowestPoint(points),
    lowestAhead: ahead,
    daysBelowMinimum: below.length,
    firstBelowMinimum,
    firstBelowAhead,
    daysUntilBelow,
    freeToSpendCents,
    freeToSpendWithEstimateCents,
    safeDailyCents,
    daysLeft,
    committedAheadCents,
    estimatedAheadCents,
    incomingAheadCents,
    dailyBurnCents,
    realizedVariableCents,
    realizedCommittedCents,
    estimatedDailyCents,
    elapsedDays,
    daysAhead,
    paceGapCents,
    headroomBurnDays,
    fixedOutCents,
    settlementOutCents,
    variableOutCents,
    estimatedOutCents,
    internalOutCents,
    biggestExpense,
    nextIncome,
    overdueCount,
    overdueCents,
    burnRateBps:
      incomeCents > 0
        ? Math.round(
            ((month.bookedOutCents - month.internalOutCents) / incomeCents) *
              10_000,
          )
        : null,
    income: incomeSplit(
      incomeCents,
      fixedOutCents,
      settlementOutCents,
      variableOutCents,
      estimatedOutCents,
    ),
  };
}

function incomeSplit(
  incomeCents: number,
  fixedCents: number,
  settlementCents: number,
  variableCents: number,
  estimatedCents: number,
): IncomeSplit | null {
  if (incomeCents <= 0) return null;
  return {
    incomeCents,
    fixedCents,
    settlementCents,
    variableCents,
    estimatedCents,
    freeCents: incomeCents - fixedCents - settlementCents - variableCents,
    committedBps: Math.round(
      ((fixedCents + settlementCents) / incomeCents) * 10_000,
    ),
  };
}

/** Cobertura mínima para um mês servir de base de comparação. */
const MIN_COVERAGE = 0.8;

/**
 * Saída do mês contra a média dos meses fechados anteriores.
 *
 * Só entram meses **cobertos**: um junho com extrato só dos últimos 5 dias tem
 * saída de R$ 1.064 e faria julho parecer +1027%. Mês pela metade não é base de
 * comparação, é ruído com aparência de fato.
 *
 * Compara saída **lançada** (`bookedOutCents`), sem o estimado — senão meses
 * futuros com forecast parecem “gastos demais” contra a média — e sem o repasse
 * interno, que não é gasto da casa.
 */
export function compareToAverage(
  month: TimelineMonth,
  closedMonths: ReadonlyArray<TimelineMonth>,
): { averageOutCents: number; deltaBps: number } | null {
  const others = closedMonths.filter(
    (m) =>
      m.ym !== month.ym &&
      m.days.length > 0 &&
      monthCoverage(
        m.ym,
        m.days.map((d) => d.date),
      ) >= MIN_COVERAGE,
  );
  if (others.length === 0) return null;

  const averageOutCents = Math.round(
    others.reduce((s, m) => s + householdOutCents(m), 0) / others.length,
  );
  if (averageOutCents === 0) return null;

  return {
    averageOutCents,
    deltaBps: Math.round(
      ((householdOutCents(month) - averageOutCents) / averageOutCents) * 10_000,
    ),
  };
}

/** Saída lançada que de fato saiu de casa: sem estimado e sem repasse interno. */
export function householdOutCents(month: TimelineMonth): number {
  return month.bookedOutCents - month.internalOutCents;
}
