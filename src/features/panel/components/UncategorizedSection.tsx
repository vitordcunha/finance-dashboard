import { useEffect, useState } from 'react';
import { ChevronRight, Tag, X } from 'lucide-react';
import { formatBRL } from '@/core/money';
import type { MerchantGroup } from '@/core/transactions/grouping';
import { Sheet } from '@/components/ui/Sheet';
import { Button } from '@/components/ui/Button';
import {
  CategorySelect,
  type CategorySelectOption,
} from '@/components/ui/CategorySelect';
import { useBulkCategorize } from '@/features/panel/hooks/useBulkCategorize';
import { getLocal, setLocal } from '@/lib/storage';

type Props = {
  groups: MerchantGroup[];
  /** Mês da fila — pulados ficam no dispositivo, por mês. */
  ym: string;
  /** Total sem categoria no mês, para dar tamanho ao problema. */
  totalCents: number;
  /**
   * Despesa lançada do mês — a base do percentual.
   *
   * Sem a fatura: pagamento de fatura não tem categoria a atribuir, então
   * incluí-lo faria o percentual nunca chegar a zero e discordar de "Para onde
   * foi", que mede outra coisa.
   */
  monthOutCents: number;
  categories: CategorySelectOption[];
};

function skippedKey(ym: string) {
  return `uncategorized-skipped:${ym}`;
}

/**
 * Categorizar em lote — a dívida que trava o resto do painel.
 *
 * "Sem categoria 61%" aparecia como fato passivo em "Para onde foi". É o gargalo
 * de tudo que classifica: a régua de essencial, o ritmo, o estimado, o burn-up.
 * Enquanto for percentual, ninguém age; virando lista com botão, some.
 *
 * Agrupa por comerciante porque o custo real não é escolher a categoria, é fazer
 * isso quarenta vezes para a mesma padaria.
 *
 * O sheet lista **todos** os grupos. "Pular" tira da fila o que você não reconhece
 * — sem inventar categoria — para dar espaço de categorizar o resto. O total do
 * aviso continua contando os pulados: a métrica ainda está furada.
 */
export function UncategorizedSection({
  groups,
  ym,
  totalCents,
  monthOutCents,
  categories,
}: Props) {
  const [open, setOpen] = useState(false);
  const [showSkipped, setShowSkipped] = useState(false);
  const [skippedKeys, setSkippedKeys] = useState<string[]>(() =>
    getLocal<string[]>(skippedKey(ym), []),
  );
  const mutation = useBulkCategorize();

  useEffect(() => {
    setSkippedKeys(getLocal<string[]>(skippedKey(ym), []));
    setShowSkipped(false);
  }, [ym]);

  if (groups.length === 0) return null;

  const skipped = new Set(skippedKeys);
  const active = groups.filter((g) => !skipped.has(g.key));
  const skippedGroups = groups.filter((g) => skipped.has(g.key));
  const queue = showSkipped ? skippedGroups : active;

  const pct = monthOutCents > 0 ? Math.round((totalCents / monthOutCents) * 100) : 0;
  const count = groups.reduce((s, g) => s + g.count, 0);
  const activeCount = active.reduce((s, g) => s + g.count, 0);

  function persistSkipped(next: string[]) {
    setSkippedKeys(next);
    setLocal(skippedKey(ym), next);
  }

  function skipGroup(key: string) {
    if (skipped.has(key)) return;
    persistSkipped([...skippedKeys, key]);
  }

  function restoreGroup(key: string) {
    persistSkipped(skippedKeys.filter((k) => k !== key));
  }

  return (
    <>
      <section className="overflow-hidden rounded-xl border border-warning/30 bg-warning/[0.04]">
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-haspopup="dialog"
          className="flex w-full items-start gap-2.5 px-4 py-3 text-left hover:bg-warning/[0.07]"
        >
          <Tag className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
          <div className="min-w-0 flex-1">
            <p className="text-[13px] font-medium text-text">
              {count} {count === 1 ? 'lançamento' : 'lançamentos'} sem categoria ·{' '}
              {formatBRL(totalCents)}
            </p>
            <p className="mt-0.5 text-[11px] leading-relaxed text-text-muted">
              {pct > 0 ? `${pct}% da despesa lançada. ` : ''}
              {skippedGroups.length > 0
                ? `${activeCount} na fila · ${skippedGroups.length} pulado${skippedGroups.length === 1 ? '' : 's'}. `
                : ''}
              Sem categoria o app não sabe o que é compromisso e o que é hábito —
              é o que limita o estimado e o ritmo.
            </p>
          </div>
          <ChevronRight
            className="mt-0.5 size-4 shrink-0 text-text-muted"
            aria-hidden
          />
        </button>
      </section>

      <Sheet
        open={open}
        onClose={() => setOpen(false)}
        title="Sem categoria"
        className="max-w-lg"
      >
        <div className="space-y-4">
          <p className="text-[12px] leading-relaxed text-text-muted">
            {showSkipped
              ? 'Pulados ficam fora da fila, mas ainda contam no mês. Devolva quando souber o que é.'
              : 'Categorizar por comerciante. Se não reconhecer, pule — dá para categorizar o resto sem travar.'}
          </p>

          {skippedGroups.length > 0 ? (
            <div className="flex gap-2">
              <Button
                size="sm"
                variant={showSkipped ? 'ghost' : 'secondary'}
                onClick={() => setShowSkipped(false)}
              >
                Fila ({active.length})
              </Button>
              <Button
                size="sm"
                variant={showSkipped ? 'secondary' : 'ghost'}
                onClick={() => setShowSkipped(true)}
              >
                Pulados ({skippedGroups.length})
              </Button>
            </div>
          ) : null}

          {queue.length === 0 ? (
            <p className="rounded-lg border border-border bg-bg px-3 py-4 text-[13px] text-text-muted">
              {showSkipped
                ? 'Nenhum comerciante pulado.'
                : skippedGroups.length > 0
                  ? 'Fila vazia — só restam os pulados. Abra a aba Pulados se quiser devolver algum.'
                  : 'Nada pendente.'}
            </p>
          ) : (
            <ul className="-mx-1 space-y-2">
              {queue.map((group) => (
                <GroupRow
                  key={group.key}
                  group={group}
                  categories={categories}
                  busy={mutation.isPending}
                  mode={showSkipped ? 'skipped' : 'active'}
                  onCategorize={(categoryId) => {
                    mutation.mutate(
                      { ids: group.ids, categoryId },
                      {
                        onSuccess: () => {
                          // Se estava pulado e categorizou, limpa o skip.
                          if (skipped.has(group.key)) restoreGroup(group.key);
                        },
                      },
                    );
                  }}
                  onSkip={() => skipGroup(group.key)}
                  onRestore={() => restoreGroup(group.key)}
                />
              ))}
            </ul>
          )}
        </div>
      </Sheet>
    </>
  );
}

function GroupRow({
  group,
  categories,
  busy,
  mode,
  onCategorize,
  onSkip,
  onRestore,
}: {
  group: MerchantGroup;
  categories: CategorySelectOption[];
  busy: boolean;
  mode: 'active' | 'skipped';
  onCategorize: (categoryId: string) => void;
  onSkip: () => void;
  onRestore: () => void;
}) {
  const extraSamples = group.samples.filter((s) => s !== group.label).slice(0, 3);

  return (
    <li className="rounded-lg border border-border bg-bg px-3 py-3">
      <div className="min-w-0">
        <p className="text-[13px] font-medium leading-snug text-text">
          {group.label}
        </p>
        <p className="mt-0.5 font-mono text-[10px] tabular-nums text-text-muted">
          {group.count}×{' '}
          <span className="text-text">{formatBRL(group.totalCents)}</span>
        </p>
        {extraSamples.length > 0 ? (
          <ul className="mt-1.5 space-y-0.5">
            {extraSamples.map((sample) => (
              <li
                key={sample}
                className="truncate text-[11px] text-text-muted"
                title={sample}
              >
                {sample}
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      <div className="mt-2.5 flex flex-wrap items-center gap-2">
        <div className="min-w-0 flex-1">
          <CategorySelect
            variant="inline"
            value={null}
            allowEmpty={false}
            placeholder="Categorizar…"
            disabled={busy}
            categories={categories}
            onChange={(categoryId) => {
              if (categoryId) onCategorize(categoryId);
            }}
            aria-label={`Categoria para ${group.label}`}
          />
        </div>

        {mode === 'active' ? (
          <Button
            size="sm"
            variant="ghost"
            disabled={busy}
            onClick={onSkip}
            className="shrink-0 gap-1 rounded-md px-2"
            aria-label={`Pular ${group.label}`}
          >
            <X className="size-3.5" aria-hidden />
            Pular
          </Button>
        ) : (
          <Button
            size="sm"
            variant="secondary"
            disabled={busy}
            onClick={onRestore}
            className="shrink-0 rounded-md"
          >
            Devolver
          </Button>
        )}
      </div>
    </li>
  );
}
