import type { ApplicableForecast, VariableForecast } from '@/core/forecast';
import { formatBRL } from '@/core/money';
import type {
  Burnup,
  IncomeSplit,
  InvoiceRunway,
  MonthMetrics,
  OutflowSparkPoint,
} from '@/core/month-metrics';
import { BurnupChart } from '@/features/panel/components/BurnupChart';
import { ForecastNotice } from '@/features/panel/components/ForecastNotice';
import { IncomeSplitBar } from '@/features/panel/components/IncomeSplitBar';
import { InvoiceRunwayChart } from '@/features/panel/components/InvoiceRunwayChart';
import { MetricTile } from '@/features/panel/components/MetricTile';

type Phase = 'past' | 'current' | 'future';

type Props = {
  metrics: MonthMetrics;
  phase: Phase;
  comparison: { averageOutCents: number; deltaBps: number } | null;
  sparkline: OutflowSparkPoint[];
  forecast: VariableForecast | null;
  /** O recorte do estimado que vale para este mês. */
  applicableForecast: ApplicableForecast | null;
  ym: string;
  categoryNameById: Map<string, string>;
  burnup: Burnup | null;
  /** "estimado" ou "simulado" — a reta muda de significado com o slider. */
  burnupBudgetLabel?: string;
  income: IncomeSplit | null;
  runway: InvoiceRunway | null;
  onSelectMonth?: (ym: string) => void;
};

function dayLabel(iso: string): string {
  return `dia ${Number(iso.slice(8, 10))}`;
}

/**
 * Como você vem gastando — hábito, estimado e comparação.
 */
export function HabitsSection({
  metrics: m,
  phase,
  comparison,
  sparkline,
  forecast,
  applicableForecast,
  ym,
  categoryNameById,
  burnup,
  burnupBudgetLabel,
  income,
  runway,
  onSelectMonth,
}: Props) {
  const tiles: React.ReactNode[] = [];

  // `Estimado à frente` saiu daqui: o mesmo número já aparece no rodapé da barra
  // de renda, na nota do estimado, no comparativo por dia, no simulador e como
  // linha tracejada no gráfico. O estimado é **alerta** — repeti-lo mais que
  // qualquer número real invertia a hierarquia que a tela deveria ter.

  if (m.biggestExpense) {
    tiles.push(
      <MetricTile
        key="biggest"
        label="Maior saída"
        value={formatBRL(m.biggestExpense.cents)}
        hint={`${m.biggestExpense.label} · ${dayLabel(m.biggestExpense.date)}`}
      />,
    );
  }

  if (comparison) {
    const pct = comparison.deltaBps / 100;
    const worse = pct > 0;
    tiles.push(
      <MetricTile
        key="vs"
        label="Contra a média"
        tone={Math.abs(pct) < 5 ? 'default' : worse ? 'warning' : 'accent'}
        value={`${worse ? '+' : '−'}${Math.abs(pct).toFixed(0)}%`}
        hint={`Média de saída: ${formatBRL(comparison.averageOutCents)}`}
      />,
    );
  }

  const compositionTotal =
    m.fixedOutCents +
    m.settlementOutCents +
    m.variableOutCents +
    m.estimatedOutCents;

  if (
    tiles.length === 0 &&
    compositionTotal <= 0 &&
    sparkline.length === 0 &&
    !burnup &&
    !income &&
    !runway &&
    !(forecast && phase !== 'past')
  ) {
    return null;
  }

  return (
    <section className="space-y-2">
      <p className="px-1 font-mono text-[10px] uppercase tracking-[0.1em] text-text-muted">
        Como você vem gastando
      </p>

      {/* Renda comprometida antes dos tiles: é a leitura de contexto que faz o
          resto significar algo. 60% comprometido muda o peso de todo número abaixo. */}
      {income ? <IncomeSplitBar income={income} /> : null}

      {burnup ? (
        <BurnupChart burnup={burnup} budgetLabel={burnupBudgetLabel} />
      ) : null}

      {tiles.length > 0 ? (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">{tiles}</div>
      ) : null}

      {sparkline.length > 0 ? <OutflowSparkline points={sparkline} /> : null}

      {runway ? (
        <InvoiceRunwayChart runway={runway} onSelect={onSelectMonth} />
      ) : null}

      <ForecastNotice
        forecast={forecast}
        applicable={applicableForecast}
        ym={ym}
        relevant={phase !== 'past'}
        categoryNameById={categoryNameById}
      />
    </section>
  );
}

function OutflowSparkline({ points }: { points: OutflowSparkPoint[] }) {
  const max = Math.max(...points.map((p) => p.bookedOutCents), 1);
  return (
    <div className="rounded-xl border border-border bg-surface p-3">
      <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-text-muted">
        Saída nos meses fechados
      </p>
      <div className="mt-3 flex items-end gap-2">
        {points.map((p) => {
          const h = Math.max(8, Math.round((p.bookedOutCents / max) * 48));
          const month = Number(p.ym.slice(5, 7));
          return (
            <div key={p.ym} className="flex min-w-0 flex-1 flex-col items-center gap-1">
              <span className="font-mono text-[9px] tabular-nums text-text-muted">
                {formatBRL(p.bookedOutCents)}
              </span>
              <div
                className="w-full max-w-10 rounded-t-md bg-expense/50"
                style={{ height: h }}
                title={formatBRL(p.bookedOutCents)}
              />
              <span className="font-mono text-[10px] text-text-muted">{month}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
