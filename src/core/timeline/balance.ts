/**
 * Saldo correndo sobre a linha do tempo, e o recorte por mês.
 *
 * A propriedade que importa: `abertura(mês N+1) === fechamento(mês N)`.
 * Não é uma regra que alguém precisa lembrar de aplicar — cai da soma.
 */

import { monthRange, type YearMonth } from '@/core/month';
import type { TimelineEvent } from '@/core/timeline/events';

export type TimelinePoint = TimelineEvent & {
  /** Saldo depois de aplicar este evento. */
  balanceCents: number;
};

export type TimelineDay = {
  date: string;
  events: TimelineEvent[];
  inCents: number;
  outCents: number;
  /**
   * Saldo no fim do dia — só lançamentos (realizado + previsto).
   *
   * O estimado **não** entra aqui: é alerta, não compromisso. O herói e a curva
   * principal leem este número.
   */
  balanceCents: number;
  /**
   * Saldo se o variável estimado se concretizar.
   *
   * Mesma âncora e mesmos lançamentos, mais o gotejamento do forecast. Serve à
   * curva/faixa de alerta — nunca ao "livre para gastar".
   */
  balanceWithEstimateCents: number;
  hasPlanned: boolean;
};

export type TimelineMonth = {
  ym: YearMonth;
  days: TimelineDay[];
  openingCents: number;
  /**
   * Fechamento só com lançamentos — sem o estimado.
   *
   * Abertura do mês seguinte = este número. Estimar o variável de agosto não
   * pode roubar a abertura de setembro: o chute não é caixa.
   */
  closingCents: number;
  /** Fechamento se o estimado do mês se concretizar. Alerta, não âncora. */
  closingWithEstimateCents: number;
  inCents: number;
  /** Toda saída do mês, inclusive estimado. */
  outCents: number;
  /** Saída de lançamentos (realizado + previsto), sem o estimado. */
  bookedOutCents: number;
  /** Saída sintética do `forecast` (mediana do histórico). */
  estimatedOutCents: number;
  /** closing − opening. O que sobrou (ou faltou) no mês — sem estimado. */
  netCents: number;
  /** Algum dia do mês tem evento previsto. */
  hasPlanned: boolean;
};

/** Aplica a âncora e devolve cada evento com o saldo resultante. */
export function runningBalance(
  events: ReadonlyArray<TimelineEvent>,
  anchorCents: number,
): TimelinePoint[] {
  let running = anchorCents;
  return events.map((event) => {
    running += event.deltaCents;
    return { ...event, balanceCents: running };
  });
}

/**
 * Agrupa em dias e meses, carregando o saldo entre eles.
 *
 * `anchorCents` vale **antes** do primeiro evento da lista — normalmente o
 * saldo real no fim do mês anterior ao primeiro mês pedido.
 */
export function groupTimeline(input: {
  events: ReadonlyArray<TimelineEvent>;
  anchorCents: number;
  /** Meses a materializar, em ordem. Dias sem evento não viram linha. */
  months: ReadonlyArray<YearMonth>;
}): TimelineMonth[] {
  const byDate = new Map<string, TimelineEvent[]>();
  for (const event of input.events) {
    const list = byDate.get(event.date);
    if (list) list.push(event);
    else byDate.set(event.date, [event]);
  }

  // Duas correntes: a real (só lançamentos) carrega mês a mês; a com estimado
  // também, para o alerta acumular — mas só a real vira abertura do próximo.
  let running = input.anchorCents;
  let runningWithEstimate = input.anchorCents;
  const out: TimelineMonth[] = [];

  for (const ym of input.months) {
    const { start, end } = monthRange(ym);
    const openingCents = running;
    // O estimado do mês anterior não contamina a abertura: o alerta recomeça
    // do caixa real. Sem isso, um chute de agosto roubava setembro inteiro.
    runningWithEstimate = running;

    const dates = [...byDate.keys()]
      .filter((d) => d >= start && d <= end)
      .sort();

    const days: TimelineDay[] = [];
    let inCents = 0;
    let outCents = 0;
    let bookedOutCents = 0;
    let estimatedOutCents = 0;
    let hasPlanned = false;

    for (const date of dates) {
      const events = byDate.get(date)!;
      let dayIn = 0;
      let dayOut = 0;
      let dayPlanned = false;

      for (const event of events) {
        if (event.deltaCents >= 0) dayIn += event.deltaCents;
        else {
          const abs = -event.deltaCents;
          dayOut += abs;
          if (event.kind === 'forecast') estimatedOutCents += abs;
          else bookedOutCents += abs;
        }
        if (event.kind !== 'actual') dayPlanned = true;
        // Estimado só na corrente de alerta.
        if (event.kind === 'forecast') {
          runningWithEstimate += event.deltaCents;
        } else {
          running += event.deltaCents;
          runningWithEstimate += event.deltaCents;
        }
      }

      inCents += dayIn;
      outCents += dayOut;
      hasPlanned ||= dayPlanned;

      days.push({
        date,
        events,
        inCents: dayIn,
        outCents: dayOut,
        balanceCents: running,
        balanceWithEstimateCents: runningWithEstimate,
        hasPlanned: dayPlanned,
      });
    }

    out.push({
      ym,
      days,
      openingCents,
      closingCents: running,
      closingWithEstimateCents: runningWithEstimate,
      inCents,
      outCents,
      bookedOutCents,
      estimatedOutCents,
      netCents: running - openingCents,
      hasPlanned,
    });
  }

  return out;
}
