export function PageSpinner({ label = 'Carregando…' }: { label?: string }) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-3 bg-bg text-text-muted">
      <div
        className="size-7 animate-spin rounded-full border-2 border-border border-t-accent"
        aria-hidden
      />
      <p className="text-sm">{label}</p>
    </div>
  );
}
