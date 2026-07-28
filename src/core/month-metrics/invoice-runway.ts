/**
 * A pista de aterrissagem da fatura.
 *
 * Parcelamento é um custo fixo com data de morte, e a data de morte é uma
 * informação que decide algo: "de maio/27 sobram R$ 580/mês" responde quando dá
 * para assumir uma despesa nova. Nenhuma métrica de mês único diz isso — cada
 * mês vê a própria fatura e nunca a curva.
 *
 * Deriva dos eventos `settlement` (pagamento de fatura) já na linha do tempo.
 * Sem query nova e sem segundo motor: quando um número da tela tem origem
 * própria, ele passa a discordar dos outros.
 */

import type { TimelineMonth } from '@/core/timeline';
import { outflowKind } from '@/core/month-metrics/outflow-kind';

export type InvoicePoint = {
  ym: string;
  cents: number;
  projected: boolean;
};

export type InvoiceRunway = {
  points: InvoicePoint[];
  /** Primeiro mês, de hoje em diante, sem nenhuma fatura prevista. */
  clearFromYm: string | null;
  /** Quanto o custo mensal cai entre o próximo mês e o fim da pista. */
  reliefCents: number;
  maxCents: number;
};

export function invoiceRunway(input: {
  months: ReadonlyArray<TimelineMonth>;
  currentYm: string;
}): InvoiceRunway | null {
  const points: InvoicePoint[] = input.months
    .filter((m) => m.ym >= input.currentYm)
    .map((m) => {
      let cents = 0;
      for (const day of m.days) {
        for (const event of day.events) {
          if (outflowKind(event) !== 'settlement') continue;
          if (event.deltaCents >= 0) continue;
          cents += -event.deltaCents;
        }
      }
      return { ym: m.ym, cents, projected: m.ym > input.currentYm };
    });

  if (points.every((p) => p.cents === 0)) return null;

  const maxCents = Math.max(...points.map((p) => p.cents));

  // O primeiro mês zerado só conta se nada voltar depois: uma fatura que some em
  // março e reaparece em abril não é fim de pista, é buraco no dado.
  let clearFromYm: string | null = null;
  for (const [i, p] of points.entries()) {
    if (p.cents > 0) continue;
    if (points.slice(i).every((rest) => rest.cents === 0)) {
      clearFromYm = p.ym;
      break;
    }
  }

  // O alívio se mede do **próximo** mês, não deste: a fatura do mês corrente pode
  // já ter sido paga, e contá-la prometeria uma folga que não existe.
  const ahead = points.filter((p) => p.projected);
  const next = ahead.find((p) => p.cents > 0)?.cents ?? 0;
  const last = [...ahead].reverse().find((p) => p.cents > 0)?.cents ?? 0;

  return {
    points,
    clearFromYm,
    reliefCents: Math.max(0, next - (clearFromYm ? 0 : last)),
    maxCents,
  };
}
