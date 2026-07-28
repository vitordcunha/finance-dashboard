import { AlertTriangle } from 'lucide-react';
import { MoneyText } from '@/components/money/MoneyText';
import { cn } from '@/lib/cn';

type InvoiceGapBannerProps = {
  gapCents: number;
  className?: string;
};

/**
 * Vermelho só quando há gap real (≠ 0).
 */
export function InvoiceGapBanner({ gapCents, className }: InvoiceGapBannerProps) {
  if (gapCents === 0) {
    return (
      <div
        className={cn(
          'rounded-xl border border-border bg-surface px-4 py-3 text-sm text-text-muted',
          className,
        )}
      >
        Fatura e compras batem — sem gap.
      </div>
    );
  }

  const missing = gapCents > 0;
  return (
    <div
      className={cn(
        'flex gap-3 rounded-xl border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-danger',
        className,
      )}
      role="status"
    >
      <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
      <div className="min-w-0 space-y-0.5">
        <p className="font-medium">
          Gap de <MoneyText cents={Math.abs(gapCents)} tone="danger" />
        </p>
        <p className="text-danger/90">
          {missing
            ? 'O banco cobrou mais do que as compras lançadas nesta competence.'
            : 'Há mais compras lançadas do que o total da fatura do banco.'}
        </p>
      </div>
    </div>
  );
}
