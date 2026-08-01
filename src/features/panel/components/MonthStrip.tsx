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
 * **É navegação, não gráfico.** A versão anterior desenhava uma barra por mês a
 * partir de um eixo zero, ocupando 80px de altura no lugar mais valioso da tela —
 * acima do herói — para codificar o resultado do mês. Só que os resultados são
 * todos parecidos (+7k a +8,9k na janela real), então as catorze barras tinham
 * praticamente a mesma altura: muita área, nenhuma comparação. O sinal do número
 * já diz o que a barra dizia, e a trajetória acumulada em "Entender o mês" mostra a
 * forma de verdade.
 *
 * O sinal vem no texto, não só na cor: quem não distingue verde de vermelho lê.
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

          return (
            <button
              key={month.ym}
              ref={selected ? selectedRef : undefined}
              type="button"
              role="tab"
              aria-selected={selected}
              onClick={() => onSelect(month.ym)}
              className={cn(
                'shrink-0 rounded-lg border px-2.5 py-1.5 transition-colors',
                selected
                  ? 'border-accent/50 bg-accent-muted'
                  : 'border-border/60 hover:bg-surface-hover',
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
              <span
                className={cn(
                  'mt-0.5 block text-[11px] tabular-nums',
                  selected
                    ? 'text-text'
                    : positive
                      ? 'text-text-muted'
                      : 'text-danger',
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
