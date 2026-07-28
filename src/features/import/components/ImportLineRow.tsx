import { MoneyText } from "@/components/money/MoneyText";
import { Button } from "@/components/ui/Button";
import { isHighConfidence } from "@/core/import";
import { cn } from "@/lib/cn";
import type { ImportLine, ImportLineStatus } from "@/types/models";

const STATUS_LABEL: Record<ImportLineStatus, string> = {
  suggested: "Sugestão",
  matched: "Vinculada",
  created: "Criada",
  ignored: "Ignorada",
  unmatched: "Nova",
};

const STATUS_TONE: Record<ImportLineStatus, string> = {
  suggested: "text-amber-400 border-amber-400/30 bg-amber-400/10",
  matched: "text-accent border-accent/30 bg-accent/10",
  created: "text-accent border-accent/30 bg-accent/10",
  ignored: "text-text-muted border-border bg-surface",
  unmatched: "text-text-muted border-border bg-surface-elevated",
};

type Props = {
  line: ImportLine;
  busy?: boolean;
  onConfirmSuggested?: () => void;
  onCreate?: () => void;
  onCreateTransfer?: () => void;
  onMatch?: () => void;
  onIgnore?: () => void;
  onUndo?: () => void;
  onConvertTransfer?: () => void;
};

export function ImportLineRow({
  line,
  busy,
  onConfirmSuggested,
  onCreate,
  onCreateTransfer,
  onMatch,
  onIgnore,
  onUndo,
  onConvertTransfer,
}: Props) {
  const pending = line.status === "unmatched" || line.status === "suggested";
  const highConfidence =
    line.status === "suggested" &&
    line.matchConfidence != null &&
    isHighConfidence(line.matchConfidence);
  const canConvertCreated =
    line.status === "created" &&
    line.kind === "expense" &&
    Boolean(onConvertTransfer);

  return (
    <li className="space-y-3 px-4 py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-text">
            {line.descriptionRaw || "Sem descrição"}
          </p>
          <p className="mt-0.5 text-xs text-text-muted">
            {formatDateBr(line.postedOn)}
            {highConfidence
              ? " · vínculo óbvio"
              : line.matchConfidence != null
                ? ` · confiança ${line.matchConfidence}%`
                : null}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <MoneyText
            cents={line.amountCents}
            tone={line.kind === "income" ? "income" : "expense"}
            className="text-sm font-medium"
          />
          <span
            className={cn(
              "mt-1 inline-flex rounded-md border px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide",
              STATUS_TONE[line.status],
            )}
          >
            {STATUS_LABEL[line.status]}
          </span>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {line.status === "suggested" && onConfirmSuggested ? (
          <Button size="sm" disabled={busy} onClick={onConfirmSuggested}>
            Confirmar vínculo
          </Button>
        ) : null}
        {pending && onCreate ? (
          <Button
            size="sm"
            variant="secondary"
            disabled={busy}
            onClick={onCreate}
          >
            Criar lançamento
          </Button>
        ) : null}
        {pending && onCreateTransfer ? (
          <Button
            size="sm"
            variant="ghost"
            disabled={busy}
            onClick={onCreateTransfer}
          >
            É transferência…
          </Button>
        ) : null}
        {pending && onMatch ? (
          <Button
            size="sm"
            variant="secondary"
            disabled={busy}
            onClick={onMatch}
          >
            Vincular…
          </Button>
        ) : null}
        {pending && onIgnore ? (
          <Button size="sm" variant="ghost" disabled={busy} onClick={onIgnore}>
            Ignorar
          </Button>
        ) : null}
        {canConvertCreated ? (
          <Button
            size="sm"
            variant="secondary"
            disabled={busy}
            onClick={onConvertTransfer}
          >
            Virar transferência…
          </Button>
        ) : null}
        {(line.status === "matched" ||
          line.status === "created" ||
          line.status === "ignored") &&
        onUndo ? (
          <Button size="sm" variant="ghost" disabled={busy} onClick={onUndo}>
            Desfazer
          </Button>
        ) : null}
      </div>
    </li>
  );
}

function formatDateBr(iso: string): string {
  const [y, m, d] = iso.split("-");
  if (!y || !m || !d) return iso;
  return `${d}/${m}/${y}`;
}
