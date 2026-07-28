import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, ChevronUp, Repeat, Trash2 } from 'lucide-react';
import { Sheet } from '@/components/ui/Sheet';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { CategorySelect } from '@/components/ui/CategorySelect';
import { AmountKeypad } from '@/components/money/AmountKeypad';
import { parseDigits } from '@/core/money';
import { monthRange } from '@/core/month';
import type { Occurrence } from '@/core/series';
import {
  buildRecentShortcuts,
  RecentShortcuts,
  type RecentShortcut,
} from '@/features/capture/components/RecentShortcuts';
import {
  getCaptureDefaults,
  saveCaptureDefaults,
} from '@/features/capture/lib/defaults';
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
import {
  detailsSummary,
  PersonChips,
  RepeatField,
  SelectField,
  StatusToggle,
  TransferAccounts,
} from '@/features/panel/components/EntrySheetFields';
import { ScopeChoice } from '@/features/panel/components/ScopeChoice';
import { useRecentTransactions } from '@/features/transactions/hooks/useTransactions';
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
 * Captura (camada A): valor → o quê → conta/quem → salvar.
 * Detalhes (camada B): quando, status, repete, categoria.
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
  const isPlannedEdit = isEdit && occurrence?.status === 'planned';

  const { data: accounts = [] } = useAccounts();
  const { data: people = [] } = usePeopleQuery();
  const { data: categories = [] } = useCategories();
  const { data: recent = [] } = useRecentTransactions(20);

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
  const [transferAccountId, setTransferAccountId] = useState<string | null>(
    null,
  );
  const [date, setDate] = useState(today);
  const [repeats, setRepeats] = useState(false);
  const [repeatsUntil, setRepeatsUntil] = useState('');
  const [status, setStatus] = useState<TransactionStatus>('actual');
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [keypadOpen, setKeypadOpen] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pendingScope, setPendingScope] = useState<null | {
    action: 'save' | 'delete';
  }>(null);

  const shortcuts = useMemo(
    () => (isEdit ? [] : buildRecentShortcuts(recent, 4)),
    [isEdit, recent],
  );

  useEffect(() => {
    if (!open) {
      sessionKey.current = null;
      return;
    }

    const nextKey = occurrence ? `edit:${occurrence.id}` : `new:${defaultYm}`;
    if (sessionKey.current === nextKey) {
      // Contas podem chegar depois do open — preenche default sem resetar o form.
      if (!occurrence && accounts.length > 0) {
        setAccountId((prev) => {
          if (prev && accounts.some((a) => a.id === prev)) return prev;
          const stored = getCaptureDefaults();
          if (
            stored.accountId &&
            accounts.some((a) => a.id === stored.accountId)
          ) {
            return stored.accountId;
          }
          return accounts[0]?.id ?? null;
        });
      }
      return;
    }
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
      setDetailsOpen(
        Boolean(
          occurrence.categoryId ||
            occurrence.status === 'planned' ||
            occurrence.seriesId,
        ),
      );
      setKeypadOpen(false);
      return;
    }

    const { start, end } = monthRange(defaultYm);
    const initialDate = today >= start && today <= end ? today : start;
    const stored = getCaptureDefaults();
    const storedAccount =
      stored.accountId && accounts.some((a) => a.id === stored.accountId)
        ? stored.accountId
        : (accounts[0]?.id ?? null);
    const storedPerson = stored.personIsCasa
      ? null
      : stored.personId && people.some((p) => p.id === stored.personId)
        ? stored.personId
        : null;

    setKind('expense');
    setDigits('');
    setDescription('');
    setAccountId(storedAccount);
    setPersonId(storedPerson);
    setCategoryId(null);
    setTransferAccountId(null);
    setDate(initialDate);
    setStatus(initialDate > today ? 'planned' : 'actual');
    setRepeats(false);
    setRepeatsUntil('');
    setDetailsOpen(false);
    setKeypadOpen(true);
  }, [open, occurrence, template, defaultYm, today, accounts, people]);

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

  const title = sheetTitle(isEdit, kind);
  const amountTone =
    kind === 'income' ? 'income' : kind === 'transfer' ? 'transfer' : 'expense';

  function applyShortcut(item: RecentShortcut) {
    setKind(item.kind);
    setDigits(String(item.amountCents));
    setDescription(item.description);
    setAccountId(item.accountId);
    setPersonId(item.personId);
    setCategoryId(item.categoryId);
    setTransferAccountId(item.transferAccountId);
    setKeypadOpen(false);
    if (item.categoryId) setDetailsOpen(true);
  }

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
      categoryId,
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
        saveCaptureDefaults({
          accountId: patch.accountId,
          personId: patch.personId,
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

  const scopeSummary = occurrence
    ? {
        description: description.trim() || occurrence.description,
        amountCents: parseDigits(digits) || occurrence.amountCents,
        date,
      }
    : null;

  if (pendingScope) {
    return (
      <Sheet open={open} onClose={onClose} title="Este mês ou daqui pra frente?">
        <ScopeChoice
          busy={busy}
          destructive={pendingScope.action === 'delete'}
          summary={scopeSummary}
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

  const footer = (
    <div className="space-y-2">
      {error ? <p className="text-sm text-danger">{error}</p> : null}

      {isPlannedEdit ? (
        <Button
          className="w-full gap-2"
          disabled={busy}
          onClick={() => void handleConfirm()}
        >
          <Check className="size-4" aria-hidden />
          {busy ? 'Confirmando…' : 'Isso já aconteceu'}
        </Button>
      ) : null}

      <Button
        className="w-full"
        variant={isPlannedEdit ? 'secondary' : 'primary'}
        disabled={busy}
        onClick={() => {
          if (inSeries) setPendingScope({ action: 'save' });
          else void handleSave();
        }}
      >
        {busy && !isPlannedEdit
          ? 'Salvando…'
          : isEdit
            ? isPlannedEdit
              ? 'Salvar alterações'
              : 'Salvar'
            : 'Salvar'}
      </Button>

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
  );

  return (
    <Sheet open={open} onClose={onClose} title={title} footer={footer}>
      <div className="space-y-4">
        <div className="flex gap-1 rounded-lg border border-border bg-bg p-0.5">
          {KINDS.map((item) => (
            <button
              key={item.value}
              type="button"
              onClick={() => {
                setKind(item.value);
                // Categoria é tipada por direção; troca de tipo invalida a seleção.
                setCategoryId((prev) => {
                  if (!prev) return prev;
                  const cat = categories.find((c) => c.id === prev);
                  if (!cat) return null;
                  const want =
                    item.value === 'income' ? 'income' : 'expense';
                  return cat.kind === want ? prev : null;
                });
              }}
              className={cn(
                'flex-1 rounded-md px-2 py-1.5 text-[11px] font-medium transition-colors',
                kind === item.value
                  ? 'bg-accent-muted text-accent'
                  : 'text-text-muted hover:text-text',
              )}
            >
              {item.label}
            </button>
          ))}
        </div>

        <AmountKeypad
          digits={digits}
          onChange={setDigits}
          tone={amountTone}
          expanded={keypadOpen}
          onExpandedChange={setKeypadOpen}
        />

        {!isEdit ? (
          <RecentShortcuts items={shortcuts} onPick={applyShortcut} />
        ) : null}

        <Input
          label="O quê"
          name="description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          onFocus={() => {
            if (digits) setKeypadOpen(false);
          }}
          placeholder="Ex.: aluguel, salário, mercado"
          autoComplete="off"
        />

        <div className="space-y-3">
          {kind === 'transfer' ? (
            <TransferAccounts
              accountId={accountId}
              transferAccountId={transferAccountId}
              accounts={accounts}
              onAccountChange={setAccountId}
              onTransferChange={setTransferAccountId}
            />
          ) : (
            <SelectField
              label="Conta"
              value={accountId ?? ''}
              onChange={(v) => setAccountId(v || null)}
              options={accounts.map((a) => ({ value: a.id, label: a.name }))}
              placeholder="Conta"
              allowEmpty
            />
          )}

          {people.length > 0 && kind !== 'transfer' ? (
            <PersonChips
              people={people}
              value={personId}
              onChange={setPersonId}
            />
          ) : null}
        </div>

        {isEdit && inSeries ? (
          <p className="flex items-center gap-2 rounded-lg border border-border bg-bg px-3 py-2.5 text-[12px] text-text-muted">
            <Repeat className="size-3.5 shrink-0 text-accent" aria-hidden />
            Faz parte de uma série mensal. Ao salvar você escolhe se vale só
            para este mês.
          </p>
        ) : null}

        <button
          type="button"
          onClick={() => setDetailsOpen((v) => !v)}
          className="flex w-full items-center justify-between gap-2 rounded-lg border border-border bg-bg px-3 py-2.5 text-left"
        >
          <span className="min-w-0">
            <span className="block text-xs font-medium text-text">Detalhes</span>
            {!detailsOpen ? (
              <span className="mt-0.5 block truncate text-[11px] text-text-muted">
                {detailsSummary({
                  date,
                  today,
                  status,
                  repeats: !isEdit && repeats,
                  categoryName:
                    categoryId != null
                      ? (filteredCategories.find((c) => c.id === categoryId)
                          ?.name ?? null)
                      : null,
                })}
              </span>
            ) : null}
          </span>
          {detailsOpen ? (
            <ChevronUp className="size-4 shrink-0 text-text-muted" aria-hidden />
          ) : (
            <ChevronDown
              className="size-4 shrink-0 text-text-muted"
              aria-hidden
            />
          )}
        </button>

        {detailsOpen ? (
          <div className="space-y-3 rounded-lg border border-border bg-bg p-3">
            <div className="flex items-end gap-2">
              <div className="min-w-0 flex-1">
                <Input
                  label="Quando"
                  name="date"
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                />
              </div>
              {date !== today ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="mb-0.5 shrink-0"
                  onClick={() => setDate(today)}
                >
                  Hoje
                </Button>
              ) : null}
            </div>

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
            ) : null}

            <CategorySelect
              label="Categoria"
              value={categoryId}
              onChange={setCategoryId}
              categories={filteredCategories}
              placeholder="Sem categoria"
              allowEmpty
              emptyLabel="Sem categoria"
            />
          </div>
        ) : null}
      </div>
    </Sheet>
  );
}

function sheetTitle(isEdit: boolean, kind: TransactionKind): string {
  if (isEdit) return 'Editar lançamento';
  if (kind === 'income') return 'Nova entrada';
  if (kind === 'transfer') return 'Transferência';
  return 'Nova saída';
}
