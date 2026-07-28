import { formatBRL } from '@/core/money';
import type { MonthMetrics } from '@/core/month-metrics';
import { PaceCompare } from '@/features/panel/components/PaceCompare';
import { cn } from '@/lib/cn';

type Phase = 'past' | 'current' | 'future';

type Props = {
  metrics: MonthMetrics;
  phase: Phase;
  minimumCents: number;
  /** Saldo de fechamento — herói do mês passado / futuro sem livre. */
  closingCents: number;
  netCents: number;
};

function dayLabel(iso: string): string {
  return `dia ${Number(iso.slice(8, 10))}`;
}

/**
 * Herói do mês: a pergunta que abre o app.
 *
 * Corrente → quanto ainda cabe. Passado/futuro → fechou / fecha com.
 * PaceCompare cola embaixo para a linha de raciocínio continuar no /dia.
 */
export function HeroSpendable({
  metrics: m,
  phase,
  minimumCents,
  closingCents,
  netCents,
}: Props) {
  const hasCushion = minimumCents > 0;
  const belowWord = hasCushion ? 'abaixo do colchão' : 'no vermelho';

  if (phase === 'past') {
    const neg = closingCents < 0;
    return (
      <section className="space-y-2">
        <HeroBlock
          label="Fechou com"
          value={formatBRL(closingCents)}
          tone={neg ? 'danger' : 'default'}
          hint={
            netCents === 0
              ? 'Mês empatado'
              : netCents < 0
                ? `Queimou ${formatBRL(Math.abs(netCents))} no mês`
                : `Sobrou ${formatBRL(netCents)} no mês`
          }
        />
        <PaceCompare metrics={m} phase={phase} layout="stack" />
      </section>
    );
  }

  if (phase === 'future' && m.freeToSpendCents == null) {
    return (
      <section className="space-y-2">
        <HeroBlock
          label="Fecha com"
          value={formatBRL(closingCents)}
          tone={closingCents < 0 ? 'danger' : 'default'}
          hint="Projeção com o que está cadastrado e o estimado"
        />
        <PaceCompare metrics={m} phase={phase} layout="stack" />
      </section>
    );
  }

  if (m.freeToSpendCents == null) return null;

  const negative = m.freeToSpendCents < 0;
  const hint = negative
    ? [
        `Mantendo o previsto, o saldo fica ${belowWord}`,
        m.firstBelowAhead
          ? ` no ${dayLabel(m.firstBelowAhead)}`
          : m.firstBelowMinimum
            ? ` (já no ${dayLabel(m.firstBelowMinimum)})`
            : '',
        m.daysUntilBelow != null && m.daysUntilBelow > 0
          ? ` — em ${m.daysUntilBelow} dias`
          : m.daysUntilBelow === 0
            ? ' — a partir de hoje'
            : '',
        '.',
      ].join('')
    : m.safeDailyCents != null
      ? `${formatBRL(m.safeDailyCents)} por dia nos ${m.daysLeft} dias que faltam${
          hasCushion ? ', sem furar o colchão' : ''
        }.`
      : hasCushion
        ? 'Sem furar o colchão até o fim do mês.'
        : 'Até o fim do mês.';

  return (
    <section className="space-y-2">
      <HeroBlock
        label={
          negative
            ? hasCushion
              ? 'Falta para o colchão'
              : 'Vai faltar'
            : 'Livre para gastar'
        }
        value={formatBRL(Math.abs(m.freeToSpendCents))}
        tone={negative ? 'danger' : 'accent'}
        hint={hint}
      />
      <PaceCompare metrics={m} phase={phase} layout="stack" />
    </section>
  );
}

function HeroBlock({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint: string;
  tone: 'default' | 'accent' | 'danger';
}) {
  return (
    <div
      className={cn(
        'rounded-xl border bg-surface px-4 py-4',
        tone === 'danger'
          ? 'border-danger/30'
          : tone === 'accent'
            ? 'border-accent/30'
            : 'border-border',
      )}
    >
      <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-text-muted">
        {label}
      </p>
      <p
        className={cn(
          'mt-1 font-display text-3xl font-semibold tracking-tight tabular-nums',
          tone === 'danger'
            ? 'text-danger'
            : tone === 'accent'
              ? 'text-accent'
              : 'text-text',
        )}
      >
        {value}
      </p>
      <p className="mt-1.5 text-[12px] leading-snug text-text-muted">{hint}</p>
    </div>
  );
}
