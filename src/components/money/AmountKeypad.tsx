import { ChevronDown, ChevronUp, Delete } from 'lucide-react';
import { cn } from '@/lib/cn';
import { formatBRL } from '@/core/money';

type AmountTone = 'default' | 'income' | 'expense' | 'transfer';

type AmountKeypadProps = {
  digits: string;
  onChange: (digits: string) => void;
  className?: string;
  tone?: AmountTone;
  /**
   * Quando definido, o teclado pode recolher (só o valor fica visível).
   * Omitir = sempre expandido (compatível com outros sheets).
   */
  expanded?: boolean;
  onExpandedChange?: (expanded: boolean) => void;
};

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '00', '0', 'back'] as const;

const toneClass: Record<AmountTone, string> = {
  default: 'text-text',
  income: 'text-income',
  expense: 'text-text',
  transfer: 'text-accent',
};

export function AmountKeypad({
  digits,
  onChange,
  className,
  tone = 'default',
  expanded,
  onExpandedChange,
}: AmountKeypadProps) {
  const cents = digits ? Number.parseInt(digits, 10) : 0;
  const display = formatBRL(cents);
  const collapsible = expanded !== undefined;
  const padOpen = expanded ?? true;

  function press(key: (typeof KEYS)[number]) {
    if (key === 'back') {
      onChange(digits.slice(0, -1));
      return;
    }
    if (digits.length >= 9) return;
    if (digits === '' && key === '00') {
      onChange('0');
      return;
    }
    onChange(digits + key);
  }

  const displayNode = (
    <p
      className={cn(
        'text-center font-display text-4xl font-medium tracking-tight tabular-nums',
        toneClass[tone],
      )}
      aria-live="polite"
    >
      {display}
    </p>
  );

  return (
    <div className={cn('space-y-3', className)}>
      {collapsible && onExpandedChange ? (
        <button
          type="button"
          onClick={() => onExpandedChange(!padOpen)}
          className="mx-auto flex w-full flex-col items-center gap-1 rounded-lg py-1 hover:bg-surface-hover/50"
          aria-expanded={padOpen}
          aria-label={
            padOpen
              ? 'Recolher teclado'
              : 'Abrir teclado para alterar o valor'
          }
        >
          {displayNode}
          <span className="flex items-center gap-1 text-[11px] text-text-muted">
            {padOpen ? 'Recolher' : 'Alterar valor'}
            {padOpen ? (
              <ChevronUp className="size-3" aria-hidden />
            ) : (
              <ChevronDown className="size-3" aria-hidden />
            )}
          </span>
        </button>
      ) : (
        displayNode
      )}

      {padOpen ? (
        <div className="grid grid-cols-3 gap-2">
          {KEYS.map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => press(key)}
              className={cn(
                'flex min-h-12 items-center justify-center rounded-lg sm:min-h-14',
                'bg-surface-elevated text-lg font-medium text-text',
                'transition-colors hover:bg-surface-hover active:bg-border',
              )}
              aria-label={key === 'back' ? 'Apagar' : key}
            >
              {key === 'back' ? (
                <Delete className="size-5 text-text-muted" aria-hidden />
              ) : (
                key
              )}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
