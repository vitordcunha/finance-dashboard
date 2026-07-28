import { useState } from 'react';
import { ArrowRight } from 'lucide-react';
import { MoneyText } from '@/components/money/MoneyText';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { Sheet } from '@/components/ui/Sheet';
import { cn } from '@/lib/cn';
import type { Account } from '@/data/supabase/types';
import type { ImportLine } from '@/types/models';

const KIND_LABEL: Record<string, string> = {
  checking: 'Corrente',
  savings: 'Poupança',
  credit: 'Cartão',
  cash: 'Dinheiro',
};

type Props = {
  open: boolean;
  onClose: () => void;
  line: ImportLine | null;
  /** Conta de origem — não pode ser o destino. */
  sourceAccountId: string;
  accounts: Account[];
  busy?: boolean;
  onConfirm: (transferAccountId: string) => void;
};

/**
 * Pergunta para onde o dinheiro foi. Sem destino não existe transferência —
 * o lançamento continua sendo gasto (ver `core/transactions/transfer`).
 */
export function TransferDestinationSheet({
  open,
  onClose,
  line,
  sourceAccountId,
  accounts,
  busy,
  onConfirm,
}: Props) {
  const [selected, setSelected] = useState<string | null>(null);

  const options = accounts.filter(
    (a) => a.id !== sourceAccountId && !a.archived,
  );

  function close() {
    setSelected(null);
    onClose();
  }

  return (
    <Sheet
      open={open}
      onClose={close}
      title="Para onde foi o dinheiro?"
      footer={
        options.length > 0 ? (
          <Button
            className="w-full"
            disabled={!selected || busy}
            onClick={() => {
              if (!selected) return;
              onConfirm(selected);
              setSelected(null);
            }}
          >
            {busy ? 'Convertendo…' : 'É transferência para esta conta'}
          </Button>
        ) : null
      }
    >
      {line ? (
        <div className="mb-4 flex items-start justify-between gap-3 rounded-md border border-border bg-surface-elevated px-3.5 py-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-text">
              {line.descriptionRaw || 'Sem descrição'}
            </p>
            <p className="mt-0.5 text-xs text-text-muted">{line.postedOn}</p>
          </div>
          <MoneyText
            cents={line.amountCents}
            tone={line.kind === 'income' ? 'income' : 'expense'}
            className="shrink-0 text-sm font-medium"
          />
        </div>
      ) : null}

      {options.length === 0 ? (
        <EmptyState
          icon={ArrowRight}
          title="Sem outra conta cadastrada"
          description="Transferência precisa de duas contas suas. Cadastre a conta de destino em Mais → Contas e volte aqui."
        />
      ) : (
        <>
          <p className="mb-3 text-sm text-text-muted">
            Só é transferência se o dinheiro foi para outra conta sua. Se foi
            para outra pessoa, feche aqui — é gasto.
          </p>
          <ul className="space-y-1.5">
            {options.map((account) => (
              <li key={account.id}>
                <button
                  type="button"
                  onClick={() => setSelected(account.id)}
                  className={cn(
                    'flex w-full items-center justify-between gap-3 rounded-md border px-3.5 py-3 text-left transition-colors',
                    selected === account.id
                      ? 'border-accent bg-accent-muted'
                      : 'border-border bg-surface hover:border-border-strong',
                  )}
                >
                  <span className="text-sm font-medium text-text">
                    {account.name}
                  </span>
                  <span className="font-mono text-[11px] uppercase tracking-[0.1em] text-text-muted">
                    {KIND_LABEL[account.kind] ?? account.kind}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </Sheet>
  );
}
