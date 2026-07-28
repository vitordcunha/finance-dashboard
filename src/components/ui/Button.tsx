import { type ButtonHTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'outline';
  size?: 'md' | 'sm' | 'icon';
};

export function Button({
  className,
  variant = 'primary',
  size = 'md',
  type = 'button',
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={cn(
        'inline-flex items-center justify-center gap-2 font-medium transition-colors',
        'disabled:pointer-events-none disabled:opacity-50',
        size === 'md' && 'min-h-10 rounded-full px-4 text-sm',
        size === 'sm' && 'min-h-8 rounded-full px-3 text-xs',
        size === 'icon' && 'size-10 rounded-full',
        variant === 'primary' &&
          'bg-accent text-accent-fg hover:bg-[#45d698] active:bg-[#2bbd7e] disabled:opacity-100 disabled:bg-accent/40 disabled:text-accent-fg/70',
        variant === 'secondary' &&
          'border border-border bg-surface-elevated text-text hover:border-border-strong hover:bg-surface-hover',
        variant === 'outline' &&
          'border border-border bg-transparent text-text hover:border-border-strong hover:bg-surface-hover',
        variant === 'ghost' &&
          'rounded-md text-text-muted hover:bg-surface-hover hover:text-text',
        variant === 'danger' && 'bg-danger text-white hover:opacity-90',
        className,
      )}
      {...props}
    />
  );
}
