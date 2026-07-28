/**
 * Agenda curta do mês — o que ainda está marcado nos próximos dias.
 *
 * Deriva só da timeline do mês aberto. Sem query nova: a pergunta é "o que
 * pesa no caixa em breve?", e a resposta já está nos eventos.
 */

import { addDays, parseISO } from 'date-fns';
import type { TimelineEvent, TimelineMonth } from '@/core/timeline';
import { outflowKind, type OutflowKind } from '@/core/month-metrics/outflow-kind';

export type UpcomingItem = {
  date: string;
  label: string;
  /** Valor absoluto em centavos. */
  cents: number;
  kind: TimelineEvent['kind'];
  flow: TimelineEvent['flow'];
  overdue: boolean;
  nature: OutflowKind | 'income';
  eventId: string;
};

function endIso(today: string, horizonDays: number): string {
  return addDays(parseISO(today), horizonDays).toISOString().slice(0, 10);
}

function eventCents(event: TimelineEvent): number {
  if (event.kind === 'forecast') return Math.abs(event.deltaCents);
  if (event.nominalCents !== 0) return Math.abs(event.nominalCents);
  return Math.abs(event.deltaCents);
}

/**
 * Eventos do mês com data em `[today, today+horizon]`.
 *
 * **Estimado fica fora.** Desde que o variável goteja por dia, incluí-lo enchia
 * a agenda de "Variável estimado −R$ 131,12" em toda linha e afogava as contas
 * de verdade. Agenda é o que você pode conferir, pagar ou remarcar; mediana do
 * histórico não é nenhuma das três. O peso dela no caixa é o gráfico que mostra.
 */
export function upcomingEvents(input: {
  month: TimelineMonth;
  today: string;
  /** Inclusivo a partir de hoje. Padrão 14. */
  horizonDays?: number;
  essentialCategoryIds?: ReadonlySet<string> | null;
}): UpcomingItem[] {
  const horizon = input.horizonDays ?? 14;
  const until = endIso(input.today, horizon);
  const essential = input.essentialCategoryIds ?? null;
  const out: UpcomingItem[] = [];

  for (const day of input.month.days) {
    if (day.date < input.today || day.date > until) continue;
    for (const event of day.events) {
      if (event.kind === 'forecast') continue;
      const abs = eventCents(event);
      if (abs === 0) continue;

      const income = event.flow === 'income' || event.deltaCents > 0;

      out.push({
        date: event.date,
        label: event.label,
        cents: abs,
        kind: event.kind,
        flow: event.flow,
        overdue: Boolean(event.overdue),
        nature: income ? 'income' : outflowKind(event, essential),
        eventId: event.id,
      });
    }
  }

  return out.sort((a, b) =>
    a.date === b.date
      ? a.label.localeCompare(b.label)
      : a.date.localeCompare(b.date),
  );
}
