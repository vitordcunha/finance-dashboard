import { useState } from 'react';
import { Link } from 'react-router-dom';
import { FileUp, Plus, Wallet } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { Input } from '@/components/ui/Input';
import { Panel } from '@/components/ui/Panel';
import { Skeleton } from '@/components/ui/Skeleton';
import type { Account } from '@/data/supabase/types';
import type { AccountKind } from '@/data/accounts';
import { useAccounts, usePeopleQuery } from '@/features/capture/hooks/useCaptureLookups';
import {
  useArchiveAccount,
  useCreateAccount,
  useUpdateAccount,
} from '@/features/settings/hooks/useSettingsMutations';
import { cn } from '@/lib/cn';

const KINDS: { value: AccountKind; label: string }[] = [
  { value: 'checking', label: 'Corrente' },
  { value: 'credit', label: 'Cartão' },
  { value: 'cash', label: 'Dinheiro' },
  { value: 'savings', label: 'Poupança' },
];

const KIND_LABEL: Record<AccountKind, string> = {
  checking: 'Corrente',
  credit: 'Cartão',
  cash: 'Dinheiro',
  savings: 'Poupança',
};

export function AccountsSection() {
  const { data: accounts = [], isLoading, isError, refetch } = useAccounts();
  const { data: people = [] } = usePeopleQuery();
  const create = useCreateAccount();
  const update = useUpdateAccount();
  const archive = useArchiveAccount();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const personName = (id: string | null) => {
    if (!id) return 'Casa';
    const p = people.find((x) => x.id === id);
    return p?.short_name || p?.name || 'Pessoa';
  };

  return (
    <section className="space-y-3" aria-labelledby="settings-accounts">
      <div className="flex items-center justify-between gap-2">
        <h2
          id="settings-accounts"
          className="text-xs font-medium uppercase tracking-wide text-text-muted"
        >
          Contas
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
          icon={Wallet}
          title="Não deu para carregar contas"
          description="Tente de novo em instantes."
          action={
            <Button variant="secondary" size="sm" onClick={() => void refetch()}>
              Tentar de novo
            </Button>
          }
        />
      ) : null}

      {!isLoading && !isError && accounts.length === 0 && !creating ? (
        <EmptyState
          icon={Wallet}
          title="Nenhuma conta"
          description="Adicione corrente, cartão ou dinheiro para lançar."
          action={
            <Button size="sm" onClick={() => setCreating(true)}>
              Adicionar conta
            </Button>
          }
        />
      ) : null}

      {!isLoading && !isError ? (
        <Panel className="divide-y divide-border overflow-hidden p-0">
          {accounts.map((account) =>
            editingId === account.id ? (
              <AccountForm
                key={account.id}
                initial={account}
                people={people}
                busy={update.isPending}
                onCancel={() => setEditingId(null)}
                onSave={async (values) => {
                  await update.mutateAsync({ id: account.id, patch: values });
                  setEditingId(null);
                }}
              />
            ) : (
              <div
                key={account.id}
                className="flex items-center gap-3 px-4 py-3"
              >
                <span
                  className="size-3 shrink-0 rounded-full"
                  style={{ backgroundColor: account.color }}
                  aria-hidden
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-text">
                    {account.name}
                  </p>
                  <p className="text-xs text-text-muted">
                    {KIND_LABEL[account.kind]} · {personName(account.person_id)}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  {(account.kind === 'checking' ||
                    account.kind === 'credit' ||
                    account.kind === 'savings') && (
                    <Link
                      to={`/import?accountId=${account.id}`}
                      className={cn(
                        'inline-flex min-h-8 items-center justify-center gap-1 rounded-full px-3 text-xs font-medium',
                        'border border-border bg-surface-elevated text-text',
                        'hover:border-border-strong hover:bg-surface-hover',
                      )}
                      aria-label={`Importar extrato de ${account.name}`}
                    >
                      <FileUp className="size-3" aria-hidden />
                      Extrato
                    </Link>
                  )}
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => {
                      setEditingId(account.id);
                      setCreating(false);
                    }}
                  >
                    Editar
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      if (
                        window.confirm(
                          `Arquivar “${account.name}”? Ela some da captura.`,
                        )
                      ) {
                        void archive.mutateAsync(account.id);
                      }
                    }}
                  >
                    Arquivar
                  </Button>
                </div>
              </div>
            ),
          )}
          {creating ? (
            <AccountForm
              people={people}
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

function AccountForm({
  initial,
  people,
  busy,
  onCancel,
  onSave,
}: {
  initial?: Account;
  people: { id: string; name: string; short_name: string }[];
  busy: boolean;
  onCancel: () => void;
  onSave: (values: {
    name: string;
    kind: AccountKind;
    color: string;
    personId: string | null;
    creditLimitCents?: number;
    closingDay?: number | null;
    dueDay?: number | null;
  }) => Promise<void>;
}) {
  const [name, setName] = useState(initial?.name ?? '');
  const [kind, setKind] = useState<AccountKind>(initial?.kind ?? 'checking');
  const [color, setColor] = useState(initial?.color ?? '#8a8580');
  const [personId, setPersonId] = useState<string>(initial?.person_id ?? '');
  const [closingDay, setClosingDay] = useState(
    initial?.closing_day != null ? String(initial.closing_day) : '',
  );
  const [dueDay, setDueDay] = useState(
    initial?.due_day != null ? String(initial.due_day) : '',
  );
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
      color,
      personId: personId || null,
      closingDay:
        kind === 'credit' && closingDay
          ? Number.parseInt(closingDay, 10)
          : null,
      dueDay: kind === 'credit' && dueDay ? Number.parseInt(dueDay, 10) : null,
    });
  }

  return (
    <div className="space-y-3 bg-bg/40 px-4 py-4">
      <Input
        label="Nome"
        name="account-name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Ex.: Nubank, Itaú…"
      />
      <label className="block space-y-1.5 text-sm">
        <span className="font-medium text-text-muted">Tipo</span>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {KINDS.map((k) => (
            <button
              key={k.value}
              type="button"
              onClick={() => setKind(k.value)}
              className={cn(
                'min-h-10 rounded-md border text-xs font-medium transition-colors',
                kind === k.value
                  ? 'border-accent bg-accent/10 text-text'
                  : 'border-border text-text-muted hover:border-border-strong',
              )}
            >
              {k.label}
            </button>
          ))}
        </div>
      </label>
      <label className="block space-y-1.5 text-sm">
        <span className="font-medium text-text-muted">Dono (visual)</span>
        <select
          value={personId}
          onChange={(e) => setPersonId(e.target.value)}
          className="min-h-10 w-full rounded-md border border-border bg-bg px-3 text-sm text-text"
        >
          <option value="">Casa</option>
          {people.map((p) => (
            <option key={p.id} value={p.id}>
              {p.short_name || p.name}
            </option>
          ))}
        </select>
      </label>
      <Input
        label="Cor (hex)"
        name="account-color"
        value={color}
        onChange={(e) => setColor(e.target.value)}
      />
      {kind === 'credit' ? (
        <div className="grid grid-cols-2 gap-3">
          <Input
            label="Fecha dia"
            name="closing"
            type="number"
            min={1}
            max={31}
            value={closingDay}
            onChange={(e) => setClosingDay(e.target.value)}
          />
          <Input
            label="Vence dia"
            name="due"
            type="number"
            min={1}
            max={31}
            value={dueDay}
            onChange={(e) => setDueDay(e.target.value)}
          />
        </div>
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
