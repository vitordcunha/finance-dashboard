import { MoneyText } from '@/components/money/MoneyText';
import type { IncomeSplit } from '@/core/month-metrics';
import { formatBRL } from '@/core/money';
import { cn } from '@/lib/cn';

type Props = {
  income: IncomeSplit;
};

/**
 * A entrada do mês repartida — quanto já tem dono antes de você decidir nada.
 *
 * Substitui `Saídas ÷ entradas: 77%`, que era a mesma ideia sem dizer *de quê*:
 * um mês em que 77% é aluguel e um em que 77% é delivery pedem decisões opostas
 * e liam igual. O comprometido aqui é só compromisso + fatura; o variável fica em
 * fatia própria porque é a única parte sobre a qual dá para agir hoje.
 *
 * Part-to-whole, então **um tom em quatro intensidades** — a cor não carrega
 * identidade, o rótulo ao lado carrega. `livre` é a exceção: ganha o acento
 * porque é a resposta, não mais uma parcela.
 */
export function IncomeSplitBar({ income }: Props) {
  const { incomeCents, fixedCents, settlementCents, variableCents, freeCents } =
    income;
  const committedPct = income.committedBps / 100;
  const negative = freeCents < 0;

  const slices = [
    { key: 'fixed', label: 'Compromisso', cents: fixedCents, fill: 'bg-expense' },
    { key: 'settlement', label: 'Fatura', cents: settlementCents, fill: 'bg-expense/55' },
    { key: 'variable', label: 'Variável', cents: variableCents, fill: 'bg-expense/28' },
    {
      key: 'free',
      label: negative ? 'Faltou' : 'Livre',
      cents: Math.abs(freeCents),
      fill: negative ? 'bg-danger/70' : 'bg-accent/70',
    },
  ].filter((s) => s.cents > 0);

  // Base é a entrada; quando a saída passa a entrada, a barra cresce além dela e
  // as fatias têm de somar o total real, senão a proporção mente.
  const total = Math.max(
    incomeCents,
    fixedCents + settlementCents + variableCents + Math.abs(freeCents),
  );

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
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-text-muted">
          Renda comprometida
        </p>
        <p className="text-[11px] text-text-muted">
          de{' '}
          <MoneyText cents={incomeCents} className="text-[11px] text-text" /> que
          entram
        </p>
      </div>

      <p className="mt-1 flex items-baseline gap-2">
        <span
          className={cn(
            'font-display text-2xl font-semibold tabular-nums tracking-tight',
            committedPct >= 80 ? 'text-warning' : 'text-text',
          )}
        >
          {committedPct.toFixed(0)}%
        </span>
        <span className="text-[11px] leading-snug text-text-muted">
          já tem dono antes de qualquer decisão
        </span>
      </p>

      <div className="mt-2.5 flex h-2.5 gap-0.5 overflow-hidden rounded-full">
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
            <span
              className={cn(
                'tabular-nums',
                s.key === 'free' && !negative && 'text-accent',
                s.key === 'free' && negative && 'text-danger',
                s.key !== 'free' && 'text-text',
              )}
            >
              {formatBRL(s.cents)}
            </span>{' '}
            <span className="font-mono tabular-nums">({s.pct}%)</span>
          </span>
        ))}
      </div>

      {negative ? (
        <p className="mt-2 border-t border-border/70 pt-2 text-[11px] leading-snug text-danger">
          O mês gasta mais do que entra — a diferença sai do saldo que já existia.
        </p>
      ) : null}
    </div>
  );
}
