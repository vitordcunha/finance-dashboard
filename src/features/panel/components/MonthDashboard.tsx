import { MoneyText } from '@/components/money/MoneyText';
import type { TimelineMonth } from '@/core/timeline';
import { cn } from '@/lib/cn';

type Props = {
  month: TimelineMonth;
  isCurrent: boolean;
  isFuture: boolean;
};

/**
 * Onde o mês começa e onde termina.
 *
 * Só isto. `Entrou`, `Saiu`, `Estimado` e `Resultado` moravam aqui e saíram: a
 * entrada agora aparece repartida em **Renda comprometida** (que diz de *quê*, não
 * só quanto), a saída em **Composição da saída** com o estimado em fatia própria,
 * e o resultado já está na régua entre os dois saldos, dois centímetros acima.
 * Quatro números repetidos com forma pior competiam com a curva pela atenção.
 *
 * Abriu e fecha são **saldo**, não fluxo — a distinção que fez o painel parecer
 * contraditório quando "sobra −2.990" e "5.104" estavam ambos certos com nome
 * enganoso.
 */
export function MonthDashboard({ month, isCurrent, isFuture }: Props) {
  const negative = month.netCents < 0;
  const closingNegative = month.closingCents < 0;

  return (
    <section className="rounded-xl border border-border bg-surface">
      {/* Em 375px a régua no meio empurrava o "fecha com" para fora da tela;
          no mobile ela desce para a própria linha. */}
      <div className="px-4 py-4">
        <div className="flex items-start justify-between gap-3">
          <Anchor label="Abriu com" cents={month.openingCents} />
          <div className="hidden flex-1 items-center pt-4 sm:flex">
            <span className="h-px flex-1 bg-border-strong" />
            <Delta negative={negative} cents={month.netCents} />
            <span className="h-px flex-1 bg-border-strong" />
          </div>
          <Anchor
            label={isFuture || isCurrent ? 'Fecha com' : 'Fechou com'}
            cents={month.closingCents}
            align="right"
            danger={closingNegative}
            emphasis
          />
        </div>
        <div className="mt-3 flex items-center sm:hidden">
          <span className="h-px flex-1 bg-border-strong" />
          <Delta negative={negative} cents={month.netCents} />
          <span className="h-px flex-1 bg-border-strong" />
        </div>
      </div>

    </section>
  );
}

function Delta({ negative, cents }: { negative: boolean; cents: number }) {
  return (
    <span
      className={cn(
        'mx-2 whitespace-nowrap rounded-full border px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.08em]',
        negative
          ? 'border-danger/40 bg-danger/10 text-danger'
          : 'border-accent/40 bg-accent-muted text-accent',
      )}
    >
      {negative ? 'queimou' : 'sobrou'} {formatShort(Math.abs(cents))}
    </span>
  );
}

function Anchor({
  label,
  cents,
  align,
  danger,
  emphasis,
}: {
  label: string;
  cents: number;
  align?: 'right';
  danger?: boolean;
  emphasis?: boolean;
}) {
  return (
    <div className={cn('min-w-0', align === 'right' && 'text-right')}>
      <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-text-muted">
        {label}
      </p>
      <p
        className={cn(
          'truncate font-display tracking-tight tabular-nums',
          emphasis ? 'text-lg font-semibold sm:text-xl' : 'text-lg',
        )}
      >
        <MoneyText cents={cents} tone={danger ? 'danger' : 'default'} />
      </p>
    </div>
  );
}

function formatShort(cents: number): string {
  return (cents / 100).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    maximumFractionDigits: 0,
  });
}
