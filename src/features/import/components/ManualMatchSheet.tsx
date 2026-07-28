import { useState } from 'react';
import { MoneyText } from '@/components/money/MoneyText';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { Sheet } from '@/components/ui/Sheet';
import { Skeleton } from '@/components/ui/Skeleton';
import { useMatchCandidates, useMatchImportLine } from '@/features/import/hooks/useImport';
import type { ImportLine } from '@/types/models';
import { cn } from '@/lib/cn';

type Props = {
  open: boolean;
  onClose: () => void;
  line: ImportLine | null;
  batchId: string;
  accountId: string;
};

export function ManualMatchSheet({
  open,
  onClose,
  line,
  batchId,
  accountId,
}: Props) {
  const { data: candidates = [], isLoading } = useMatchCandidates(
    accountId,
    line?.postedOn,
  );
  const match = useMatchImportLine();
  const [selected, setSelected] = useState<string | null>(null);

  const sameAmount = line
    ? candidates.filter((c) => c.amountCents === line.amountCents)
    : [];
  const others = line
    ? candidates.filter((c) => c.amountCents !== line.amountCents)
    : [];

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Vincular lançamento"
      footer={
        <Button
          className="w-full"
          disabled={!selected || match.isPending || !line}
          onClick={() => {
            if (!line || !selected) return;
            void match
              .mutateAsync({
                lineId: line.id,
                batchId,
                transactionId: selected,
              })
              .then(() => {
                setSelected(null);
                onClose();
              });
          }}
        >
          Vincular
        </Button>
      }
    >
      {!line ? null : (
        <div className="space-y-4">
          <p className="text-sm text-text-muted">
            Extrato:{' '}
            <span className="text-text">{line.descriptionRaw || '—'}</span>
            {' · '}
            <MoneyText cents={line.amountCents} className="text-sm" />
          </p>

          {isLoading ? <Skeleton className="h-24 w-full" /> : null}

          {!isLoading && candidates.length === 0 ? (
            <EmptyState
              title="Nenhum lançamento perto desta data"
              description="Crie um lançamento a partir da linha ou amplie a captura."
            />
          ) : null}

          {sameAmount.length > 0 ? (
            <CandidateGroup
              title="Mesmo valor"
              items={sameAmount}
              selected={selected}
              onSelect={setSelected}
            />
          ) : null}
          {others.length > 0 ? (
            <CandidateGroup
              title="Outros na janela"
              items={others}
              selected={selected}
              onSelect={setSelected}
            />
          ) : null}
        </div>
      )}
    </Sheet>
  );
}

function CandidateGroup({
  title,
  items,
  selected,
  onSelect,
}: {
  title: string;
  items: Array<{
    id: string;
    date: string;
    description: string;
    amountCents: number;
  }>;
  selected: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="space-y-2">
      <p className="text-[11px] font-medium uppercase tracking-wide text-text-muted">
        {title}
      </p>
      <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border">
        {items.map((tx) => (
          <li key={tx.id}>
            <button
              type="button"
              onClick={() => onSelect(tx.id)}
              className={cn(
                'flex w-full items-center gap-3 px-3 py-2.5 text-left text-sm',
                'hover:bg-surface-hover',
                selected === tx.id && 'bg-accent/10',
              )}
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium text-text">
                  {tx.description}
                </span>
                <span className="text-xs text-text-muted">{tx.date}</span>
              </span>
              <MoneyText cents={tx.amountCents} className="text-sm" />
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
