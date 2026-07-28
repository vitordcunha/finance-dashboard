import { useEffect, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { cn } from '@/lib/cn';
import { Button } from '@/components/ui/Button';

type SheetProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
};

export function Sheet({
  open,
  onClose,
  title,
  children,
  footer,
  className,
}: SheetProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center md:items-center"
      role="presentation"
    >
      <button
        type="button"
        aria-label="Fechar"
        className="absolute inset-0 animate-fade-in bg-black/60"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="sheet-title"
        className={cn(
          'relative z-10 flex max-h-[90dvh] w-full max-w-lg flex-col',
          'animate-sheet-in rounded-t-xl border border-border bg-surface',
          'md:rounded-xl',
          className,
        )}
        style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
      >
        <header className="flex shrink-0 items-center justify-between gap-3 border-b border-border px-5 py-3.5">
          <h2
            id="sheet-title"
            className="font-display text-base font-medium tracking-tight text-text"
          >
            {title}
          </h2>
          <Button
            variant="ghost"
            size="icon"
            className="size-9 rounded-md"
            onClick={onClose}
            aria-label="Fechar"
          >
            <X className="size-4" aria-hidden />
          </Button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">{children}</div>
        {footer ? (
          <div className="shrink-0 border-t border-border px-5 py-4">{footer}</div>
        ) : null}
      </div>
    </div>
  );
}
