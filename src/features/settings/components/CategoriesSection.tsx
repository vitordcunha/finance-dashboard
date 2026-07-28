import { useState } from 'react';
import { Plus, Tags } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { Input } from '@/components/ui/Input';
import { Panel } from '@/components/ui/Panel';
import { Skeleton } from '@/components/ui/Skeleton';
import type { Category } from '@/data/supabase/types';
import type { CategoryKind } from '@/data/categories';
import { useCategories } from '@/features/capture/hooks/useCaptureLookups';
import {
  useCreateCategory,
  useUpdateCategory,
} from '@/features/settings/hooks/useSettingsMutations';
import { cn } from '@/lib/cn';

export function CategoriesSection() {
  const { data: categories = [], isLoading, isError, refetch } = useCategories();
  const create = useCreateCategory();
  const update = useUpdateCategory();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  return (
    <section className="space-y-3" aria-labelledby="settings-categories">
      <div className="flex items-center justify-between gap-2">
        <h2
          id="settings-categories"
          className="text-xs font-medium uppercase tracking-wide text-text-muted"
        >
          Categorias
        </h2>
        <Button
          size="sm"
          variant="secondary"
          onClick={() => {
            setCreating(true);
            setEditingId(null);
          }}
        >
          <Plus className="size-3.5" aria-hidden />
          Nova
        </Button>
      </div>

      {isLoading ? <Skeleton className="h-24 w-full rounded-xl" /> : null}

      {isError ? (
        <EmptyState
          icon={Tags}
          title="Não deu para carregar categorias"
          description="Tente de novo em instantes."
          action={
            <Button variant="secondary" size="sm" onClick={() => void refetch()}>
              Tentar de novo
            </Button>
          }
        />
      ) : null}

      {!isLoading && !isError && categories.length === 0 && !creating ? (
        <EmptyState
          icon={Tags}
          title="Nenhuma categoria"
          description="Crie categorias de saída e entrada para organizar o mês."
          action={
            <Button size="sm" onClick={() => setCreating(true)}>
              Adicionar categoria
            </Button>
          }
        />
      ) : null}

      {!isLoading && !isError ? (
        <Panel className="divide-y divide-border overflow-hidden p-0">
          {categories.map((category) =>
            editingId === category.id ? (
              <CategoryForm
                key={category.id}
                initial={category}
                busy={update.isPending}
                onCancel={() => setEditingId(null)}
                onSave={async (values) => {
                  await update.mutateAsync({ id: category.id, patch: values });
                  setEditingId(null);
                }}
              />
            ) : (
              <div
                key={category.id}
                className="flex items-center gap-3 px-4 py-3"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-text">
                    {category.name}
                  </p>
                  <p className="text-xs text-text-muted">
                    {category.kind === 'income' ? 'Entrada' : 'Saída'}
                    {category.essential ? ' · essencial' : ''}
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => {
                    setEditingId(category.id);
                    setCreating(false);
                  }}
                >
                  Editar
                </Button>
              </div>
            ),
          )}
          {creating ? (
            <CategoryForm
              busy={create.isPending}
              onCancel={() => setCreating(false)}
              onSave={async (values) => {
                await create.mutateAsync(values);
                setCreating(false);
              }}
            />
          ) : null}
        </Panel>
      ) : null}
    </section>
  );
}

function CategoryForm({
  initial,
  busy,
  onCancel,
  onSave,
}: {
  initial?: Category;
  busy: boolean;
  onCancel: () => void;
  onSave: (values: {
    name: string;
    kind: CategoryKind;
    essential: boolean;
  }) => Promise<void>;
}) {
  const [name, setName] = useState(initial?.name ?? '');
  const [kind, setKind] = useState<CategoryKind>(initial?.kind ?? 'expense');
  const [essential, setEssential] = useState(initial?.essential ?? false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit() {
    if (!name.trim()) {
      setError('Nome é obrigatório');
      return;
    }
    setError(null);
    await onSave({
      name: name.trim(),
      kind,
      essential,
    });
  }

  return (
    <div className="space-y-3 bg-bg/40 px-4 py-4">
      <Input
        label="Nome"
        name="category-name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Ex.: Mercado, Salário…"
      />
      <div className="flex gap-2">
        {(
          [
            { value: 'expense', label: 'Saída' },
            { value: 'income', label: 'Entrada' },
          ] as const
        ).map((k) => (
          <button
            key={k.value}
            type="button"
            onClick={() => setKind(k.value)}
            className={cn(
              'min-h-10 flex-1 rounded-full border text-sm font-medium transition-colors',
              kind === k.value
                ? 'border-accent bg-accent/10 text-text'
                : 'border-border text-text-muted hover:border-border-strong',
            )}
          >
            {k.label}
          </button>
        ))}
      </div>
      <label className="flex items-center gap-2 text-sm text-text">
        <input
          type="checkbox"
          checked={essential}
          onChange={(e) => setEssential(e.target.checked)}
          className="size-4 rounded border-border"
        />
        Essencial / fixo (não entra no variável)
      </label>
      {error ? <p className="text-sm text-danger">{error}</p> : null}
      <div className="flex gap-2">
        <Button
          className="flex-1"
          disabled={busy}
          onClick={() => void handleSubmit()}
        >
          Salvar
        </Button>
        <Button variant="secondary" disabled={busy} onClick={onCancel}>
          Cancelar
        </Button>
      </div>
    </div>
  );
}
