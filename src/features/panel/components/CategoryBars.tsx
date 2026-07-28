import { useState } from 'react';
import { MoneyText } from '@/components/money/MoneyText';
import { Sheet } from '@/components/ui/Sheet';
import type { TimelineEvent, TimelineMonth } from '@/core/timeline';
import { formatShortDate } from '@/features/panel/components/EntrySheetFields';
import { cn } from '@/lib/cn';

type Props = {
  month: TimelineMonth;
  categoryNameById: Map<string, string>;
  limit?: number;
  /** Abre o lançamento no sheet de edição, quando existir ocorrência. */
  onSelectEvent?: (event: TimelineEvent) => void;
};

type Bucket = {
  name: string;
  cents: number;
  events: TimelineEvent[];
};

type Slice = {
  /** Chave estável: nome da categoria, ou `__others__`. */
  key: string;
  name: string;
  cents: number;
  /** Baldes que alimentam esta fatia (vários em “Outras”). */
  bucketNames: string[];
};

function bucketName(
  event: TimelineEvent,
  categoryNameById: Map<string, string>,
): string {
  if (event.kind === 'forecast') return 'Estimado';
  if (event.categoryId) {
    return categoryNameById.get(event.categoryId) ?? 'Sem categoria';
  }
  return 'Sem categoria';
}

/**
 * Para onde foi o dinheiro do mês.
 *
 * Uma série só, um tom só: a cor aqui não carrega identidade — quem identifica
 * é o rótulo ao lado da barra. Por isso também não há legenda.
 *
 * O estimado entra como fatia própria (“Estimado”): omiti-lo fazia “Saiu” e a
 * barra discordarem em mês futuro.
 *
 * Toque na categoria → sheet com os lançamentos que somam aquele valor.
 */
export function CategoryBars({
  month,
  categoryNameById,
  limit = 6,
  onSelectEvent,
}: Props) {
  const [openKey, setOpenKey] = useState<string | null>(null);

  const byBucket = new Map<string, Bucket>();

  for (const day of month.days) {
    for (const event of day.events) {
      if (event.deltaCents >= 0) continue;
      const name = bucketName(event, categoryNameById);
      const cur = byBucket.get(name) ?? { name, cents: 0, events: [] };
      cur.cents += -event.deltaCents;
      cur.events.push(event);
      byBucket.set(name, cur);
    }
  }

  const all = [...byBucket.values()].sort((a, b) => b.cents - a.cents);
  if (all.length === 0) return null;

  const head = all.slice(0, limit);
  const tail = all.slice(limit);
  const slices: Slice[] =
    tail.length > 0
      ? [
          ...head.map((b) => ({
            key: b.name,
            name: b.name,
            cents: b.cents,
            bucketNames: [b.name],
          })),
          {
            key: '__others__',
            name: `Outras ${tail.length}`,
            cents: tail.reduce((s, c) => s + c.cents, 0),
            bucketNames: tail.map((b) => b.name),
          },
        ]
      : head.map((b) => ({
          key: b.name,
          name: b.name,
          cents: b.cents,
          bucketNames: [b.name],
        }));

  const total = all.reduce((s, c) => s + c.cents, 0);
  const peak = Math.max(...slices.map((s) => s.cents));

  const openSlice = slices.find((s) => s.key === openKey) ?? null;
  const openEvents = openSlice
    ? openSlice.bucketNames
        .flatMap((name) => byBucket.get(name)?.events ?? [])
        .sort((a, b) => {
          if (a.date !== b.date) return a.date < b.date ? 1 : -1;
          return b.id.localeCompare(a.id);
        })
    : [];
  const showBucketLabel = (openSlice?.bucketNames.length ?? 0) > 1;

  return (
    <>
      <section className="rounded-xl border border-border bg-surface p-4">
        <h3 className="font-mono text-[10px] uppercase tracking-[0.12em] text-text-muted">
          Para onde foi
        </h3>
        <ul className="mt-3 space-y-2.5">
          {slices.map((slice) => (
            <li key={slice.key}>
              <button
                type="button"
                onClick={() => setOpenKey(slice.key)}
                aria-haspopup="dialog"
                className="-mx-1 w-[calc(100%+0.5rem)] rounded-md px-1 py-0.5 text-left hover:bg-surface-hover"
              >
                <div className="flex items-baseline justify-between gap-3">
                  <span className="min-w-0 truncate text-[13px] text-text">
                    {slice.name}
                  </span>
                  <span className="flex shrink-0 items-baseline gap-2">
                    <span className="font-mono text-[10px] tabular-nums text-text-muted">
                      {Math.round((slice.cents / total) * 100)}%
                    </span>
                    <MoneyText
                      cents={slice.cents}
                      className="text-[13px] tabular-nums"
                    />
                  </span>
                </div>
                <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-bg">
                  <div
                    className="h-full rounded-full bg-expense"
                    style={{
                      width: `${Math.max((slice.cents / peak) * 100, 2)}%`,
                    }}
                  />
                </div>
              </button>
            </li>
          ))}
        </ul>
      </section>

      <Sheet
        open={openSlice != null}
        onClose={() => setOpenKey(null)}
        title={openSlice?.name ?? ''}
      >
        {openSlice ? (
          <div className="space-y-3">
            <p className="text-[12px] text-text-muted">
              {openEvents.length}{' '}
              {openEvents.length === 1 ? 'lançamento' : 'lançamentos'} ·{' '}
              <MoneyText
                cents={openSlice.cents}
                className="text-[12px] text-text"
              />
            </p>

            {openEvents.length === 0 ? (
              <p className="rounded-lg border border-border bg-bg px-3 py-4 text-[13px] text-text-muted">
                Nenhum lançamento nesta categoria.
              </p>
            ) : (
              <ul className="-mx-1">
                {openEvents.map((event) => {
                  const openable =
                    Boolean(onSelectEvent) && event.kind !== 'forecast';
                  const cat =
                    showBucketLabel && event.kind !== 'forecast'
                      ? bucketName(event, categoryNameById)
                      : null;

                  const body = (
                    <>
                      <span className="w-14 shrink-0 font-mono text-[11px] tabular-nums text-text-muted">
                        {formatShortDate(event.date)}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-[13px] text-text">
                        {event.label}
                        {cat ? (
                          <span className="text-text-muted"> · {cat}</span>
                        ) : null}
                        <EventTag event={event} />
                      </span>
                      <MoneyText
                        cents={-event.deltaCents}
                        className={cn(
                          'w-[88px] shrink-0 text-right text-[13px] tabular-nums',
                          (event.kind !== 'actual' || event.cashless) &&
                            'text-text-muted',
                        )}
                      />
                    </>
                  );

                  return (
                    <li
                      key={event.id}
                      className="border-b border-border last:border-b-0"
                    >
                      {openable ? (
                        <button
                          type="button"
                          onClick={() => {
                            onSelectEvent?.(event);
                            setOpenKey(null);
                          }}
                          className="flex w-full items-baseline gap-2 rounded px-1 py-2 text-left hover:bg-surface-hover"
                        >
                          {body}
                        </button>
                      ) : (
                        <div className="flex w-full items-baseline gap-2 px-1 py-2">
                          {body}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        ) : null}
      </Sheet>
    </>
  );
}

function EventTag({ event }: { event: TimelineEvent }) {
  if (event.kind === 'actual') return null;

  const overdue = Boolean(event.overdue);
  const label = overdue
    ? 'atrasado'
    : event.kind === 'forecast'
      ? 'estimado'
      : 'previsto';

  return (
    <span
      className={cn(
        'ml-1.5 inline-flex whitespace-nowrap rounded border px-1 py-px',
        'font-mono text-[9px] uppercase tracking-[0.06em]',
        overdue
          ? 'border-danger/40 bg-danger/10 text-danger'
          : 'border-border-strong text-text-muted',
      )}
    >
      {label}
    </span>
  );
}
