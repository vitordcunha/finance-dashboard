/**
 * Onde o saldo chega — não quanto sobrou em cada mês.
 *
 * A fita de meses mostra **deltas** (+8,1k · +3,1k · +1,9k). Deltas somam de
 * cabeça mal: doze resultados positivos em sequência não dizem se o saldo dobrou
 * ou se ficou parado, porque o olho não acumula. A trajetória mostra o
 * acumulado, que é a pergunta real — "estou construindo algo ou empatando?".
 *
 * Tem um efeito colateral desejado: expõe otimismo. Uma linha que sobe reto por
 * um ano é sinal de que algo grande não está sendo projetado — foi assim que a
 * ausência do variável estimado ficou visível em vez de enterrada num aviso.
 */

import type { TimelineMonth } from '@/core/timeline';

export type TrajectoryPoint = {
  ym: string;
  closingCents: number;
  /** Mês ainda não fechado — daqui pra frente é projeção. */
  projected: boolean;
  belowMinimum: boolean;
};

export type Trajectory = {
  points: TrajectoryPoint[];
  /** Fechamento do último mês da janela. */
  endCents: number;
  /** Variação entre o primeiro e o último mês. */
  deltaCents: number;
  /** Pior fechamento projetado, e quando. */
  lowest: TrajectoryPoint | null;
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
    projected: m.ym >= input.currentYm,
    belowMinimum: m.closingCents < minimumCents,
  }));

  // O pior fechamento só interessa daqui pra frente: passado não se evita.
  let lowest: TrajectoryPoint | null = null;
  for (const p of points) {
    if (!p.projected) continue;
    if (!lowest || p.closingCents < lowest.closingCents) lowest = p;
  }

  return {
    points,
    endCents: points.at(-1)!.closingCents,
    deltaCents: points.at(-1)!.closingCents - points[0]!.closingCents,
    lowest,
  };
}
