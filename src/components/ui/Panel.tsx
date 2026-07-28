import { type ReactNode } from 'react';
import { cn } from '@/lib/cn';

type PanelProps = {
  children: ReactNode;
  className?: string;
};

/** Superfície elevada estilo Studio — borda hairline, sem sombra. */
export function Panel({ children, className }: PanelProps) {
  return (
    <div
      className={cn(
        'rounded-xl border border-border bg-surface',
        className,
      )}
    >
      {children}
    </div>
  );
}
