/**
 * Onde o saldo de **fechamento** chega — não o dia a dia do mês.
 *
 * A fita mostra **deltas** (+8,1k · +3,1k). Deltas somam de cabeça mal: doze
 * resultados positivos não dizem se o saldo dobrou ou empatou. A trajetória
 * acumula o fechamento de cada mês.
 *
 * Duas séries:
 * - `closingCents` — só lançamentos (realizado + previsto).
 * - `closingWithEstimateCents` — se o variável estimado se concretizar.
 *
 * Sem o estimado, a linha sobe reto por um ano e mente. Com as duas, o olho
 * vê o otimismo do cadastrado e o cenário do ritmo lado a lado.
 */

import type { TimelineMonth } from '@/core/timeline';

export type TrajectoryPoint = {
  ym: string;
  closingCents: number;
  closingWithEstimateCents: number;
  /** Mês ainda não fechado — daqui pra frente é projeção. */
  projected: boolean;
  belowMinimum: boolean;
  belowMinimumWithEstimate: boolean;
};

export type Trajectory = {
  points: TrajectoryPoint[];
  /** Fechamento do último mês — só compromissos. */
  endCents: number;
  /** Fechamento do último mês — com estimado. */
  endWithEstimateCents: number;
  /** Variação do primeiro ao último (compromissos). */
  deltaCents: number;
  /** Variação do primeiro ao último (com estimado). */
  deltaWithEstimateCents: number;
  /** Pior fechamento projetado (compromissos), e quando. */
  lowest: TrajectoryPoint | null;
  /** Pior fechamento projetado (com estimado), e quando. */
  lowestWithEstimate: TrajectoryPoint | null;
  /** Há divergência útil entre as duas séries à frente. */
  showsEstimate: boolean;
};

export function trajectory(input: {
  months: ReadonlyArray<TimelineMonth>;
  currentYm: string;
  minimumCents?: number;
}): Trajectory | null {
  const minimumCents = input.minimumCents ?? 0;
  if (input.months.length < 2) return null;

  const points: TrajectoryPoint[] = input.months.map((m) => ({
    ym: m.ym,
    closingCents: m.closingCents,
    closingWithEstimateCents: m.closingWithEstimateCents,
    projected: m.ym >= input.currentYm,
    belowMinimum: m.closingCents < minimumCents,
    belowMinimumWithEstimate: m.closingWithEstimateCents < minimumCents,
  }));

  // O pior fechamento só interessa daqui pra frente: passado não se evita.
  let lowest: TrajectoryPoint | null = null;
  let lowestWithEstimate: TrajectoryPoint | null = null;
  let showsEstimate = false;
  for (const p of points) {
    if (!p.projected) continue;
    if (!lowest || p.closingCents < lowest.closingCents) lowest = p;
    if (
      !lowestWithEstimate ||
      p.closingWithEstimateCents < lowestWithEstimate.closingWithEstimateCents
    ) {
      lowestWithEstimate = p;
    }
    if (p.closingWithEstimateCents !== p.closingCents) showsEstimate = true;
  }

  const first = points[0]!;
  const last = points.at(-1)!;

  return {
    points,
    endCents: last.closingCents,
    endWithEstimateCents: last.closingWithEstimateCents,
    deltaCents: last.closingCents - first.closingCents,
    deltaWithEstimateCents:
      last.closingWithEstimateCents - first.closingWithEstimateCents,
    lowest,
    lowestWithEstimate,
    showsEstimate,
  };
}
