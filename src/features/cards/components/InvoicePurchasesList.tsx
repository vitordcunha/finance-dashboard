import { MoneyText } from '@/components/money/MoneyText';
import { EmptyState } from '@/components/ui/EmptyState';
import { Panel } from '@/components/ui/Panel';
import { formatMonthShort } from '@/core/month';
import type { Transaction } from '@/types/models';
import { ShoppingBag } from 'lucide-react';

type InvoicePurchasesListProps = {
  purchases: Transaction[];
  ym: string;
};

export function InvoicePurchasesList({
  purchases,
  ym,
}: InvoicePurchasesListProps) {
  if (purchases.length === 0) {
    return (
      <EmptyState
        icon={ShoppingBag}
        title="Nenhuma compra nesta fatura"
        description={`Não há lançamentos de crédito com competence ${formatMonthShort(ym)}.`}
      />
    );
  }

  return (
    <Panel>
      <div className="border-b border-border px-4 py-3">
        <p className="font-mono text-[11px] uppercase tracking-[0.12em] text-text-muted">
          Compras da fatura
        </p>
      </div>
      <ul className="divide-y divide-border">
        {purchases.map((tx) => (
          <li
            key={tx.id}
            className="flex items-center justify-between gap-3 px-4 py-3"
          >
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-text">
                {tx.description || 'Sem descrição'}
              </p>
              <p className="text-xs text-text-muted tabular-nums">{tx.date}</p>
            </div>
            <MoneyText cents={tx.amountCents} className="shrink-0 text-sm" />
          </li>
        ))}
      </ul>
    </Panel>
  );
}
