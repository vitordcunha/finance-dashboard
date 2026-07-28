import { useState } from 'react';
import { ChevronRight, Tag } from 'lucide-react';
import { formatBRL } from '@/core/money';
import type { MerchantGroup } from '@/core/transactions/grouping';
import { useBulkCategorize } from '@/features/panel/hooks/useBulkCategorize';
import { cn } from '@/lib/cn';

type Props = {
  groups: MerchantGroup[];
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
  categories: { id: string; name: string }[];
};

/** Grupos exibidos de saída; o resto vira "+N" para a lista não virar rolagem. */
const VISIBLE = 6;

/**
 * Categorizar em lote — a dívida que trava o resto do painel.
 *
 * "Sem categoria 61%" aparecia como fato passivo em "Para onde foi". É o gargalo
 * de tudo que classifica: a régua de essencial, o ritmo, o estimado, o burn-up.
 * Enquanto for percentual, ninguém age; virando lista com botão, some.
 *
 * Agrupa por comerciante porque o custo real não é escolher a categoria, é fazer
 * isso quarenta vezes para a mesma padaria.
 */
export function UncategorizedSection({
  groups,
  totalCents,
  monthOutCents,
  categories,
}: Props) {
  const [open, setOpen] = useState(false);
  const mutation = useBulkCategorize();

  if (groups.length === 0) return null;

  const pct = monthOutCents > 0 ? Math.round((totalCents / monthOutCents) * 100) : 0;
  const shown = groups.slice(0, VISIBLE);
  const rest = groups.length - shown.length;
  const count = groups.reduce((s, g) => s + g.count, 0);

  return (
    <section className="overflow-hidden rounded-xl border border-warning/30 bg-warning/[0.04]">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
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
            Sem categoria o app não sabe o que é compromisso e o que é hábito — é o
            que limita o estimado e o ritmo.
          </p>
        </div>
        <ChevronRight
          className={cn(
            'mt-0.5 size-4 shrink-0 text-text-muted transition-transform',
            open && 'rotate-90',
          )}
          aria-hidden
        />
      </button>

      {open ? (
        <ul className="border-t border-warning/20">
          {shown.map((group) => (
            <li
              key={group.key}
              className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-warning/10 px-4 py-2.5 last:border-b-0"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] text-text">{group.label}</p>
                <p className="font-mono text-[10px] tabular-nums text-text-muted">
                  {group.count}×{' '}
                  <span className="text-text">{formatBRL(group.totalCents)}</span>
                </p>
              </div>
              <select
                defaultValue=""
                disabled={mutation.isPending}
                onChange={(e) => {
                  if (!e.target.value) return;
                  mutation.mutate({
                    ids: group.ids,
                    categoryId: e.target.value,
                  });
                }}
                aria-label={`Categoria para ${group.label}`}
                className={cn(
                  'min-h-9 shrink-0 rounded-md border border-border bg-bg px-2 text-[12px] text-text',
                  'outline-none hover:border-border-strong focus:border-accent',
                )}
              >
                <option value="">Categorizar…</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </li>
          ))}
          {rest > 0 ? (
            <li className="px-4 py-2.5 text-[11px] text-text-muted">
              +{rest} {rest === 1 ? 'comerciante' : 'comerciantes'} com valores
              menores. Os maiores primeiro — eles mudam mais a leitura do mês.
            </li>
          ) : null}
        </ul>
      ) : null}
    </section>
  );
}
