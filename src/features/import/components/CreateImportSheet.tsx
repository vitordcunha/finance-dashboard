import { useEffect, useMemo, useState } from 'react';
import { MoneyText } from '@/components/money/MoneyText';
import { Button } from '@/components/ui/Button';
import { Sheet } from '@/components/ui/Sheet';
import {
  countPendingSameFingerprint,
  fingerprint,
  fingerprintLabel,
  indexRulesByFingerprint,
  resolveRule,
} from '@/core/categorization';
import type { Category } from '@/data/supabase/types';
import type { CategorizationRule, ImportLine } from '@/types/models';
import { cn } from '@/lib/cn';

export type CreateImportConfirm = {
  categoryId: string | null;
  applySame: boolean;
  remember: boolean;
};

type Props = {
  open: boolean;
  onClose: () => void;
  line: ImportLine | null;
  lines: ImportLine[];
  categories: Category[];
  rules: CategorizationRule[];
  busy?: boolean;
  onConfirm: (input: CreateImportConfirm) => void;
};

export function CreateImportSheet({
  open,
  onClose,
  line,
  lines,
  categories,
  rules,
  busy,
  onConfirm,
}: Props) {
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [applySame, setApplySame] = useState(true);
  const [remember, setRemember] = useState(true);

  const kind = line?.kind ?? 'expense';
  const filtered = useMemo(
    () => categories.filter((c) => c.kind === kind),
    [categories, kind],
  );

  const sameCount = useMemo(() => {
    if (!line) return 0;
    return countPendingSameFingerprint(lines, line.descriptionRaw, line.id);
  }, [line, lines]);

  const label = line ? fingerprintLabel(line.descriptionRaw) : '';
  const hasFingerprint = line ? Boolean(fingerprint(line.descriptionRaw)) : false;

  useEffect(() => {
    if (!open || !line) return;

    const index = indexRulesByFingerprint(rules);
    const rule = resolveRule(line.descriptionRaw, index);
    setCategoryId(rule?.categoryId ?? null);

    const siblings = countPendingSameFingerprint(
      lines,
      line.descriptionRaw,
      line.id,
    );
    setApplySame(siblings > 0);
    setRemember(true);
  }, [open, line, lines, rules]);

  function close() {
    setCategoryId(null);
    setApplySame(true);
    setRemember(true);
    onClose();
  }

  return (
    <Sheet
      open={open}
      onClose={close}
      title="Criar lançamento"
      footer={
        <Button
          className="w-full"
          disabled={busy}
          onClick={() => {
            onConfirm({
              categoryId,
              applySame: Boolean(categoryId) && applySame && sameCount > 0,
              remember: Boolean(categoryId) && remember && hasFingerprint,
            });
          }}
        >
          {busy
            ? 'Criando…'
            : applySame && sameCount > 0 && categoryId
              ? `Criar ${sameCount + 1} lançamentos`
              : 'Criar lançamento'}
        </Button>
      }
    >
      {line ? (
        <div className="mb-4 flex items-start justify-between gap-3 rounded-md border border-border bg-surface-elevated px-3.5 py-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-text">
              {line.descriptionRaw || 'Sem descrição'}
            </p>
            <p className="mt-0.5 text-xs text-text-muted">{line.postedOn}</p>
          </div>
          <MoneyText
            cents={line.amountCents}
            tone={line.kind === 'income' ? 'income' : 'expense'}
            className="shrink-0 text-sm font-medium"
          />
        </div>
      ) : null}

      <div className="space-y-4">
        <div className="space-y-1.5">
          <label
            htmlFor="import-create-category"
            className="text-sm font-medium text-text-muted"
          >
            Categoria
          </label>
          <select
            id="import-create-category"
            value={categoryId ?? ''}
            onChange={(e) => setCategoryId(e.target.value || null)}
            className="min-h-10 w-full rounded-md border border-border bg-bg px-3 text-sm text-text outline-none hover:border-border-strong focus:border-accent"
          >
            <option value="">Sem categoria</option>
            {filtered.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>

        {categoryId && hasFingerprint ? (
          <div className="space-y-3 rounded-lg border border-border bg-bg p-3">
            {sameCount > 0 ? (
              <label className="flex cursor-pointer items-start gap-3">
                <input
                  type="checkbox"
                  checked={applySame}
                  onChange={(e) => setApplySame(e.target.checked)}
                  className="mt-0.5 size-4 rounded border-border accent-(--accent)"
                />
                <span className="text-sm text-text">
                  Aplicar em todas as iguais{' '}
                  <span className="text-text-muted">
                    ({sameCount} · {label})
                  </span>
                </span>
              </label>
            ) : null}

            <label
              className={cn(
                'flex cursor-pointer items-start gap-3',
                !hasFingerprint && 'opacity-50',
              )}
            >
              <input
                type="checkbox"
                checked={remember}
                onChange={(e) => setRemember(e.target.checked)}
                className="mt-0.5 size-4 rounded border-border accent-(--accent)"
              />
              <span className="text-sm text-text">
                Lembrar para próximos extratos
                <span className="mt-0.5 block text-xs text-text-muted">
                  Tudo parecido com {label} recebe esta categoria
                </span>
              </span>
            </label>
          </div>
        ) : null}
      </div>
    </Sheet>
  );
}
