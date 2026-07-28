import { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown, ChevronUp, Repeat, Trash2 } from 'lucide-react';
import { Sheet } from '@/components/ui/Sheet';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { AmountKeypad } from '@/components/money/AmountKeypad';
import { parseDigits } from '@/core/money';
import { monthRange } from '@/core/month';
import type { Occurrence } from '@/core/series';
import {
  useAccounts,
  useCategories,
  usePeopleQuery,
} from '@/features/capture/hooks/useCaptureLookups';
import {
  useConfirmOccurrence,
  useCreateEntry,
  useDeleteOccurrence,
  useSaveOccurrence,
} from '@/features/panel/hooks/useOccurrenceMutations';
import { ScopeChoice } from '@/features/panel/components/ScopeChoice';
import { cn } from '@/lib/cn';
import type {
  SeriesEditScope,
  Transaction,
  TransactionKind,
  TransactionStatus,
} from '@/types/models';

const KINDS: { value: TransactionKind; label: string }[] = [
  { value: 'expense', label: 'Saída' },
  { value: 'income', label: 'Entrada' },
  { value: 'transfer', label: 'Entre contas' },
];

type Props = {
  open: boolean;
  /** Null = criar. */
  occurrence: Occurrence | null;
  /** Linha-modelo, quando a ocorrência pertence a uma série. */
  template: Transaction | null;
  /** Mês aberto na tela — o novo lançamento nasce nele. */
  defaultYm: string;
  today: string;
  onClose: () => void;
};

/**
 * Criar e editar lançamento — previsto e realizado no mesmo formulário.
 *
 * "Repete todo mês" é o que substituiu a tela de Plano inteira: um lançamento
 * futuro marcado como mensal **é** o planejamento. Não existe mais uma segunda
 * entidade para o app tentar casar com esta.
 */
export function EntrySheet({
  open,
  occurrence,
  template,
  defaultYm,
  today,
  onClose,
}: Props) {
  const isEdit = occurrence != null;
  const inSeries = Boolean(occurrence?.seriesId && template);

  const { data: accounts = [] } = useAccounts();
  const { data: people = [] } = usePeopleQuery();
  const { data: categories = [] } = useCategories();

  const createMutation = useCreateEntry();
  const saveMutation = useSaveOccurrence();
  const deleteMutation = useDeleteOccurrence();
  const confirmMutation = useConfirmOccurrence();

  const sessionKey = useRef<string | null>(null);

  const [kind, setKind] = useState<TransactionKind>('expense');
  const [digits, setDigits] = useState('');
  const [description, setDescription] = useState('');
  const [accountId, setAccountId] = useState<string | null>(null);
  const [personId, setPersonId] = useState<string | null>(null);
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [transferAccountId, setTransferAccountId] = useState<string | null>(null);
  const [date, setDate] = useState(today);
  const [repeats, setRepeats] = useState(false);
  const [repeatsUntil, setRepeatsUntil] = useState('');
  const [status, setStatus] = useState<TransactionStatus>('actual');
  const [moreOpen, setMoreOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingScope, setPendingScope] =
    useState<null | { action: 'save' | 'delete' }>(null);

  useEffect(() => {
    if (!open) {
      sessionKey.current = null;
      return;
    }

    const nextKey = occurrence ? `edit:${occurrence.id}` : `new:${defaultYm}`;
    if (sessionKey.current === nextKey) return;
    sessionKey.current = nextKey;
    setError(null);
    setPendingScope(null);

    if (occurrence) {
      setKind(occurrence.kind);
      setDigits(String(occurrence.amountCents));
      setDescription(occurrence.description);
      setAccountId(occurrence.accountId);
      setPersonId(occurrence.personId);
      setCategoryId(occurrence.categoryId);
      setTransferAccountId(occurrence.transferAccountId);
      setDate(occurrence.date);
      setStatus(occurrence.status);
      setRepeats(Boolean(occurrence.seriesId));
      setRepeatsUntil(template?.recurrenceEnd ?? '');
      setMoreOpen(Boolean(occurrence.categoryId));
      return;
    }

    // Novo lançamento nasce no mês que está na tela, não sempre hoje.
    const { start, end } = monthRange(defaultYm);
    const initialDate = today >= start && today <= end ? today : start;
    setKind('expense');
    setDigits('');
    setDescription('');
    setAccountId(accounts[0]?.id ?? null);
    setPersonId(null);
    setCategoryId(null);
    setTransferAccountId(null);
    setDate(initialDate);
    setStatus(initialDate > today ? 'planned' : 'actual');
    setRepeats(false);
    setRepeatsUntil('');
    setMoreOpen(false);
  }, [open, occurrence, template, defaultYm, today, accounts]);

  // Data no futuro só pode ser expectativa.
  useEffect(() => {
    if (date > today && status === 'actual') setStatus('planned');
  }, [date, today, status]);

  const busy =
    createMutation.isPending ||
    saveMutation.isPending ||
    deleteMutation.isPending ||
    confirmMutation.isPending;

  const filteredCategories = categories.filter((c) =>
    kind === 'income' ? c.kind === 'income' : c.kind === 'expense',
  );

  function buildPatch() {
    const amountCents = parseDigits(digits);
    if (amountCents <= 0) {
      setError('Informe um valor maior que zero.');
      return null;
    }
    if (!description.trim()) {
      setError('Descreva o lançamento.');
      return null;
    }
    if (kind === 'transfer' && !transferAccountId) {
      setError('Transferência precisa de conta de destino.');
      return null;
    }
    if (kind === 'transfer' && transferAccountId === accountId) {
      setError('Origem e destino não podem ser a mesma conta.');
      return null;
    }
    setError(null);
    return {
      date,
      kind,
      description: description.trim(),
      amountCents,
      categoryId: kind === 'transfer' ? null : categoryId,
      personId,
      accountId,
      transferAccountId: kind === 'transfer' ? transferAccountId : null,
      status,
    };
  }

  async function handleSave(scope?: SeriesEditScope) {
    const patch = buildPatch();
    if (!patch) return;

    try {
      if (isEdit && occurrence) {
        await saveMutation.mutateAsync({ occurrence, template, patch, scope });
      } else {
        await createMutation.mutateAsync({
          ...patch,
          recurrence: repeats ? 'monthly' : 'none',
          recurrenceEnd: repeats && repeatsUntil ? repeatsUntil : null,
        });
      }
      onClose();
    } catch {
      // toast já sai na mutation
    }
  }

  async function handleDelete(scope?: SeriesEditScope) {
    if (!occurrence) return;
    try {
      await deleteMutation.mutateAsync({ occurrence, template, scope });
      onClose();
    } catch {
      // toast já sai na mutation
    }
  }

  async function handleConfirm() {
    if (!occurrence) return;
    try {
      await confirmMutation.mutateAsync({
        occurrence,
        amountCents: parseDigits(digits) || occurrence.amountCents,
        date,
      });
      onClose();
    } catch {
      // toast já sai na mutation
    }
  }

  if (pendingScope) {
    return (
      <Sheet open={open} onClose={onClose} title="Este mês ou daqui pra frente?">
        <ScopeChoice
          busy={busy}
          destructive={pendingScope.action === 'delete'}
          onCancel={() => setPendingScope(null)}
          onChoose={(scope) => {
            const run =
              pendingScope.action === 'save' ? handleSave : handleDelete;
            void run(scope);
          }}
        />
      </Sheet>
    );
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={isEdit ? 'Editar lançamento' : 'Novo lançamento'}
    >
      <div className="space-y-5">
        <div className="flex gap-1 rounded-lg border border-border bg-bg p-1">
          {KINDS.map((item) => (
            <button
              key={item.value}
              type="button"
              onClick={() => setKind(item.value)}
              className={cn(
                'flex-1 rounded-md px-2 py-2 text-xs font-medium transition-colors',
                kind === item.value
                  ? 'bg-accent-muted text-accent'
                  : 'text-text-muted hover:text-text',
              )}
            >
              {item.label}
            </button>
          ))}
        </div>

        <AmountKeypad digits={digits} onChange={setDigits} />

        <Input
          label="O quê"
          name="description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Ex.: aluguel, salário, mercado"
          autoComplete="off"
        />

        <div className="grid grid-cols-2 gap-3">
          <Input
            label="Quando"
            name="date"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
          <SelectField
            label="Conta"
            value={accountId ?? ''}
            onChange={(v) => setAccountId(v || null)}
            options={accounts.map((a) => ({ value: a.id, label: a.name }))}
            placeholder="Conta"
            allowEmpty
          />
        </div>

        {kind === 'transfer' ? (
          <SelectField
            label="Para conta"
            value={transferAccountId ?? ''}
            onChange={(v) => setTransferAccountId(v || null)}
            options={accounts
              .filter((a) => a.id !== accountId)
              .map((a) => ({ value: a.id, label: a.name }))}
            placeholder="Escolha o destino"
            allowEmpty
          />
        ) : null}

        <StatusToggle
          status={status}
          onChange={setStatus}
          lockedToPlanned={date > today}
        />

        {!isEdit ? (
          <RepeatField
            repeats={repeats}
            until={repeatsUntil}
            onToggle={setRepeats}
            onUntilChange={setRepeatsUntil}
          />
        ) : inSeries ? (
          <p className="flex items-center gap-2 rounded-lg border border-border bg-bg px-3 py-2.5 text-[12px] text-text-muted">
            <Repeat className="size-3.5 shrink-0 text-accent" aria-hidden />
            Faz parte de uma série mensal. Ao salvar você escolhe se vale só
            para este mês.
          </p>
        ) : null}

        <button
          type="button"
          onClick={() => setMoreOpen((v) => !v)}
          className="flex items-center gap-1 text-xs font-medium text-text-muted hover:text-text"
        >
          Mais opções
          {moreOpen ? (
            <ChevronUp className="size-3.5" aria-hidden />
          ) : (
            <ChevronDown className="size-3.5" aria-hidden />
          )}
        </button>

        {moreOpen ? (
          <div className="space-y-3 rounded-lg border border-border bg-bg p-3">
            {kind !== 'transfer' ? (
              <SelectField
                label="Categoria"
                value={categoryId ?? ''}
                onChange={(v) => setCategoryId(v || null)}
                options={filteredCategories.map((c) => ({
                  value: c.id,
                  label: c.name,
                }))}
                placeholder="Sem categoria"
                allowEmpty
              />
            ) : null}
            <SelectField
              label="Quem"
              value={personId ?? ''}
              onChange={(v) => setPersonId(v || null)}
              options={people.map((p) => ({
                value: p.id,
                label: p.short_name || p.name,
              }))}
              placeholder="Casa"
              allowEmpty
            />
          </div>
        ) : null}

        {error ? <p className="text-sm text-danger">{error}</p> : null}

        <div className="space-y-2">
          <Button
            className="w-full"
            disabled={busy}
            onClick={() => {
              if (inSeries) setPendingScope({ action: 'save' });
              else void handleSave();
            }}
          >
            {busy ? 'Salvando…' : isEdit ? 'Salvar' : 'Criar lançamento'}
          </Button>

          {isEdit && occurrence?.status === 'planned' ? (
            <Button
              variant="secondary"
              className="w-full gap-2"
              disabled={busy}
              onClick={() => void handleConfirm()}
            >
              <Check className="size-4" aria-hidden />
              Isso já aconteceu
            </Button>
          ) : null}

          {isEdit ? (
            <Button
              variant="ghost"
              className="w-full gap-2 text-danger hover:bg-danger/10"
              disabled={busy}
              onClick={() => {
                if (inSeries) setPendingScope({ action: 'delete' });
                else void handleDelete();
              }}
            >
              <Trash2 className="size-4" aria-hidden />
              Excluir
            </Button>
          ) : null}
        </div>
      </div>
    </Sheet>
  );
}

function StatusToggle({
  status,
  onChange,
  lockedToPlanned,
}: {
  status: TransactionStatus;
  onChange: (v: TransactionStatus) => void;
  lockedToPlanned: boolean;
}) {
  return (
    <div>
      <div className="flex gap-1 rounded-lg border border-border bg-bg p-1">
        {(
          [
            { value: 'actual' as const, label: 'Já aconteceu' },
            { value: 'planned' as const, label: 'É previsto' },
          ]
        ).map((item) => (
          <button
            key={item.value}
            type="button"
            disabled={lockedToPlanned && item.value === 'actual'}
            onClick={() => onChange(item.value)}
            className={cn(
              'flex-1 rounded-md px-2 py-2 text-xs font-medium transition-colors',
              status === item.value
                ? 'bg-accent-muted text-accent'
                : 'text-text-muted hover:text-text',
              lockedToPlanned &&
                item.value === 'actual' &&
                'cursor-not-allowed opacity-40 hover:text-text-muted',
            )}
          >
            {item.label}
          </button>
        ))}
      </div>
      {lockedToPlanned ? (
        <p className="mt-1.5 text-[11px] text-text-muted">
          Data no futuro — só pode ser previsto.
        </p>
      ) : null}
    </div>
  );
}

function RepeatField({
  repeats,
  until,
  onToggle,
  onUntilChange,
}: {
  repeats: boolean;
  until: string;
  onToggle: (v: boolean) => void;
  onUntilChange: (v: string) => void;
}) {
  return (
    <div className="rounded-lg border border-border bg-bg p-3">
      <label className="flex cursor-pointer items-center gap-2.5">
        <input
          type="checkbox"
          checked={repeats}
          onChange={(e) => onToggle(e.target.checked)}
          className="size-4 accent-[var(--color-accent)]"
        />
        <span className="flex items-center gap-1.5 text-sm text-text">
          <Repeat className="size-3.5 text-text-muted" aria-hidden />
          Repete todo mês
        </span>
      </label>

      {repeats ? (
        <div className="mt-3 space-y-1.5">
          <Input
            label="Até quando (opcional)"
            name="repeatsUntil"
            type="date"
            value={until}
            onChange={(e) => onUntilChange(e.target.value)}
          />
          <p className="text-[11px] leading-snug text-text-muted">
            Em branco, repete indefinidamente. Cada mês futuro aparece na linha
            como previsto e pode ser ajustado sozinho.
          </p>
        </div>
      ) : null}
    </div>
  );
}

function SelectField({
  label,
  value,
  onChange,
  options,
  placeholder,
  allowEmpty,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
  placeholder: string;
  allowEmpty?: boolean;
}) {
  return (
    <label className="block space-y-1.5 text-sm">
      <span className="font-medium text-text-muted">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={cn(
          'min-h-10 w-full rounded-md border border-border bg-bg px-3 text-sm text-text',
          'outline-none hover:border-border-strong focus:border-accent',
        )}
      >
        {allowEmpty ? <option value="">{placeholder}</option> : null}
        {options.map((opt) => (
          <option key={opt.value || '__empty__'} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </label>
  );
}
