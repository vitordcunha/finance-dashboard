import { Button } from '@/components/ui/Button';

type Props = {
  /** Linhas que o CTA automático cobre (alta confiança + unmatched). */
  autoImportCount: number;
  unmatchedCount: number;
  suggestedCount: number;
  busy?: boolean;
  onAutoImport: () => void;
  onCreatePending: () => void;
  onConfirmSuggested: () => void;
  onIgnorePending: () => void;
};

/** Ações em lote: CTA principal + atalhos de revisão. */
export function ImportBulkBar({
  autoImportCount,
  unmatchedCount,
  suggestedCount,
  busy,
  onAutoImport,
  onCreatePending,
  onConfirmSuggested,
  onIgnorePending,
}: Props) {
  const attention = unmatchedCount + suggestedCount;
  if (autoImportCount === 0 && attention === 0) {
    return null;
  }

  return (
    <div className="space-y-2 rounded-xl border border-border bg-surface-elevated p-3">
      {autoImportCount > 0 ? (
        <Button
          className="w-full"
          disabled={busy}
          onClick={onAutoImport}
        >
          Importar automaticamente
          {autoImportCount > 0 ? ` (${autoImportCount})` : ''}
        </Button>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {unmatchedCount > 0 && autoImportCount === 0 ? (
          <Button size="sm" disabled={busy} onClick={onCreatePending}>
            Criar {unmatchedCount}{' '}
            {unmatchedCount === 1 ? 'pendente' : 'pendentes'}
          </Button>
        ) : null}
        {suggestedCount > 0 ? (
          <Button
            size="sm"
            variant="secondary"
            disabled={busy}
            onClick={onConfirmSuggested}
          >
            Confirmar {suggestedCount}{' '}
            {suggestedCount === 1 ? 'sugestão' : 'sugestões'}
          </Button>
        ) : null}
        {attention > 0 ? (
          <Button
            size="sm"
            variant="ghost"
            disabled={busy}
            onClick={onIgnorePending}
          >
            Ignorar atenção
          </Button>
        ) : null}
      </div>
    </div>
  );
}
