import type { PaymentCoverage } from '@/core/reconcile/invoice-gap';
import { cn } from '@/lib/cn';

const LABEL: Record<PaymentCoverage, string> = {
  unpaid: 'Em aberto',
  partial: 'Parcial',
  paid: 'Paga',
};

type PaymentStatusBadgeProps = {
  coverage: PaymentCoverage;
  statementStatus?: 'open' | 'closed' | null;
  className?: string;
};

export function PaymentStatusBadge({
  coverage,
  statementStatus,
  className,
}: PaymentStatusBadgeProps) {
  const label =
    statementStatus === 'closed' && coverage === 'unpaid'
      ? 'Fechada'
      : LABEL[coverage];

  return (
    <span
      className={cn(
        'inline-flex items-center rounded-md border px-2 py-0.5 font-mono text-[11px] uppercase tracking-[0.08em]',
        coverage === 'paid' &&
          'border-accent/40 bg-accent-muted text-accent',
        coverage === 'partial' &&
          'border-border-strong bg-surface-elevated text-text',
        coverage === 'unpaid' &&
          'border-border bg-surface text-text-muted',
        className,
      )}
    >
      {label}
    </span>
  );
}
