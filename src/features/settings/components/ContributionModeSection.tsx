import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { Input } from '@/components/ui/Input';
import { Panel } from '@/components/ui/Panel';
import { Skeleton } from '@/components/ui/Skeleton';
import { BPS_TOTAL } from '@/core/contribution/share';
import type { ContributionMode } from '@/data/settings';
import {
  useCategories,
  usePeopleQuery,
} from '@/features/capture/hooks/useCaptureLookups';
import {
  useContributionCustomBps,
  useContributionMode,
  useSetContributionCustomBps,
  useSetContributionMode,
  useSetSharedCategories,
  useSharedCategories,
} from '@/features/settings/hooks/useSettingsMutations';
import { cn } from '@/lib/cn';

const MODES: {
  value: ContributionMode;
  label: string;
  hint: string;
}[] = [
  {
    value: 'income_share',
    label: 'Proporcional à renda',
    hint: 'Cota = sua % da renda × gastos da Casa. Sem renda cadastrada, usa 50/50.',
  },
  {
    value: 'equal_50',
    label: '50 / 50',
    hint: 'Metade dos gastos da Casa para cada pessoa.',
  },
  {
    value: 'custom',
    label: 'Personalizado',
    hint: 'Defina a % de cada pessoa (soma 100%).',
  },
];

export function ContributionModeSection() {
  const {
    data: mode,
    isLoading: modeLoading,
    isError: modeError,
    refetch: refetchMode,
  } = useContributionMode();
  const {
    data: customBps,
    isLoading: bpsLoading,
    isError: bpsError,
    refetch: refetchBps,
  } = useContributionCustomBps();
  const peopleQuery = usePeopleQuery();
  const setMode = useSetContributionMode();
  const setCustomBps = useSetContributionCustomBps();
  const current = mode ?? 'income_share';

  const people = peopleQuery.data ?? [];
  const isLoading = modeLoading || bpsLoading || peopleQuery.isLoading;
  const isError = modeError || bpsError || peopleQuery.isError;

  const [percentDraft, setPercentDraft] = useState<Record<string, string>>({});

  useEffect(() => {
    if (people.length === 0) return;
    const next: Record<string, string> = {};
    const equal = Math.floor(100 / people.length);
    let used = 0;
    people.forEach((p, i) => {
      const bps = customBps?.[p.id];
      if (bps !== undefined) {
        next[p.id] = String(bps / 100);
      } else if (i === people.length - 1) {
        next[p.id] = String(100 - used);
      } else {
        next[p.id] = String(equal);
        used += equal;
      }
    });
    setPercentDraft(next);
  }, [people, customBps]);

  const draftBps = useMemo(() => {
    const out: Record<string, number> = {};
    for (const p of people) {
      const raw = percentDraft[p.id] ?? '0';
      const pct = Number(raw.replace(',', '.'));
      if (!Number.isFinite(pct)) return null;
      out[p.id] = Math.round(pct * 100);
    }
    return out;
  }, [people, percentDraft]);

  const draftSum = draftBps
    ? Object.values(draftBps).reduce((a, b) => a + b, 0)
    : null;
  const draftValid = draftSum === BPS_TOTAL;

  async function saveCustom() {
    if (!draftBps || !draftValid) return;
    await setCustomBps.mutateAsync(draftBps);
    if (current !== 'custom') {
      await setMode.mutateAsync('custom');
    }
  }

  return (
    <section className="space-y-3" aria-labelledby="settings-contribution">
      <div>
        <h2
          id="settings-contribution"
          className="text-xs font-medium uppercase tracking-wide text-text-muted"
        >
          Divisão da casa
        </h2>
        <p className="mt-1 text-xs text-text-muted">
          O que entra na conta da casa e como ela se divide. Vale para o card
          “Divisão da casa” no painel.
        </p>
      </div>

      <SharedCategoriesPicker />

      {isLoading ? <Skeleton className="h-28 w-full rounded-xl" /> : null}

      {isError ? (
        <EmptyState
          title="Não deu para carregar a cota"
          description="Tente de novo."
          action={
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                void refetchMode();
                void refetchBps();
                void peopleQuery.refetch();
              }}
            >
              Tentar de novo
            </Button>
          }
        />
      ) : null}

      {!isLoading && !isError ? (
        <Panel className="space-y-2 p-3">
          {MODES.map((item) => {
            const selected = current === item.value;
            return (
              <button
                key={item.value}
                type="button"
                disabled={setMode.isPending}
                onClick={() => {
                  void setMode.mutateAsync(item.value);
                }}
                className={cn(
                  'w-full rounded-lg border px-3 py-3 text-left transition-colors',
                  selected
                    ? 'border-accent bg-accent/10'
                    : 'border-border hover:border-border-strong',
                )}
              >
                <p className="text-sm font-medium text-text">{item.label}</p>
                <p className="mt-0.5 text-xs text-text-muted">{item.hint}</p>
              </button>
            );
          })}

          {current === 'custom' && people.length >= 2 ? (
            <div className="space-y-3 border-t border-border pt-3">
              <p className="text-xs text-text-muted">
                Porcentagem de cada pessoa (soma deve ser 100%).
              </p>
              {people.map((p) => (
                <Input
                  key={p.id}
                  label={p.name}
                  type="number"
                  min={0}
                  max={100}
                  step={1}
                  inputMode="decimal"
                  value={percentDraft[p.id] ?? ''}
                  onChange={(e) =>
                    setPercentDraft((prev) => ({
                      ...prev,
                      [p.id]: e.target.value,
                    }))
                  }
                  hint={
                    draftBps
                      ? `${((draftBps[p.id] ?? 0) / 100).toFixed(0)}%`
                      : undefined
                  }
                />
              ))}
              <p
                className={cn(
                  'text-xs',
                  draftValid ? 'text-text-muted' : 'text-danger',
                )}
              >
                {draftSum === null
                  ? 'Informe números válidos.'
                  : draftValid
                    ? 'Soma 100% — ok para salvar.'
                    : `Soma ${((draftSum ?? 0) / 100).toFixed(1)}% — ajuste para 100%.`}
              </p>
              <Button
                size="sm"
                disabled={!draftValid || setCustomBps.isPending}
                onClick={() => void saveCustom()}
              >
                Salvar porcentagens
              </Button>
            </div>
          ) : null}

          {current === 'income_share' ? (
            <p className="border-t border-border pt-3 text-xs text-text-muted">
              O peso vem da <strong className="text-text">renda recorrente</strong>{' '}
              de cada um no mês. Renda eventual fica fora de propósito — como base,
              ela faria a divisão oscilar todo mês. Sem nenhuma renda recorrente
              cadastrada, cai em meio a meio.
            </p>
          ) : null}
        </Panel>
      ) : null}
    </section>
  );
}

/**
 * Quais categorias são conta da casa.
 *
 * É o pote que o rateio divide, e precisa ser **declarado**. O painel inferia
 * "recorrente ou essencial", que é outra coisa: entravam o transporte de um e a
 * fatura do cartão do outro, e ficava fora todo o compartilhado variável. Em
 * agosto/2026 essa inferência acusava R$ 442,54 de dívida de quem estava em dia.
 *
 * Marcação por **categoria**, não por lançamento: resolve aluguel, luz, internet,
 * gás e mercado de uma vez, e cai no fluxo de categorizar que já existe. O que for
 * exceção (uma compra pessoal numa categoria da casa) se resolve movendo de
 * categoria.
 */
function SharedCategoriesPicker() {
  const categoriesQuery = useCategories();
  const { data: saved, isLoading } = useSharedCategories();
  const mutation = useSetSharedCategories();
  const [draft, setDraft] = useState<string[] | null>(null);

  const expense = (categoriesQuery.data ?? []).filter(
    (c) => c.kind === 'expense',
  );
  const selected = draft ?? saved ?? [];
  const dirty = draft != null && !sameSet(draft, saved ?? []);

  // Atualização **funcional**: dois toques no mesmo tick leem o mesmo `draft` do
  // render e o segundo apaga o primeiro. Marcar três categorias em sequência
  // rápida deixava só a última marcada.
  function toggle(id: string) {
    setDraft((prev) => {
      const base = prev ?? saved ?? [];
      return base.includes(id)
        ? base.filter((x) => x !== id)
        : [...base, id];
    });
  }

  if (isLoading || categoriesQuery.isLoading) {
    return <Skeleton className="h-32 w-full rounded-xl" />;
  }

  return (
    <Panel className="space-y-3 p-3">
      <div>
        <p className="text-sm font-medium text-text">Conta da casa</p>
        <p className="mt-0.5 text-xs text-text-muted">
          As categorias marcadas formam o pote a dividir. O pagamento de fatura
          nunca entra — as compras dentro dela já contam, cada uma na própria
          categoria.
        </p>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {expense.map((category) => {
          const on = selected.includes(category.id);
          return (
            <button
              key={category.id}
              type="button"
              aria-pressed={on}
              onClick={() => toggle(category.id)}
              className={cn(
                'rounded-pill border px-2.5 py-1 text-xs transition-colors',
                on
                  ? 'border-accent bg-accent/10 text-accent'
                  : 'border-border text-text-muted hover:border-border-strong hover:text-text',
              )}
            >
              {category.name}
            </button>
          );
        })}
      </div>

      {selected.length === 0 ? (
        <p className="text-xs text-danger">
          Sem nenhuma categoria marcada não há pote, e o card de divisão fica sem o
          que mostrar.
        </p>
      ) : null}

      {dirty ? (
        <div className="flex gap-2">
          <Button
            size="sm"
            disabled={mutation.isPending}
            onClick={() => {
              mutation.mutate(draft ?? [], { onSuccess: () => setDraft(null) });
            }}
          >
            Salvar
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setDraft(null)}>
            Cancelar
          </Button>
        </div>
      ) : null}
    </Panel>
  );
}

function sameSet(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const set = new Set(b);
  return a.every((x) => set.has(x));
}
