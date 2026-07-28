import { formatBRL } from '@/core/money';
import type { UpcomingItem } from '@/core/month-metrics';
import { cn } from '@/lib/cn';

type Props = {
  items: UpcomingItem[];
  onSelect?: (eventId: string) => void;
};

function dayLabel(iso: string): string {
  return `dia ${Number(iso.slice(8, 10))}`;
}

/**
 * Próximos 14 dias do mês aberto — agenda curta para agir.
 */
export function UpcomingList({ items, onSelect }: Props) {
  if (items.length === 0) return null;

  return (
    <div className="rounded-xl border border-border bg-surface">
      <p className="border-b border-border px-3 py-2 font-mono text-[10px] uppercase tracking-[0.1em] text-text-muted">
        Próximos dias
      </p>
      <ul>
        {items.map((item) => {
          const openable = Boolean(item.kind !== 'forecast' && onSelect);
          const body = (
            <>
              <span className="w-12 shrink-0 font-mono text-[11px] tabular-nums text-text-muted">
                {dayLabel(item.date)}
              </span>
              <span className="min-w-0 flex-1 truncate text-text">
                {item.label}
                {item.overdue ? (
                  <span className="ml-1.5 rounded border border-danger/40 px-1 py-px font-mono text-[9px] uppercase tracking-[0.06em] text-danger">
                    atrasado
                  </span>
                ) : null}
                {item.kind === 'forecast' ? (
                  <span className="ml-1.5 rounded border border-border px-1 py-px font-mono text-[9px] uppercase tracking-[0.06em] text-text-muted">
                    estimado
                  </span>
                ) : item.kind === 'planned' && !item.overdue ? (
                  <span className="ml-1.5 rounded border border-border px-1 py-px font-mono text-[9px] uppercase tracking-[0.06em] text-text-muted">
                    previsto
                  </span>
                ) : null}
              </span>
              <span
                className={cn(
                  'shrink-0 font-display text-[13px] tabular-nums',
                  item.nature === 'income' ? 'text-accent' : 'text-text',
                )}
              >
                {item.nature === 'income' ? '+' : '−'}
                {formatBRL(item.cents)}
              </span>
            </>
          );

          return (
            <li
              key={`${item.eventId}:${item.date}`}
              className="border-b border-border last:border-b-0"
            >
              {openable ? (
                <button
                  type="button"
                  onClick={() => onSelect?.(item.eventId)}
                  className="flex w-full items-baseline gap-3 px-3 py-2 text-left text-[13px] hover:bg-surface-hover"
                >
                  {body}
                </button>
              ) : (
                <div className="flex w-full items-baseline gap-3 px-3 py-2 text-[13px]">
                  {body}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
