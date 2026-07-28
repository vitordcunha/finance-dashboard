/**
 * Variável acumulado × o que caberia — o dia em que passou.
 *
 * "Ritmo R$ 131/dia" e "cabe R$ 105/dia" são dois números verdadeiros que não
 * dizem **quando**. E quando é a única parte acionável: um mês que estourou no
 * dia 5 e um que estourou no dia 26 pedem reações diferentes, e a média diária
 * os apresenta idênticos.
 *
 * Duas curvas cumulativas desde o dia 1: o gasto discricionário que aconteceu e
 * a reta do orçamento. Onde a primeira cruza a segunda é o dia em que o mês
 * virou. Só o variável entra — a mesma régua do ritmo, senão o aluguel do dia 6
 * cruzaria a reta em todo mês e o gráfico nunca diria nada.
 */

import { monthRange, type YearMonth } from '@/core/month';
import type { TimelineMonth } from '@/core/timeline';
import { outflowKind } from '@/core/month-metrics/outflow-kind';

export type BurnupPoint = {
  day: number;
  /** Variável acumulado até o fim do dia. */
  spentCents: number;
  /** Reta do orçamento no mesmo dia. */
  budgetCents: number;
  /** Já aconteceu — depois de hoje a curva de gasto para. */
  realized: boolean;
};

export type Burnup = {
  points: BurnupPoint[];
  /** Total do variável no mês (ou até hoje, se corrente). */
  spentCents: number;
  budgetCents: number;
  /** Primeiro dia em que o acumulado passou a reta. Null se nunca passou. */
  crossedOn: number | null;
  /** Diferença no último dia realizado — positivo é excesso. */
  gapCents: number;
};

export function burnup(input: {
  month: TimelineMonth;
  today: string;
  /**
   * Reta do orçamento, em centavos por **dia**. Normalmente o estimado do
   * histórico; com o simulador, o valor que o usuário escolheu.
   *
   * Por dia e não por mês: a reta é `taxa × dia`, então fevereiro e agosto
   * comparam o mesmo hábito sem conversão no meio.
   */
  budgetDailyCents: number;
  essentialCategoryIds?: ReadonlySet<string> | null;
}): Burnup | null {
  const { month, today, budgetDailyCents } = input;
  const essential = input.essentialCategoryIds ?? null;

  const { start, end } = monthRange(month.ym as YearMonth);
  const lastDay = Number(end.slice(8, 10));
  if (budgetDailyCents <= 0) return null;

  /** Variável realizado por dia. Usa `nominalCents`: o cartão pesa no dia da compra. */
  const perDay = new Array<number>(lastDay + 1).fill(0);
  for (const day of month.days) {
    for (const event of day.events) {
      if (event.kind !== 'actual') continue;
      if (outflowKind(event, essential) !== 'variable') continue;
      if (event.nominalCents >= 0) continue;
      perDay[Number(day.date.slice(8, 10))] += -event.nominalCents;
    }
  }

  const points: BurnupPoint[] = [];
  let acc = 0;
  let crossedOn: number | null = null;
  let gapCents = 0;

  for (let day = 1; day <= lastDay; day++) {
    const date = `${start.slice(0, 8)}${String(day).padStart(2, '0')}`;
    const realized = date <= today;
    if (realized) acc += perDay[day]!;

    const budgetCents = budgetDailyCents * day;
    if (realized && crossedOn == null && acc > budgetCents) crossedOn = day;
    if (realized) gapCents = acc - budgetCents;

    points.push({ day, spentCents: acc, budgetCents, realized });
  }

  return {
    points,
    spentCents: acc,
    budgetCents: budgetDailyCents * lastDay,
    crossedOn,
    gapCents,
  };
}
