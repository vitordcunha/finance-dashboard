import { formatBRL } from '@/core/money';
import { cn } from '@/lib/cn';
import type { Transaction, TransactionKind } from '@/types/models';

export type RecentShortcut = {
  key: string;
  kind: TransactionKind;
  description: string;
  amountCents: number;
  accountId: string | null;
  personId: string | null;
  categoryId: string | null;
  transferAccountId: string | null;
};

type Props = {
  items: RecentShortcut[];
  onPick: (item: RecentShortcut) => void;
  className?: string;
};

/** Deduplica recentes por descrição+kind+conta — atalhos reutilizáveis na captura. */
export function buildRecentShortcuts(
  transactions: readonly Transaction[],
  limit = 4,
): RecentShortcut[] {
  const seen = new Set<string>();
  const out: RecentShortcut[] = [];

  for (const tx of transactions) {
    if (!tx.description.trim()) continue;
    const key = `${tx.kind}|${tx.description.trim().toLowerCase()}|${tx.accountId ?? ''}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      key,
      kind: tx.kind,
      description: tx.description.trim(),
      amountCents: tx.amountCents,
      accountId: tx.accountId,
      personId: tx.personId,
      categoryId: tx.categoryId,
      transferAccountId: tx.transferAccountId,
    });
    if (out.length >= limit) break;
  }

  return out;
}

export function RecentShortcuts({ items, onPick, className }: Props) {
  if (items.length === 0) return null;

  return (
    <div className={cn('space-y-1.5', className)}>
      <p className="text-[11px] font-medium text-text-muted">Recentes</p>
      <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-0.5">
        {items.map((item) => (
          <button
            key={item.key}
            type="button"
            onClick={() => onPick(item)}
            className={cn(
              'shrink-0 rounded-lg border border-border bg-bg px-3 py-2 text-left',
              'transition-colors hover:border-border-strong hover:bg-surface-hover',
            )}
          >
            <span className="block max-w-[9.5rem] truncate text-[12px] font-medium text-text">
              {item.description}
            </span>
            <span
              className={cn(
                'mt-0.5 block text-[11px] tabular-nums',
                item.kind === 'income' ? 'text-income' : 'text-text-muted',
              )}
            >
              {formatBRL(item.amountCents)}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
