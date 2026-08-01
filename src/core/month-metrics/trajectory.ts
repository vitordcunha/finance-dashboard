/**
 * Onde o saldo de **fechamento** chega — não o dia a dia do mês.
 *
 * A fita mostra **deltas** (+8,1k · +3,1k). Deltas somam de cabeça mal: doze
 * resultados positivos não dizem se o saldo dobrou ou empatou. A trajetória
 * acumula o fechamento de cada mês.
 *
 * Duas séries:
 * - `closingCents` — só lançamentos (realizado + previsto).
 * - `closingWithEstimateCents` — se o variável estimado se concretizar, **acumulado
 *   mês a mês**.
 *
 * O acúmulo é o ponto. `TimelineMonth.closingWithEstimateCents` reinicia do caixa
 * real todo mês, e com razão: o alerta do mês aberto não deve herdar o chute do mês
 * anterior. Mas numa janela de treze meses isso descontava **um** mês de gasto
 * variável de treze meses de sobra, e o card anunciava R$ 105.332 de patrimônio em
 * jul/2027 — o número mais destacado do painel era o menos defensável. Aqui a
 * segunda série soma o estimado de cada mês projetado ao dos anteriores.
 *
 * A âncora continua sendo a série real: `closingCents` é o que abre o mês seguinte.
 * O chute nunca vira caixa.
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

  // Estimado acumulado: o chute de agosto continua valendo em setembro.
  let estimatedSoFar = 0;
  const points: TrajectoryPoint[] = input.months.map((m) => {
    const projected = m.ym >= input.currentYm;
    if (projected) estimatedSoFar += m.estimatedOutCents;
    const withEstimate = m.closingCents - estimatedSoFar;
    return {
      ym: m.ym,
      closingCents: m.closingCents,
      closingWithEstimateCents: withEstimate,
      projected,
      belowMinimum: m.closingCents < minimumCents,
      belowMinimumWithEstimate: withEstimate < minimumCents,
    };
  });

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
