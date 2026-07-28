import { cn } from '@/lib/cn';
import type { AppScope } from '@/core/scope/filter';
import { useScope } from '@/features/scope/hooks/useScope';

const OPTIONS: { value: AppScope; label: string }[] = [
  { value: 'casa', label: 'Casa' },
  { value: 'eu', label: 'Eu' },
  { value: 'tudo', label: 'Tudo' },
];

type ScopeChipProps = {
  className?: string;
  /** compacto no mobile top bar */
  size?: 'md' | 'sm';
};

export function ScopeChip({ className, size = 'md' }: ScopeChipProps) {
  const { scope, setScope, euUnresolved } = useScope();

  return (
    <div className={cn('space-y-1', className)}>
      <div
        role="radiogroup"
        aria-label="Escopo: Casa, Eu ou Tudo"
        className={cn(
          'inline-flex rounded-full border border-border bg-bg p-0.5',
          size === 'sm' && 'scale-[0.95] origin-left',
        )}
      >
        {OPTIONS.map(({ value, label }) => {
          const selected = scope === value;
          return (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => setScope(value)}
              className={cn(
                'min-h-8 rounded-full px-3 text-xs font-medium transition-colors',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
                selected
                  ? 'bg-accent-muted text-accent'
                  : 'text-text-muted hover:text-text',
              )}
            >
              {label}
            </button>
          );
        })}
      </div>
      {euUnresolved ? (
        <p className="text-[11px] text-text-muted">
          Ligue sua pessoa ao login em Configurações para usar Eu.
        </p>
      ) : null}
    </div>
  );
}
