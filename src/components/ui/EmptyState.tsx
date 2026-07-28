import { type LucideIcon } from 'lucide-react';
import { type ReactNode } from 'react';
import { cn } from '@/lib/cn';

type EmptyStateProps = {
  title: string;
  description?: string;
  icon?: LucideIcon;
  action?: ReactNode;
  className?: string;
};

export function EmptyState({
  title,
  description,
  icon: Icon,
  action,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-start gap-4 rounded-xl border border-border bg-surface p-6 animate-fade-in',
        className,
      )}
    >
      {Icon ? (
        <div className="flex size-10 items-center justify-center rounded-lg border border-border bg-accent-muted text-accent">
          <Icon className="size-5" strokeWidth={1.75} aria-hidden />
        </div>
      ) : null}
      <div className="space-y-1.5">
        <h2 className="font-display text-base font-medium tracking-tight text-text">
          {title}
        </h2>
        {description ? (
          <p className="max-w-md text-sm leading-relaxed text-text-muted">
            {description}
          </p>
        ) : null}
      </div>
      {action ? <div className="pt-1">{action}</div> : null}
    </div>
  );
}
