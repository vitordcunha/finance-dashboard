/**
 * Saldo dia a dia dentro de um mês.
 *
 * `TimelineMonth.days` só tem os dias com movimento — bom para extrato, ruim
 * para gráfico: um mês com lançamento no dia 1 e no dia 28 viraria uma reta de
 * dois pontos, escondendo que o saldo ficou 27 dias no fundo do poço. Aqui todo
 * dia do mês existe, carregando o saldo do anterior.
 */

import { monthRange, type YearMonth } from '@/core/month';
import type { TimelineEvent, TimelineMonth } from '@/core/timeline';

export type DayPoint = {
  date: string;
  /** Dia do mês, 1–31. */
  day: number;
  /** Saldo no fim do dia. */
  balanceCents: number;
  inCents: number;
  outCents: number;
  hasEvents: boolean;
  /** O que aconteceu no dia. Vazio quando o saldo só foi carregado adiante. */
  events: readonly TimelineEvent[];
  /** Posterior a hoje: o saldo aqui é projeção, não fato. */
  projected: boolean;
  /** É hoje. */
  isToday: boolean;
  belowMinimum: boolean;
};

export type DailySeriesInput = {
  month: TimelineMonth;
  today: string;
  /** Colchão: abaixo disto o dia entra na faixa de alerta. */
  minimumCents: number;
};

export function dailySeries(input: DailySeriesInput): DayPoint[] {
  const { month, today, minimumCents } = input;
  const { start, end } = monthRange(month.ym as YearMonth);

  const byDate = new Map(month.days.map((d) => [d.date, d]));
  const out: DayPoint[] = [];

  let balance = month.openingCents;
  const lastDay = Number(end.slice(8, 10));

  for (let day = 1; day <= lastDay; day++) {
    const date = `${start.slice(0, 8)}${String(day).padStart(2, '0')}`;
    const hit = byDate.get(date);
    if (hit) balance = hit.balanceCents;

    out.push({
      date,
      day,
      balanceCents: balance,
      inCents: hit?.inCents ?? 0,
      outCents: hit?.outCents ?? 0,
      hasEvents: Boolean(hit),
      events: hit?.events ?? [],
      projected: date > today,
      isToday: date === today,
      belowMinimum: balance < minimumCents,
    });
  }

  return out;
}

/** Dia de menor saldo. Empate fica com o primeiro — é quando o buraco abre. */
export function lowestPoint(points: ReadonlyArray<DayPoint>): DayPoint | null {
  let best: DayPoint | null = null;
  for (const p of points) {
    if (!best || p.balanceCents < best.balanceCents) best = p;
  }
  return best;
}

/** Menor saldo de hoje em diante — o que ainda dá para evitar. */
export function lowestAhead(
  points: ReadonlyArray<DayPoint>,
  today: string,
): DayPoint | null {
  return lowestPoint(points.filter((p) => p.date >= today));
}
