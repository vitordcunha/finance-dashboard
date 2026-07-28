import { useEffect, useRef } from 'react';
import { formatMonth } from '@/core/month';
import type { TimelineMonth } from '@/core/timeline';
import { cn } from '@/lib/cn';

type Props = {
  months: TimelineMonth[];
  selectedYm: string;
  currentYm: string;
  onSelect: (ym: string) => void;
};

function shortMonth(ym: string): string {
  return formatMonth(ym, 'MMM').replace('.', '');
}

/** Milhares com sinal, sem centavos: a fita compara, não presta contas. */
function compact(cents: number): string {
  const reais = cents / 100;
  const sign = reais > 0 ? '+' : reais < 0 ? '−' : '';
  const abs = Math.abs(reais);
  if (abs >= 1000) return `${sign}${(abs / 1000).toFixed(1).replace('.', ',')}k`;
  return `${sign}${Math.round(abs)}`;
}

/**
 * Todos os meses de relance, para escolher qual abrir.
 *
 * Resultado do mês é polaridade, não identidade: a barra cresce a partir de uma
 * linha zero e o rótulo leva sinal. Quem não distingue verde de vermelho lê pela
 * posição e pelo sinal, sem depender da cor.
 */
export function MonthStrip({ months, selectedYm, currentYm, onSelect }: Props) {
  const scroller = useRef<HTMLDivElement>(null);
  const selectedRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    selectedRef.current?.scrollIntoView({
      inline: 'center',
      block: 'nearest',
      behavior: 'smooth',
    });
  }, [selectedYm]);

  const peak = Math.max(1, ...months.map((m) => Math.abs(m.netCents)));

  return (
    <div
      ref={scroller}
      className="-mx-4 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0"
      role="tablist"
      aria-label="Meses"
    >
      <div className="flex min-w-max gap-1">
        {months.map((month) => {
          const selected = month.ym === selectedYm;
          const isCurrent = month.ym === currentYm;
          const positive = month.netCents >= 0;
          const height = Math.round((Math.abs(month.netCents) / peak) * 26);

          return (
            <button
              key={month.ym}
              ref={selected ? selectedRef : undefined}
              type="button"
              role="tab"
              aria-selected={selected}
              onClick={() => onSelect(month.ym)}
              className={cn(
                'w-[62px] shrink-0 rounded-lg border px-1 py-2 transition-colors',
                selected
                  ? 'border-accent/50 bg-accent-muted'
                  : 'border-transparent hover:bg-surface-hover',
              )}
            >
              <span
                className={cn(
                  'block font-mono text-[10px] uppercase tracking-[0.08em]',
                  selected
                    ? 'text-accent'
                    : isCurrent
                      ? 'text-text'
                      : 'text-text-muted',
                )}
              >
                {shortMonth(month.ym)}
              </span>

              {/* Eixo zero no meio: acima sobrou, abaixo faltou. */}
              <span className="mt-1.5 flex h-[56px] flex-col items-center justify-center">
                <span className="flex h-[26px] w-full items-end justify-center">
                  {positive ? (
                    <span
                      className="w-4 rounded-t-[3px] bg-accent"
                      style={{ height: `${Math.max(height, 2)}px` }}
                    />
                  ) : null}
                </span>
                <span className="h-px w-full bg-border-strong" />
                <span className="flex h-[26px] w-full items-start justify-center">
                  {!positive ? (
                    <span
                      className="w-4 rounded-b-[3px] bg-danger"
                      style={{ height: `${Math.max(height, 2)}px` }}
                    />
                  ) : null}
                </span>
              </span>

              <span
                className={cn(
                  'mt-1 block text-[10px] tabular-nums',
                  positive ? 'text-text-muted' : 'text-danger',
                )}
              >
                {compact(month.netCents)}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
