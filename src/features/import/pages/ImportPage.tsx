import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, FileUp, Upload } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { PageHeader } from '@/components/ui/PageHeader';
import { Panel } from '@/components/ui/Panel';
import { Skeleton } from '@/components/ui/Skeleton';
import { isHighConfidence } from '@/core/import';
import {
  useAccounts,
  useCategories,
  usePeopleQuery,
} from '@/features/capture/hooks/useCaptureLookups';
import { CreateImportSheet } from '@/features/import/components/CreateImportSheet';
import { ImportBulkBar } from '@/features/import/components/ImportBulkBar';
import { ImportLineRow } from '@/features/import/components/ImportLineRow';
import { ImportPersonField } from '@/features/import/components/ImportPersonField';
import { ManualMatchSheet } from '@/features/import/components/ManualMatchSheet';
import { TransferDestinationSheet } from '@/features/import/components/TransferDestinationSheet';
import {
  useApplyImportBatch,
  useCategorizationRules,
  useConfirmAllSuggested,
  useConfirmSuggestedMatch,
  useConvertImportLinesToTransfer,
  useCreateFromImportLine,
  useCreatePendingImportLines,
  useFinishImportBatch,
  useIgnoreImportLine,
  useIgnorePendingImportLines,
  useImportBatch,
  useImportLines,
  useStartImport,
  useUndoImportLine,
} from '@/features/import/hooks/useImport';
import {
  resolveImportPersonId,
  writeStoredImportPerson,
} from '@/features/import/lib/defaults';
import { useScope } from '@/features/scope/hooks/useScope';
import type { ImportLine, ImportLineStatus } from '@/types/models';
import { cn } from '@/lib/cn';

type Step = 'pick' | 'review';
type FilterValue = ImportLineStatus | 'all' | 'attention';

const FILTERS: { value: FilterValue; label: string }[] = [
  { value: 'all', label: 'Todas' },
  { value: 'attention', label: 'Atenção' },
  { value: 'unmatched', label: 'Novas' },
  { value: 'suggested', label: 'Sugestões' },
  { value: 'matched', label: 'Vinculadas' },
  { value: 'created', label: 'Criadas' },
  { value: 'ignored', label: 'Ignoradas' },
];

export function ImportPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const presetAccountId = params.get('accountId') ?? '';
  const batchIdParam = params.get('batchId') ?? undefined;

  const { mePersonId } = useScope();
  const { data: accounts = [], isLoading: loadingAccounts } = useAccounts();
  const { data: people = [], isLoading: loadingPeople } = usePeopleQuery();
  const { data: categories = [] } = useCategories();
  const { data: rules = [] } = useCategorizationRules();

  const importable = useMemo(
    () =>
      accounts.filter(
        (a) =>
          a.kind === 'checking' || a.kind === 'credit' || a.kind === 'savings',
      ),
    [accounts],
  );

  const [accountId, setAccountId] = useState(presetAccountId);
  const [batchId, setBatchId] = useState<string | undefined>(batchIdParam);
  const [filter, setFilter] = useState<FilterValue>('all');
  const [matchLine, setMatchLine] = useState<ImportLine | null>(null);
  const [transferLine, setTransferLine] = useState<ImportLine | null>(null);
  const [createLine, setCreateLine] = useState<ImportLine | null>(null);
  const [personId, setPersonId] = useState<string | null>(null);
  const [personReady, setPersonReady] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (presetAccountId) setAccountId(presetAccountId);
  }, [presetAccountId]);

  useEffect(() => {
    if (batchIdParam) setBatchId(batchIdParam);
  }, [batchIdParam]);

  useEffect(() => {
    if (loadingPeople) return;
    const account = importable.find((a) => a.id === accountId);
    const resolved = resolveImportPersonId({
      mePersonId,
      accountPersonId: account?.person_id,
      peopleIds: people.map((p) => p.id),
    });
    setPersonId(resolved);
    setPersonReady(true);
  }, [loadingPeople, people, mePersonId, accountId, importable]);

  const start = useStartImport();
  const apply = useApplyImportBatch();
  const { data: batch, isLoading: loadingBatch } = useImportBatch(batchId);
  const { data: lines = [], isLoading: loadingLines } = useImportLines(batchId);
  const createFrom = useCreateFromImportLine();
  const createPending = useCreatePendingImportLines();
  const convertTransfers = useConvertImportLinesToTransfer();
  const ignorePending = useIgnorePendingImportLines();
  const confirmAll = useConfirmAllSuggested();
  const ignore = useIgnoreImportLine();
  const undo = useUndoImportLine();
  const confirm = useConfirmSuggestedMatch();
  const finish = useFinishImportBatch();

  const step: Step = batchId ? 'review' : 'pick';
  const effectiveAccountId = batch?.accountId ?? accountId;

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: lines.length, attention: 0 };
    for (const l of lines) {
      c[l.status] = (c[l.status] ?? 0) + 1;
      if (l.status === 'unmatched' || l.status === 'suggested') {
        c.attention += 1;
      }
    }
    return c;
  }, [lines]);

  const filtered = useMemo(() => {
    if (filter === 'all') return lines;
    if (filter === 'attention') {
      return lines.filter(
        (l) => l.status === 'unmatched' || l.status === 'suggested',
      );
    }
    return lines.filter((l) => l.status === filter);
  }, [lines, filter]);

  const unmatchedCount = counts.unmatched ?? 0;
  const suggestedCount = counts.suggested ?? 0;
  const pendingCount = unmatchedCount + suggestedCount;
  const highConfidenceCount = useMemo(
    () =>
      lines.filter(
        (l) =>
          l.status === 'suggested' &&
          l.matchConfidence != null &&
          isHighConfidence(l.matchConfidence),
      ).length,
    [lines],
  );
  const autoImportCount = unmatchedCount + highConfidenceCount;

  const accountName =
    importable.find((a) => a.id === effectiveAccountId)?.name ?? 'Conta';

  const bulkBusy =
    apply.isPending ||
    createPending.isPending ||
    ignorePending.isPending ||
    confirmAll.isPending ||
    convertTransfers.isPending;

  const rowBusy =
    bulkBusy ||
    createFrom.isPending ||
    ignore.isPending ||
    undo.isPending ||
    confirm.isPending;

  function onPersonChange(next: string | null) {
    setPersonId(next);
    writeStoredImportPerson(next);
  }

  async function onFile(file: File | undefined) {
    if (!file || !accountId || !personReady) return;
    const result = await start.mutateAsync({
      accountId,
      file,
      personId,
    });
    setBatchId(result.batch.id);
    setFilter('all');
    navigate(
      `/import?accountId=${accountId}&batchId=${result.batch.id}`,
      { replace: true },
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6 animate-fade-in">
      <div>
        <Link
          to={
            presetAccountId &&
            importable.find((a) => a.id === presetAccountId)?.kind === 'credit'
              ? `/cards/${presetAccountId}`
              : '/settings'
          }
          className="mb-3 inline-flex items-center gap-1.5 text-sm text-text-muted hover:text-text"
        >
          <ArrowLeft className="size-4" aria-hidden />
          Voltar
        </Link>
        <PageHeader
          eyebrow="Organização"
          title="Importar extrato"
          description="Anexe OFX ou CSV, revise as linhas e importe quando estiver pronto."
        />
      </div>

      {step === 'pick' ? (
        <Panel className="space-y-5 p-5">
          <div className="space-y-2">
            <label
              htmlFor="import-account"
              className="text-sm font-medium text-text-muted"
            >
              Conta
            </label>
            {loadingAccounts ? (
              <Skeleton className="h-10 w-full" />
            ) : (
              <select
                id="import-account"
                value={accountId}
                onChange={(e) => setAccountId(e.target.value)}
                className="min-h-10 w-full rounded-md border border-border bg-bg px-3 text-sm text-text outline-none hover:border-border-strong focus:border-accent"
              >
                <option value="">Selecione…</option>
                {importable.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name} (
                    {a.kind === 'credit'
                      ? 'Cartão'
                      : a.kind === 'checking'
                        ? 'Corrente'
                        : 'Poupança'}
                    )
                  </option>
                ))}
              </select>
            )}
          </div>

          {loadingPeople ? (
            <Skeleton className="h-16 w-full" />
          ) : (
            <ImportPersonField
              people={people}
              mePersonId={mePersonId}
              value={personId}
              onChange={onPersonChange}
              hint="Padrão: você. Só mude para Casa ou outra pessoa se quiser."
            />
          )}

          <div className="space-y-2">
            <p className="text-sm font-medium text-text-muted">Arquivo</p>
            <input
              ref={fileRef}
              type="file"
              accept=".ofx,.qfx,.csv,text/csv,application/x-ofx"
              className="sr-only"
              onChange={(e) => void onFile(e.target.files?.[0])}
            />
            <Button
              variant="secondary"
              className="w-full"
              disabled={!accountId || !personReady || start.isPending}
              onClick={() => fileRef.current?.click()}
            >
              <Upload className="size-4" aria-hidden />
              {start.isPending ? 'Lendo arquivo…' : 'Escolher OFX ou CSV'}
            </Button>
            <p className="text-xs text-text-muted">
              Só lê e mostra as linhas. Você decide quando criar os
              lançamentos. Mesmo arquivo de novo não duplica o lote.
            </p>
          </div>
        </Panel>
      ) : null}

      {step === 'review' ? (
        <>
          {(loadingBatch || loadingLines) && !lines.length ? (
            <Skeleton className="h-40 w-full rounded-xl" />
          ) : null}

          <Panel className="space-y-3 p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="font-mono text-[11px] uppercase tracking-[0.12em] text-text-muted">
                  Lote
                </p>
                <p className="text-sm font-medium text-text">
                  {batch?.fileName ?? '…'} · {accountName}
                </p>
                <p className="text-xs text-text-muted">
                  {lines.length}{' '}
                  {lines.length === 1 ? 'linha' : 'linhas'}
                  {highConfidenceCount > 0
                    ? ` · ${highConfidenceCount} vínculo${highConfidenceCount === 1 ? '' : 's'} óbvio${highConfidenceCount === 1 ? '' : 's'}`
                    : ''}
                  {unmatchedCount > 0
                    ? ` · ${unmatchedCount} nova${unmatchedCount === 1 ? '' : 's'}`
                    : ''}
                  {pendingCount === 0 && lines.length > 0
                    ? ' · nada pendente'
                    : ''}
                </p>
              </div>
              <Button
                size="sm"
                disabled={
                  finish.isPending ||
                  batch?.status === 'applied' ||
                  pendingCount > 0
                }
                onClick={() => {
                  if (!batchId) return;
                  void finish.mutateAsync(batchId);
                }}
              >
                {batch?.status === 'applied' ? 'Concluído' : 'Concluir'}
              </Button>
            </div>

            {loadingPeople ? (
              <Skeleton className="h-10 w-full" />
            ) : (
              <ImportPersonField
                id="import-person-review"
                people={people}
                mePersonId={mePersonId}
                value={personId}
                onChange={onPersonChange}
                hint="Vale ao importar automaticamente e ao criar linha a linha."
              />
            )}

            <div className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1">
              {FILTERS.map((f) => (
                <button
                  key={f.value}
                  type="button"
                  onClick={() => setFilter(f.value)}
                  className={cn(
                    'shrink-0 rounded-full px-3 py-1.5 text-xs font-medium transition-colors',
                    filter === f.value
                      ? 'bg-accent text-accent-fg'
                      : 'bg-surface-elevated text-text-muted hover:text-text',
                  )}
                >
                  {f.label}
                  {f.value !== 'all' && counts[f.value]
                    ? ` ${counts[f.value]}`
                    : f.value === 'all'
                      ? ` ${counts.all ?? 0}`
                      : ''}
                </button>
              ))}
            </div>
          </Panel>

          <ImportBulkBar
            autoImportCount={autoImportCount}
            unmatchedCount={unmatchedCount}
            suggestedCount={suggestedCount}
            busy={bulkBusy || !batchId}
            onAutoImport={() => {
              if (!batchId || !effectiveAccountId) return;
              void apply.mutateAsync({
                lines,
                batchId,
                accountId: effectiveAccountId,
                personId,
              }).then(() => setFilter('attention'));
            }}
            onCreatePending={() => {
              if (!batchId || !effectiveAccountId) return;
              void createPending.mutateAsync({
                lines,
                batchId,
                accountId: effectiveAccountId,
                personId,
              });
            }}
            onConfirmSuggested={() => {
              if (!batchId) return;
              void confirmAll.mutateAsync({ lines, batchId });
            }}
            onIgnorePending={() => {
              if (!batchId) return;
              void ignorePending.mutateAsync({ lines, batchId });
            }}
          />

          {filtered.length === 0 ? (
            <EmptyState
              icon={FileUp}
              title={
                filter === 'attention'
                  ? 'Nada pedindo atenção'
                  : 'Nada neste filtro'
              }
              description={
                filter === 'attention'
                  ? 'Tudo certo — conclua o lote ou veja Todas.'
                  : 'Troque o filtro ou importe outro arquivo.'
              }
            />
          ) : (
            <Panel className="divide-y divide-border overflow-hidden p-0">
              <ul>
                {filtered.map((line) => (
                  <ImportLineRow
                    key={line.id}
                    line={line}
                    busy={rowBusy}
                    onConfirmSuggested={() =>
                      void confirm.mutateAsync({ line, batchId: batchId! })
                    }
                    onCreate={() => setCreateLine(line)}
                    onCreateTransfer={() => setTransferLine(line)}
                    onMatch={() => setMatchLine(line)}
                    onIgnore={() =>
                      void ignore.mutateAsync({
                        lineId: line.id,
                        batchId: batchId!,
                      })
                    }
                    onUndo={() =>
                      void undo.mutateAsync({ line, batchId: batchId! })
                    }
                    onConvertTransfer={() => setTransferLine(line)}
                  />
                ))}
              </ul>
            </Panel>
          )}

          <Button
            variant="secondary"
            className="w-full"
            onClick={() => {
              setBatchId(undefined);
              navigate(
                accountId ? `/import?accountId=${accountId}` : '/import',
                { replace: true },
              );
            }}
          >
            Novo arquivo
          </Button>
        </>
      ) : null}

      <ManualMatchSheet
        open={Boolean(matchLine)}
        onClose={() => setMatchLine(null)}
        line={matchLine}
        batchId={batchId ?? ''}
        accountId={effectiveAccountId}
      />

      <CreateImportSheet
        open={Boolean(createLine)}
        onClose={() => setCreateLine(null)}
        line={createLine}
        lines={lines}
        categories={categories}
        rules={rules}
        busy={createFrom.isPending}
        onConfirm={({ categoryId, applySame, remember }) => {
          const line = createLine;
          if (!line || !batchId) return;
          void createFrom
            .mutateAsync({
              line,
              batchId,
              accountId: effectiveAccountId,
              personId,
              categoryId,
              applySame,
              remember,
              allLines: lines,
            })
            .then(() => setCreateLine(null));
        }}
      />

      <TransferDestinationSheet
        open={Boolean(transferLine)}
        onClose={() => setTransferLine(null)}
        line={transferLine}
        sourceAccountId={effectiveAccountId}
        accounts={accounts}
        busy={createFrom.isPending || convertTransfers.isPending}
        onConfirm={(transferAccountId) => {
          const line = transferLine;
          if (!line || !batchId) return;

          const done = () => setTransferLine(null);

          if (line.status === 'created' && line.createdTransactionId) {
            void convertTransfers
              .mutateAsync({ lines: [line], batchId, transferAccountId })
              .then(done);
            return;
          }

          void createFrom
            .mutateAsync({
              line,
              batchId,
              accountId: effectiveAccountId,
              personId,
              transferAccountId,
            })
            .then(done);
        }}
      />
    </div>
  );
}
