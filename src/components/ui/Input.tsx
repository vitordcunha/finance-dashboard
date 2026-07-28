import { type InputHTMLAttributes, forwardRef } from 'react';
import { cn } from '@/lib/cn';

type InputProps = InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  error?: string;
  hint?: string;
};

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { className, label, error, hint, id, ...props },
  ref,
) {
  const inputId = id ?? props.name;
  return (
    <label className="block space-y-1.5 text-sm">
      <span className="font-medium text-text-muted">{label}</span>
      <input
        ref={ref}
        id={inputId}
        className={cn(
          'min-h-10 w-full rounded-md border border-border bg-bg px-3 text-sm text-text outline-none',
          'placeholder:text-text-muted/70 transition-colors',
          'hover:border-border-strong focus:border-accent',
          error && 'border-danger focus:border-danger',
          className,
        )}
        aria-invalid={Boolean(error)}
        {...props}
      />
      {error ? <span className="text-xs text-danger">{error}</span> : null}
      {!error && hint ? <span className="text-xs text-text-muted">{hint}</span> : null}
    </label>
  );
});
