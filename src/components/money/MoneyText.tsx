import { cn } from '@/lib/cn';
import { formatBRL } from '@/core/money';

type MoneyTone = 'default' | 'income' | 'expense' | 'danger' | 'muted';

type MoneyTextProps = {
  cents: number;
  className?: string;
  tone?: MoneyTone;
  /** Prefixa "+" quando positivo. */
  signed?: boolean;
};

const toneClass: Record<MoneyTone, string> = {
  default: 'text-text',
  income: 'text-income',
  expense: 'text-expense',
  danger: 'text-danger',
  muted: 'text-text-muted',
};

export function MoneyText({
  cents,
  className,
  tone = 'default',
  signed = false,
}: MoneyTextProps) {
  const formatted = formatBRL(Math.abs(cents));
  let display = formatted;
  if (signed && cents > 0) display = `+${formatted}`;
  if (cents < 0) display = `−${formatted}`;

  return (
    <span className={cn('tabular-nums', toneClass[tone], className)}>
      {display}
    </span>
  );
}
