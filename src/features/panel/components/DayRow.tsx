import { MoneyText } from '@/components/money/MoneyText';
import type { TimelineDay, TimelineEvent } from '@/core/timeline';
import { cn } from '@/lib/cn';

const WEEKDAY = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];

function weekday(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return WEEKDAY[new Date(y!, m! - 1, d!).getDay()] ?? '';
}

function balanceText(cents: number): string {
  return (cents / 100).toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

type Props = {
  day: TimelineDay;
  categoryNameById: Map<string, string>;
  isToday?: boolean;
  onSelect?: (event: TimelineEvent) => void;
};

/**
 * Um dia e o saldo depois dele.
 *
 * No mobile o saldo desce para baixo do dia — em 375px a coluna própria
 * espremia a descrição a ponto de "N.T. DELL OSBEL" virar "N.T. DELL…".
 * Dia previsto ganha hachura: a diferença para o realizado é textura, não cor.
 */
export function DayRow({ day, categoryNameById, isToday, onSelect }: Props) {
  const allPlanned = day.events.every((e) => e.kind !== 'actual');
  const negative = day.balanceCents < 0;

  return (
    <li
      id={`statement-day-${day.date}`}
      data-date={day.date}
      className={cn(
        'grid grid-cols-[52px_1fr] gap-3 px-3 py-2.5 sm:grid-cols-[46px_1fr_96px] sm:px-4',
        'border-b border-border last:border-b-0',
        allPlanned &&
          'bg-[repeating-linear-gradient(135deg,transparent,transparent_7px,rgb(255_255_255/0.014)_7px,rgb(255_255_255/0.014)_14px)]',
        isToday && 'bg-accent-muted',
      )}
    >
      <div className="pt-0.5">
        <span className="block font-mono text-[10px] uppercase tracking-[0.06em] text-text-muted">
          {weekday(day.date)}
        </span>
        <span
          className={cn(
            'block font-display text-sm tabular-nums',
            isToday ? 'font-semibold text-accent' : 'text-text',
          )}
        >
          {day.date.slice(8)}
        </span>
        <span
          className={cn(
            'mt-0.5 block text-[10px] tabular-nums sm:hidden',
            negative ? 'text-danger' : 'text-text-muted',
          )}
        >
          {balanceText(day.balanceCents)}
        </span>
      </div>

      <ul className="min-w-0 space-y-0.5">
        {day.events.map((event) => {
          // Estimado é média do histórico: não é lançamento de ninguém.
          const openable = Boolean(onSelect) && event.kind !== 'forecast';

          return (
            <li key={event.id}>
              <div
                className={cn(
                  '-mx-1 flex items-baseline gap-2 rounded px-1 py-1',
                  openable &&
                    'cursor-pointer hover:bg-surface-hover focus-within:bg-surface-hover',
                )}
                {...(openable
                  ? {
                      role: 'button' as const,
                      tabIndex: 0,
                      onClick: () => onSelect!(event),
                      onKeyDown: (e: React.KeyboardEvent) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          onSelect!(event);
                        }
                      },
                    }
                  : {})}
              >
                <span className="min-w-0 flex-1 truncate text-[13px] text-text">
                  {event.label}
                  {event.categoryId ? (
                    <span className="text-text-muted">
                      {' · '}
                      {categoryNameById.get(event.categoryId) ?? 'Sem categoria'}
                    </span>
                  ) : null}
                  <EventTag event={event} />
                </span>
                <MoneyText
                  cents={event.nominalCents}
                  signed
                  tone={event.nominalCents > 0 ? 'income' : 'default'}
                  className={cn(
                    'w-[92px] shrink-0 text-right text-[13px] tabular-nums',
                    (event.kind !== 'actual' || event.cashless) &&
                      'text-text-muted',
                  )}
                />
              </div>
            </li>
          );
        })}
      </ul>

      <span
        className={cn(
          'hidden pt-0.5 text-right text-xs tabular-nums sm:block',
          negative ? 'text-danger' : 'text-text-muted',
        )}
      >
        {balanceText(day.balanceCents)}
      </span>
    </li>
  );
}

function EventTag({ event }: { event: TimelineEvent }) {
  // Compra no cartão vira dívida hoje e caixa só no pagamento da fatura. Sem
  // dizer isso, a linha parece um gasto que não mexeu no saldo — um bug.
  const cartao = event.cashless ? (
    <span
      className={cn(
        'ml-1.5 inline-flex whitespace-nowrap rounded border px-1 py-px',
        'border-border-strong font-mono text-[9px] uppercase tracking-[0.06em] text-text-muted',
      )}
      title="Entra no caixa quando a fatura for paga"
    >
      cartão
    </span>
  ) : null;

  if (event.kind === 'actual') return cartao;

  const overdue = Boolean(event.overdue);
  const label = overdue
    ? 'atrasado'
    : event.kind === 'forecast'
      ? 'estimado'
      : 'previsto';

  return (
    <>
      <span
        className={cn(
          'ml-1.5 inline-flex items-center gap-1 whitespace-nowrap rounded border px-1 py-px',
          'font-mono text-[9px] uppercase tracking-[0.06em]',
          overdue
            ? 'border-danger/40 bg-danger/10 text-danger'
            : 'border-border-strong text-text-muted',
        )}
      >
        {event.seriesId ? <span aria-hidden>↻</span> : null}
        {label}
      </span>
      {cartao}
    </>
  );
}
