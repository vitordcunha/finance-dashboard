import { MoneyText } from '@/components/money/MoneyText';
import type { TimelineMonth } from '@/core/timeline';

type Props = {
  month: TimelineMonth;
  categoryNameById: Map<string, string>;
  limit?: number;
};

type Slice = { name: string; cents: number };

/**
 * Para onde foi o dinheiro do mês.
 *
 * Uma série só, um tom só: a cor aqui não carrega identidade — quem identifica
 * é o rótulo ao lado da barra. Por isso também não há legenda.
 *
 * O estimado entra como fatia própria (“Estimado”): omiti-lo fazia “Saiu” e a
 * barra discordarem em mês futuro.
 */
export function CategoryBars({ month, categoryNameById, limit = 6 }: Props) {
  const byCategory = new Map<string, number>();

  for (const day of month.days) {
    for (const event of day.events) {
      if (event.deltaCents >= 0) continue;
      const name =
        event.kind === 'forecast'
          ? 'Estimado'
          : event.categoryId
            ? (categoryNameById.get(event.categoryId) ?? 'Sem categoria')
            : 'Sem categoria';
      byCategory.set(name, (byCategory.get(name) ?? 0) + -event.deltaCents);
    }
  }

  const all: Slice[] = [...byCategory]
    .map(([name, cents]) => ({ name, cents }))
    .sort((a, b) => b.cents - a.cents);

  if (all.length === 0) return null;

  const head = all.slice(0, limit);
  const tail = all.slice(limit);
  const slices =
    tail.length > 0
      ? [
          ...head,
          {
            name: `Outras ${tail.length}`,
            cents: tail.reduce((s, c) => s + c.cents, 0),
          },
        ]
      : head;

  const total = all.reduce((s, c) => s + c.cents, 0);
  const peak = Math.max(...slices.map((s) => s.cents));

  return (
    <section className="rounded-xl border border-border bg-surface p-4">
      <h3 className="font-mono text-[10px] uppercase tracking-[0.12em] text-text-muted">
        Para onde foi
      </h3>
      <ul className="mt-3 space-y-2.5">
        {slices.map((slice) => (
          <li key={slice.name}>
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
                style={{ width: `${Math.max((slice.cents / peak) * 100, 2)}%` }}
              />
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
