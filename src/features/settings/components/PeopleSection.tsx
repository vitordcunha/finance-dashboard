import { useState } from 'react';
import { Plus, UserRound } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { Input } from '@/components/ui/Input';
import { Panel } from '@/components/ui/Panel';
import { Skeleton } from '@/components/ui/Skeleton';
import type { Person } from '@/data/supabase/types';
import { useAuth } from '@/features/auth/hooks/useAuth';
import { usePeopleQuery } from '@/features/capture/hooks/useCaptureLookups';
import {
  useCreatePerson,
  useUpdatePerson,
} from '@/features/settings/hooks/useSettingsMutations';
import { cn } from '@/lib/cn';

const COLORS = ['#2f5d50', '#3d6b8c', '#8b5a3c', '#6b4c7a', '#4a6741', '#a65d4e'];

export function PeopleSection() {
  const { user } = useAuth();
  const { data: people = [], isLoading, isError, refetch } = usePeopleQuery();
  const create = useCreatePerson();
  const update = useUpdatePerson();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  return (
    <section className="space-y-3" aria-labelledby="settings-people">
      <div className="flex items-center justify-between gap-2">
        <h2
          id="settings-people"
          className="text-xs font-medium uppercase tracking-wide text-text-muted"
        >
          Pessoas
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
          icon={UserRound}
          title="Não deu para carregar pessoas"
          description="Tente de novo em instantes."
          action={
            <Button variant="secondary" size="sm" onClick={() => void refetch()}>
              Tentar de novo
            </Button>
          }
        />
      ) : null}

      {!isLoading && !isError && people.length === 0 && !creating ? (
        <EmptyState
          icon={UserRound}
          title="Nenhuma pessoa"
          description="Cadastre você e o parceiro para o escopo Eu funcionar."
          action={
            <Button size="sm" onClick={() => setCreating(true)}>
              Adicionar pessoa
            </Button>
          }
        />
      ) : null}

      {!isLoading && !isError ? (
        <Panel className="divide-y divide-border overflow-hidden p-0">
          {people.map((person) =>
            editingId === person.id ? (
              <PersonForm
                key={person.id}
                initial={person}
                busy={update.isPending}
                currentUserId={user?.id ?? null}
                onCancel={() => setEditingId(null)}
                onSave={async (values) => {
                  await update.mutateAsync({ id: person.id, patch: values });
                  setEditingId(null);
                }}
              />
            ) : (
              <PersonRow
                key={person.id}
                person={person}
                isMe={Boolean(user?.id && person.user_id === user.id)}
                onEdit={() => {
                  setEditingId(person.id);
                  setCreating(false);
                }}
                onLinkMe={
                  user?.id
                    ? async () => {
                        // Garante um único “Eu” por login
                        for (const other of people) {
                          if (
                            other.id !== person.id &&
                            other.user_id === user.id
                          ) {
                            await update.mutateAsync({
                              id: other.id,
                              patch: { userId: null },
                            });
                          }
                        }
                        await update.mutateAsync({
                          id: person.id,
                          patch: { userId: user.id },
                        });
                      }
                    : undefined
                }
                onUnlink={
                  person.user_id
                    ? () =>
                        void update.mutateAsync({
                          id: person.id,
                          patch: { userId: null },
                        })
                    : undefined
                }
              />
            ),
          )}
          {creating ? (
            <PersonForm
              busy={create.isPending}
              currentUserId={user?.id ?? null}
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

function PersonRow({
  person,
  isMe,
  onEdit,
  onLinkMe,
  onUnlink,
}: {
  person: Person;
  isMe: boolean;
  onEdit: () => void;
  onLinkMe?: () => void;
  onUnlink?: () => void;
}) {
  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <span
        className="size-3 shrink-0 rounded-full"
        style={{ backgroundColor: person.color }}
        aria-hidden
      />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-text">
          {person.name}
          {isMe ? (
            <span className="ml-2 text-xs font-normal text-accent">você</span>
          ) : null}
        </p>
        <p className="text-xs text-text-muted">
          {person.short_name}
          {person.user_id ? ' · login ligado' : ' · sem login'}
        </p>
      </div>
      <div className="flex shrink-0 gap-1">
        {!person.user_id && onLinkMe ? (
          <Button size="sm" variant="ghost" onClick={onLinkMe}>
            Sou eu
          </Button>
        ) : null}
        {isMe && onUnlink ? (
          <Button size="sm" variant="ghost" onClick={onUnlink}>
            Desligar
          </Button>
        ) : null}
        <Button size="sm" variant="secondary" onClick={onEdit}>
          Editar
        </Button>
      </div>
    </div>
  );
}

function PersonForm({
  initial,
  busy,
  currentUserId,
  onCancel,
  onSave,
}: {
  initial?: Person;
  busy: boolean;
  currentUserId: string | null;
  onCancel: () => void;
  onSave: (values: {
    name: string;
    shortName: string;
    color: string;
    userId?: string | null;
  }) => Promise<void>;
}) {
  const [name, setName] = useState(initial?.name ?? '');
  const [shortName, setShortName] = useState(initial?.short_name ?? '');
  const [color, setColor] = useState(initial?.color ?? COLORS[0]);
  const [linkMe, setLinkMe] = useState(
    Boolean(currentUserId && initial?.user_id === currentUserId),
  );
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit() {
    if (!name.trim() || !shortName.trim()) {
      setError('Nome e apelido são obrigatórios');
      return;
    }
    setError(null);
    const nextUserId = linkMe
      ? currentUserId
      : initial?.user_id === currentUserId
        ? null
        : (initial?.user_id ?? null);

    await onSave({
      name: name.trim(),
      shortName: shortName.trim(),
      color,
      userId: nextUserId,
    });
  }

  return (
    <div className="space-y-3 bg-bg/40 px-4 py-4">
      <Input
        label="Nome"
        name="person-name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Ex.: Ana"
      />
      <Input
        label="Apelido"
        name="person-short"
        value={shortName}
        onChange={(e) => setShortName(e.target.value)}
        placeholder="Ex.: A"
        hint="Aparece em listas e captura"
      />
      <fieldset className="space-y-1.5">
        <legend className="text-sm font-medium text-text-muted">Cor</legend>
        <div className="flex flex-wrap gap-2">
          {COLORS.map((c) => (
            <button
              key={c}
              type="button"
              aria-label={`Cor ${c}`}
              aria-pressed={color === c}
              onClick={() => setColor(c)}
              className={cn(
                'size-8 rounded-full border-2 transition-transform',
                color === c
                  ? 'scale-110 border-accent'
                  : 'border-transparent hover:scale-105',
              )}
              style={{ backgroundColor: c }}
            />
          ))}
        </div>
      </fieldset>
      {currentUserId ? (
        <label className="flex items-center gap-2 text-sm text-text">
          <input
            type="checkbox"
            checked={linkMe}
            onChange={(e) => setLinkMe(e.target.checked)}
            className="size-4 rounded border-border"
          />
          Ligar ao meu login (escopo Eu)
        </label>
      ) : null}
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
