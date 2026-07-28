import type { BandPoint, DayPoint } from '@/core/month-metrics';
import { formatBRL } from '@/core/money';
import type { TimelineMonth } from '@/core/timeline';
import { BalanceByDayChart } from '@/features/panel/components/BalanceByDayChart';
import { MinimumControl } from '@/features/panel/components/MinimumControl';
import { MonthDashboard } from '@/features/panel/components/MonthDashboard';
import { PaceSimulator } from '@/features/panel/components/PaceSimulator';

type Props = {
  month: TimelineMonth;
  points: DayPoint[];
  minimumCents: number;
  lowest: DayPoint | null;
  isCurrent: boolean;
  isFuture: boolean;
  onSelectDay?: (date: string) => void;
  band?: BandPoint[] | null;
  /** Pior fundo da faixa — o cenário que a mediana esconde. */
  bandWorstCents?: number | null;
  baselineDailyCents: number;
  activeDailyCents: number;
  onPaceChange: (dailyCents: number | null) => void;
  /** Fundo do poço à frente no cenário em vigor e no do histórico. */
  lowestAhead: { cents: number; day: number } | null;
  baselineLowestAhead: { cents: number; day: number } | null;
};

/**
 * Trajetória do caixa: curva + faixa + simulador + colchão + abriu/fecha.
 *
 * Uma seção só — a prova visual de por que o herói é aquele número, e o único
 * lugar onde dá para mexer nele. O simulador fica **embaixo** da curva porque a
 * ordem de leitura é "o que vai acontecer" → "o que muda se eu mudar".
 */
export function TrajectorySection({
  month,
  points,
  minimumCents,
  lowest,
  isCurrent,
  isFuture,
  onSelectDay,
  band,
  bandWorstCents,
  baselineDailyCents,
  activeDailyCents,
  onPaceChange,
  lowestAhead,
  baselineLowestAhead,
}: Props) {
  return (
    <section className="space-y-2">
      <p className="px-1 font-mono text-[10px] uppercase tracking-[0.1em] text-text-muted">
        Como o saldo caminha
      </p>
      <BalanceByDayChart
        points={points}
        minimumCents={minimumCents}
        lowest={lowest}
        band={band}
        onSelectDay={onSelectDay}
      />

      {/* O piso da faixa é o cenário que decide, e a curva central o esconde. */}
      {band && bandWorstCents != null && lowest ? (
        <p className="px-1 text-[11px] leading-snug text-text-muted">
          No teto da faixa o menor saldo à frente cai para{' '}
          <span className="tabular-nums text-text">
            {formatBRL(bandWorstCents)}
          </span>{' '}
          — a base é curta, então trate a curva como ordem de grandeza.
        </p>
      ) : null}

      {!isFuture ? (
        <PaceSimulator
          baselineDailyCents={baselineDailyCents}
          valueDailyCents={activeDailyCents}
          onChange={onPaceChange}
          lowestAheadCents={lowestAhead?.cents ?? null}
          baselineLowestCents={baselineLowestAhead?.cents ?? null}
          lowestDay={lowestAhead?.day ?? null}
          minimumCents={minimumCents}
        />
      ) : null}

      <MinimumControl cents={minimumCents} />
      <MonthDashboard month={month} isCurrent={isCurrent} isFuture={isFuture} />
    </section>
  );
}
