import { Delete } from 'lucide-react';
import { cn } from '@/lib/cn';
import { formatBRL } from '@/core/money';

type AmountKeypadProps = {
  digits: string;
  onChange: (digits: string) => void;
  className?: string;
};

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '00', '0', 'back'] as const;

export function AmountKeypad({ digits, onChange, className }: AmountKeypadProps) {
  const cents = digits ? Number.parseInt(digits, 10) : 0;
  const display = formatBRL(cents);

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

  return (
    <div className={cn('space-y-4', className)}>
      <p
        className="text-center font-display text-4xl font-medium tracking-tight tabular-nums text-text"
        aria-live="polite"
      >
        {display}
      </p>
      <div className="grid grid-cols-3 gap-2">
        {KEYS.map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => press(key)}
            className={cn(
              'flex min-h-14 items-center justify-center rounded-lg',
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
    </div>
  );
}
