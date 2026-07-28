/**
 * Hábitos derivados da timeline — sem motor paralelo.
 */

import { monthCoverage } from '@/core/forecast';
import type { TimelineMonth } from '@/core/timeline';

const MIN_COVERAGE = 0.8;

export type OutflowSparkPoint = {
  ym: string;
  bookedOutCents: number;
};

/**
 * Últimos meses fechados cobertos o bastante para servir de base visual.
 * Sem estimado — mesma régua de `compareToAverage`.
 */
export function sparklineOutflows(input: {
  months: ReadonlyArray<TimelineMonth>;
  /** Meses estritamente anteriores a este. */
  beforeYm: string;
  limit?: number;
}): OutflowSparkPoint[] {
  const limit = input.limit ?? 3;
  const closed = input.months
    .filter(
      (m) =>
        m.ym < input.beforeYm &&
        m.days.length > 0 &&
        monthCoverage(
          m.ym,
          m.days.map((d) => d.date),
        ) >= MIN_COVERAGE,
    )
    .sort((a, b) => a.ym.localeCompare(b.ym));

  return closed.slice(-limit).map((m) => ({
    ym: m.ym,
    bookedOutCents: m.bookedOutCents,
  }));
}
