/**
 * Faixa de incerteza da projeção.
 *
 * A curva projetada usa a **mediana** do variável. Com um ou dois meses de base
 * essa mediana é um chute com aparência de fato — e o usuário decide o mês em
 * cima do fundo do poço, que é justamente onde o erro acumula.
 *
 * A faixa é exata, não simulada: entre os cenários só muda o gasto variável por
 * dia, então a distância até a curva central é `(taxa − mediana) × dias
 * projetados até ali`. Ela abre com o tempo, que é a verdade — errar R$ 30/dia
 * no dia 2 custa R$ 30; no dia 30 custa R$ 900.
 *
 * Gasto **alto** puxa o saldo para **baixo**: a borda inferior vem de `high`.
 */

import type { DayPoint } from '@/core/month-metrics/daily';

export type BandPoint = {
  day: number;
  /** Saldo se o variável vier no teto da faixa. */
  lowCents: number;
  /** Saldo se o variável vier no piso da faixa. */
  highCents: number;
};

export function projectionBand(input: {
  points: ReadonlyArray<DayPoint>;
  /** Estimado por dia embutido na curva de alerta (`balanceWithEstimate`). */
  centralDailyCents: number;
  lowDailyCents: number;
  highDailyCents: number;
}): BandPoint[] | null {
  const { points, centralDailyCents, lowDailyCents, highDailyCents } = input;

  const under = Math.max(0, centralDailyCents - lowDailyCents);
  const over = Math.max(0, highDailyCents - centralDailyCents);
  // Base de um mês só: piso, teto e mediana coincidem. Desenhar uma faixa de
  // largura zero sugeriria precisão que não existe — melhor não desenhar nada.
  if (under === 0 && over === 0) return null;

  const out: BandPoint[] = [];
  let projected = 0;

  for (const p of points) {
    if (p.projected) projected += 1;
    // A faixa envolve a curva **com estimado** (alerta), não a curva real.
    // A real é compromisso; a faixa responde "e se o variável vier assim".
    const center = p.balanceWithEstimateCents;
    out.push({
      day: p.day,
      lowCents: center - over * projected,
      highCents: center + under * projected,
    });
  }

  return out;
}

/**
 * Menor saldo à frente se a taxa diária do variável mudasse.
 *
 * `deltaPerDayCents` positivo = gastando **mais** por dia **além** da curva
 * base (`points.balanceCents`, só lançamentos). Mesma aritmética da faixa:
 * a diferença até um dia é `delta × dias projetados até ali`.
 *
 * O simulador aplica a taxa escolhida sobre o caixa real — o estimado do
 * histórico não está na curva base, então `delta = estimado/dia` reproduz o
 * cenário de alerta.
 */
export function lowestAheadAtRate(
  points: ReadonlyArray<DayPoint>,
  deltaPerDayCents: number,
  today: string,
): { cents: number; day: number } | null {
  let best: { cents: number; day: number } | null = null;
  let projected = 0;

  for (const p of points) {
    if (p.projected) projected += 1;
    if (p.date < today) continue;
    const cents = p.balanceCents - deltaPerDayCents * projected;
    if (!best || cents < best.cents) best = { cents, day: p.day };
  }

  return best;
}

/** Pior fundo do poço dentro da faixa, de hoje em diante. */
export function bandLowestAhead(
  band: ReadonlyArray<BandPoint>,
  points: ReadonlyArray<DayPoint>,
  today: string,
): number | null {
  let worst: number | null = null;
  for (const [i, p] of points.entries()) {
    if (p.date < today) continue;
    const cents = band[i]?.lowCents;
    if (cents == null) continue;
    if (worst == null || cents < worst) worst = cents;
  }
  return worst;
}
