import type { ReactNode } from 'react';
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
 * Corrente → folga de caixa (piso à frente). Passado/futuro → fechou / fecha com.
 * A sobra do mês (renda − compromissos) fica no rodapé do card — mesma pergunta
 * contábil, sem timing; não compete com o número do herói.
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
          hint="Projeção com o que está cadastrado — o estimado fica no alerta abaixo"
        />
        <PaceCompare metrics={m} phase={phase} layout="stack" />
      </section>
    );
  }

  if (m.freeToSpendCents == null) return null;

  const negative = m.freeToSpendCents < 0;
  const troughDay = m.lowestAhead ? dayLabel(m.lowestAhead.date) : null;
  const estimateHint =
    m.freeToSpendWithEstimateCents != null &&
    m.estimatedAheadCents > 0 &&
    m.freeToSpendWithEstimateCents < m.freeToSpendCents
      ? ` Se mantiver o ritmo (~${formatBRL(m.estimatedDailyCents)}/dia), a folga cai para ${formatBRL(Math.max(0, m.freeToSpendWithEstimateCents))}.`
      : '';
  const hint = negative
    ? [
        `Com os compromissos agendados, o saldo fica ${belowWord}`,
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
    : [
        troughDay ? `Piso no ${troughDay}. ` : '',
        m.safeDailyCents != null
          ? `${formatBRL(m.safeDailyCents)} por dia nos ${m.daysLeft} dias que faltam${
              hasCushion ? ', sem furar o colchão' : ''
            }.`
          : hasCushion
            ? 'Sem furar o colchão até o fim do mês.'
            : 'Até o fim do mês.',
        estimateHint,
      ].join('');

  const monthFree = m.income?.freeCents ?? null;

  return (
    <section className="space-y-2">
      <HeroBlock
        label={
          negative
            ? hasCushion
              ? 'Falta para o colchão'
              : 'Vai faltar'
            : 'Folga de caixa'
        }
        value={formatBRL(Math.abs(m.freeToSpendCents))}
        tone={negative ? 'danger' : 'accent'}
        hint={hint}
        footer={
          monthFree != null ? (
            <MonthSurplusRow freeCents={monthFree} />
          ) : null
        }
      />
      <PaceCompare metrics={m} phase={phase} layout="stack" />
    </section>
  );
}

function MonthSurplusRow({ freeCents }: { freeCents: number }) {
  const negative = freeCents < 0;
  return (
    <div className="mt-3 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 border-t border-border/70 pt-2.5">
      <div className="min-w-0">
        <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-text-muted">
          {negative ? 'Faltou no mês' : 'Sobra do mês'}
        </p>
        <p className="mt-0.5 text-[11px] leading-snug text-text-muted">
          Renda − compromissos — sem olhar o timing
        </p>
      </div>
      <p
        className={cn(
          'font-display text-lg font-semibold tabular-nums tracking-tight',
          negative ? 'text-danger' : 'text-text',
        )}
      >
        {formatBRL(Math.abs(freeCents))}
      </p>
    </div>
  );
}

function HeroBlock({
  label,
  value,
  hint,
  tone,
  footer,
}: {
  label: string;
  value: string;
  hint: string;
  tone: 'default' | 'accent' | 'danger';
  footer?: ReactNode;
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
      {footer}
    </div>
  );
}
