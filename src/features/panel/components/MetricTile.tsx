import { cn } from '@/lib/cn';

type Props = {
  label: string;
  value: string;
  hint?: string;
  tone?: 'default' | 'accent' | 'danger' | 'warning';
  wide?: boolean;
};

/** Tile de métrica compartilhado entre seções do Painel. */
export function MetricTile({
  label,
  value,
  hint,
  tone = 'default',
  wide,
}: Props) {
  return (
    <div
      className={cn(
        'rounded-xl border bg-surface p-3',
        wide && 'col-span-2 sm:col-span-3',
        tone === 'danger'
          ? 'border-danger/30'
          : tone === 'warning'
            ? 'border-warning/30'
            : tone === 'accent'
              ? 'border-accent/30'
              : 'border-border',
      )}
    >
      <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-text-muted">
        {label}
      </p>
      <p
        className={cn(
          'mt-0.5 font-display tracking-tight tabular-nums',
          wide ? 'text-2xl font-semibold' : 'text-base font-medium',
          tone === 'danger'
            ? 'text-danger'
            : tone === 'warning'
              ? 'text-warning'
              : tone === 'accent'
                ? 'text-accent'
                : 'text-text',
        )}
      >
        {value}
      </p>
      {hint ? (
        <p className="mt-1 text-[11px] leading-snug text-text-muted">{hint}</p>
      ) : null}
    </div>
  );
}
