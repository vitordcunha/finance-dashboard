import { type ReactNode } from 'react';
import { cn } from '@/lib/cn';

type PageHeaderProps = {
  eyebrow?: string;
  title: ReactNode;
  description?: string;
  action?: ReactNode;
  className?: string;
  titleClassName?: string;
};

export function PageHeader({
  eyebrow,
  title,
  description,
  action,
  className,
  titleClassName,
}: PageHeaderProps) {
  return (
    <header
      className={cn(
        'flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between',
        className,
      )}
    >
      <div className="min-w-0 space-y-1.5">
        {eyebrow ? (
          <p className="font-mono text-[11px] uppercase tracking-[0.12em] text-text-muted">
            {eyebrow}
          </p>
        ) : null}
        <h1
          className={cn(
            'font-display text-2xl font-medium tracking-tight text-text md:text-[28px] md:leading-tight',
            titleClassName,
          )}
        >
          {title}
        </h1>
        {description ? (
          <p className="max-w-xl text-sm leading-relaxed text-text-muted">
            {description}
          </p>
        ) : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </header>
  );
}
