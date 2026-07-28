import { MoneyText } from '@/components/money/MoneyText';
import type { VariableForecast } from '@/core/forecast';
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
import { cn } from '@/lib/cn';

type Phase = 'past' | 'current' | 'future';

type Props = {
  metrics: MonthMetrics;
  phase: Phase;
  comparison: { averageOutCents: number; deltaBps: number } | null;
  sparkline: OutflowSparkPoint[];
  forecast: VariableForecast | null;
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
  ym,
  categoryNameById,
  burnup,
  burnupBudgetLabel,
  income,
  runway,
  onSelectMonth,
}: Props) {
  const tiles: React.ReactNode[] = [];

  if (phase !== 'past' && m.estimatedAheadCents > 0) {
    tiles.push(
      <MetricTile
        key="estimated"
        label="Estimado à frente"
        value={formatBRL(m.estimatedAheadCents)}
        hint={
          m.estimatedDailyCents > 0
            ? `${formatBRL(m.estimatedDailyCents)}/dia · mediana fora do cadastrado`
            : 'Mediana do que você gasta fora do cadastrado'
        }
      />,
    );
  }

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

      {compositionTotal > 0 ? (
        <OutflowComposition
          fixedCents={m.fixedOutCents}
          settlementCents={m.settlementOutCents}
          variableCents={m.variableOutCents}
          estimatedCents={m.estimatedOutCents}
        />
      ) : null}

      {runway ? (
        <InvoiceRunwayChart runway={runway} onSelect={onSelectMonth} />
      ) : null}

      <ForecastNotice
        forecast={forecast}
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

function OutflowComposition({
  fixedCents,
  settlementCents,
  variableCents,
  estimatedCents,
}: {
  fixedCents: number;
  settlementCents: number;
  variableCents: number;
  estimatedCents: number;
}) {
  const total = fixedCents + settlementCents + variableCents + estimatedCents;
  const slices = [
    { key: 'fixed', label: 'Compromisso', cents: fixedCents, fill: 'bg-expense' },
    {
      key: 'settlement',
      label: 'Fatura',
      cents: settlementCents,
      fill: 'bg-expense/60',
    },
    {
      key: 'variable',
      label: 'Variável',
      cents: variableCents,
      fill: 'bg-expense/35',
    },
    {
      key: 'estimated',
      label: 'Estimado',
      cents: estimatedCents,
      fill: 'bg-expense/18',
    },
  ].filter((s) => s.cents > 0);

  let used = 0;
  const withPct = slices.map((s, i) => {
    const pct =
      i === slices.length - 1
        ? Math.max(0, 100 - used)
        : Math.round((s.cents / total) * 100);
    used += pct;
    return { ...s, pct };
  });

  return (
    <div className="rounded-xl border border-border bg-surface p-3">
      <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-text-muted">
        Composição da saída
      </p>
      <div className="mt-2 flex h-2.5 gap-0.5 overflow-hidden rounded-full">
        {withPct.map((s, i) => (
          <div
            key={s.key}
            className={cn(
              s.fill,
              i === 0 && 'rounded-l-full',
              i === withPct.length - 1 && 'rounded-r-full',
            )}
            style={{ width: `${s.pct}%` }}
          />
        ))}
      </div>
      <div className="mt-2 flex flex-wrap items-baseline gap-x-4 gap-y-1 text-[11px]">
        {withPct.map((s) => (
          <span key={s.key} className="text-text-muted">
            {s.label}{' '}
            <MoneyText cents={s.cents} className="text-[11px] text-text" />{' '}
            <span className="font-mono tabular-nums">({s.pct}%)</span>
          </span>
        ))}
      </div>
    </div>
  );
}
