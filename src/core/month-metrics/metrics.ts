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
   * Quanto dá para gastar sem furar o colchão até o fim do mês.
   *
   * É `menor saldo daqui pra frente − colchão`, não `saldo hoje − contas`: o
   * menor saldo já embute tudo que entra e sai até lá, inclusive o salário que
   * chega depois do aluguel.
   */
  freeToSpendCents: number | null;
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
   * Quantos dias a folga (`freeToSpend`) aguenta o excesso sobre o estimado.
   *
   * O livre já embute o estimado na timeline — não se divide `free / burn`.
   * Só o surplus (`burn − estimatedDaily`) come a folga de verdade.
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
  incomeCents: number;
  /** Recorrência e categoria essencial. */
  fixedCents: number;
  /** Pagamento de fatura. */
  settlementCents: number;
  /** Variável — realizado no mês mais o estimado que ainda vem. */
  variableCents: number;
  /** O que resta depois de tudo. Negativo quando o mês gasta mais do que entra. */
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

  const ahead = isPast ? null : lowestAhead(points, isFuture ? start : today);

  // Dias que ainda contam para diluir o que sobrou. Mês futuro conta inteiro.
  const remaining = points.filter((p) =>
    isFuture ? true : !isPast && p.date >= today,
  );
  const daysLeft = remaining.length;

  const freeToSpendCents =
    ahead == null ? null : ahead.balanceCents - minimumCents;

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
  let overdueCount = 0;
  let overdueCents = 0;
  let biggestExpense: Highlight | null = null;
  let nextIncome: Highlight | null = null;

  for (const event of events) {
    const out = event.deltaCents < 0;
    const abs = Math.abs(event.deltaCents);
    const isForecast = event.kind === 'forecast';

    if (out) {
      const nature = outflowKind(event, essential);
      if (nature === 'estimated') estimatedOutCents += abs;
      else if (nature === 'settlement') settlementOutCents += abs;
      else if (nature === 'fixed') fixedOutCents += abs;
      else variableOutCents += abs;

      // Estimado não “puxou o mês” — é mediana, não lançamento.
      if (!isForecast && (!biggestExpense || abs > biggestExpense.cents)) {
        biggestExpense = { label: event.label, cents: abs, date: event.date };
      }
    }

    if (event.overdue) {
      overdueCount += 1;
      overdueCents += abs;
    }

    const future = event.date > today;
    if (event.kind !== 'actual' && future) {
      if (out) {
        if (isForecast) estimatedAheadCents += abs;
        else committedAheadCents += abs;
      } else {
        incomingAheadCents += event.deltaCents;
      }
    }

    if (event.deltaCents > 0 && future && !nextIncome) {
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
    if (outflowKind(event, essential) === 'variable') {
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

  // Folga já assume o estimado. Só o excesso sobre ele come headroom.
  let headroomBurnDays: number | null = null;
  if (
    freeToSpendCents != null &&
    freeToSpendCents > 0 &&
    dailyBurnCents > 0
  ) {
    const surplus =
      estimatedDailyCents > 0
        ? dailyBurnCents - estimatedDailyCents
        : dailyBurnCents;
    if (surplus > 0) {
      headroomBurnDays = Math.floor(freeToSpendCents / surplus);
    }
  }

  return {
    lowest: lowestPoint(points),
    lowestAhead: ahead,
    daysBelowMinimum: below.length,
    firstBelowMinimum,
    firstBelowAhead,
    daysUntilBelow,
    freeToSpendCents,
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
    biggestExpense,
    nextIncome,
    overdueCount,
    overdueCents,
    burnRateBps:
      month.inCents > 0
        ? Math.round((month.bookedOutCents / month.inCents) * 10_000)
        : null,
    income: incomeSplit(
      month.inCents,
      fixedOutCents,
      settlementOutCents,
      variableOutCents + estimatedOutCents,
    ),
  };
}

function incomeSplit(
  incomeCents: number,
  fixedCents: number,
  settlementCents: number,
  variableCents: number,
): IncomeSplit | null {
  if (incomeCents <= 0) return null;
  return {
    incomeCents,
    fixedCents,
    settlementCents,
    variableCents,
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
 * futuros com forecast parecem “gastos demais” contra a média.
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
    others.reduce((s, m) => s + m.bookedOutCents, 0) / others.length,
  );
  if (averageOutCents === 0) return null;

  return {
    averageOutCents,
    deltaBps: Math.round(
      ((month.bookedOutCents - averageOutCents) / averageOutCents) * 10_000,
    ),
  };
}
