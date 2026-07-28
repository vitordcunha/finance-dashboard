import {
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  categoryByLineFromRules,
  fingerprint,
  pendingLinesSameFingerprint,
} from '@/core/categorization';
import {
  assignMatches,
  detectSource,
  isHighConfidence,
  parseImportFile,
  sha256Hex,
  type MatchCandidate,
} from '@/core/import';
import {
  bumpCategorizationRuleHits,
  listCategorizationRules,
  upsertCategorizationRule,
} from '@/data/categorization-rules';
import {
  createImportBatch,
  findBatchByChecksum,
  getImportBatch,
  listImportLines,
  updateImportBatchStatus,
  updateImportLine,
  updateImportLinesByIds,
  upsertImportLines,
  type CreateImportBatchLineInput,
} from '@/data/imports';
import { qk } from '@/data/query-keys';
import {
  deleteTransaction,
  deleteTransactions,
  listTransactionsForMatch,
  updateTransactionsByIds,
} from '@/data/transactions';
import { useAuth } from '@/features/auth/hooks/useAuth';
import { useHousehold } from '@/features/auth/hooks/useHousehold';
import {
  createFromImportLine,
  createFromImportLines,
} from '@/features/import/lib/create-from-line';
import { writeStoredImportPerson } from '@/features/import/lib/defaults';
import type { ImportLine, Transaction } from '@/types/models';

function shiftDate(iso: string, days: number): string {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function toCandidates(txs: Transaction[]): MatchCandidate[] {
  return txs
    .filter((t) => t.accountId && (t.kind === 'expense' || t.kind === 'income'))
    .map((t) => ({
      transactionId: t.id,
      date: t.date,
      amountCents: t.amountCents,
      description: t.description,
      accountId: t.accountId!,
    }));
}

function invalidateImport(
  queryClient: ReturnType<typeof useQueryClient>,
  batchId: string,
) {
  void queryClient.invalidateQueries({ queryKey: qk.importBatch(batchId) });
  void queryClient.invalidateQueries({ queryKey: qk.importLines(batchId) });
  void queryClient.invalidateQueries({ queryKey: qk.transactionsRecent() });
  void queryClient.invalidateQueries({ queryKey: ['transactions'] });
  void queryClient.invalidateQueries({ queryKey: ['month'] });
  void queryClient.invalidateQueries({ queryKey: qk.cards() });
  void queryClient.invalidateQueries({ queryKey: ['card'] });
  void queryClient.invalidateQueries({ queryKey: qk.categorizationRules() });
}

async function categoryMapFromSavedRules(
  householdId: string,
  lines: ImportLine[],
): Promise<{ map: Map<string, string | null>; usedFingerprints: string[] }> {
  const rules = await listCategorizationRules(householdId);
  const fromRules = categoryByLineFromRules(lines, rules);
  const map = new Map<string, string | null>();
  const usedFingerprints: string[] = [];
  for (const [lineId, categoryId] of fromRules) {
    map.set(lineId, categoryId);
  }
  for (const line of lines) {
    if (fromRules.has(line.id)) {
      const fp = fingerprint(line.descriptionRaw);
      if (fp) usedFingerprints.push(fp);
    }
  }
  return { map, usedFingerprints };
}

type UndoCreated = {
  lineId: string;
  transactionId: string;
};

type UndoMatched = {
  lineId: string;
  /** Snapshot da line como `suggested` para restaurar no desfazer. */
  restoreSuggested?: ImportLine;
};

async function undoCreatedAndMatched(
  created: UndoCreated[],
  matched: UndoMatched[],
) {
  if (created.length > 0) {
    await deleteTransactions(created.map((item) => item.transactionId));
    await updateImportLinesByIds(
      created.map((item) => item.lineId),
      {
        status: 'unmatched',
        createdTransactionId: null,
        matchedTransactionId: null,
        matchConfidence: null,
      },
    );
  }
  if (matched.length === 0) return;

  const toSuggested = matched.filter((m) => m.restoreSuggested);
  const toClear = matched.filter((m) => !m.restoreSuggested);

  if (toClear.length > 0) {
    await updateImportLinesByIds(
      toClear.map((item) => item.lineId),
      {
        status: 'unmatched',
        matchedTransactionId: null,
        createdTransactionId: null,
        matchConfidence: null,
      },
    );
  }

  if (toSuggested.length > 0) {
    await upsertImportLines(
      toSuggested.map((item) => {
        const line = item.restoreSuggested!;
        return {
          id: line.id,
          batchId: line.batchId,
          postedOn: line.postedOn,
          amountCents: line.amountCents,
          descriptionRaw: line.descriptionRaw,
          externalId: line.externalId,
          kind: line.kind,
          status: 'suggested' as const,
          matchedTransactionId: line.matchedTransactionId,
          createdTransactionId: null,
          matchConfidence: line.matchConfidence,
          createdAt: line.createdAt,
        };
      }),
    );
  }
}

export function useImportBatch(batchId: string | undefined) {
  return useQuery({
    queryKey: qk.importBatch(batchId ?? ''),
    enabled: Boolean(batchId),
    queryFn: () => getImportBatch(batchId!),
  });
}

export function useImportLines(batchId: string | undefined) {
  return useQuery({
    queryKey: qk.importLines(batchId ?? ''),
    enabled: Boolean(batchId),
    queryFn: () => listImportLines(batchId!),
  });
}

export function useCategorizationRules() {
  const { householdId } = useHousehold();
  return useQuery({
    queryKey: qk.categorizationRules(),
    enabled: Boolean(householdId),
    queryFn: () => listCategorizationRules(householdId!),
  });
}

/**
 * Fase 1: anexa o arquivo, cria batch + lines com prévia de match.
 * Não cria transactions nem aplica `matched` — isso fica em `useApplyImportBatch`.
 */
export function useStartImport() {
  const queryClient = useQueryClient();
  const { householdId } = useHousehold();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({
      accountId,
      file,
      personId,
    }: {
      accountId: string;
      file: File;
      /** Dono padrão dos lançamentos criados (`null` = Casa). */
      personId: string | null;
    }) => {
      if (!householdId) throw new Error('Household não encontrado');

      writeStoredImportPerson(personId);

      const raw = await file.text();
      const source = detectSource(file.name);
      const parsed = parseImportFile(raw, source);
      if (parsed.lines.length === 0) {
        throw new Error('Nenhuma linha encontrada no arquivo');
      }

      const checksum = await sha256Hex(raw);

      if (checksum) {
        const existing = await findBatchByChecksum(accountId, checksum);
        if (existing) {
          const lines = await listImportLines(existing.id);
          return {
            batch: existing,
            lines,
            suggested: lines.filter((l) => l.status === 'suggested').length,
            unmatched: lines.filter((l) => l.status === 'unmatched').length,
            highConfidence: lines.filter(
              (l) =>
                l.status === 'suggested' &&
                l.matchConfidence != null &&
                isHighConfidence(l.matchConfidence),
            ).length,
            reused: true as const,
          };
        }
      }

      const from = shiftDate(
        parsed.periodStart ?? parsed.lines[0]!.postedOn,
        -2,
      );
      const to = shiftDate(
        parsed.periodEnd ??
          parsed.lines[parsed.lines.length - 1]!.postedOn,
        2,
      );
      const txs = await listTransactionsForMatch(
        householdId,
        accountId,
        from,
        to,
      );
      const candidates = toCandidates(txs);
      const suggestions = assignMatches(
        parsed.lines.map((l) => ({
          postedOn: l.postedOn,
          amountCents: l.amountCents,
          description: l.description,
          kind: l.kind,
        })),
        candidates,
      );

      // Prévia: qualquer match vira `suggested` (alta confiança só aplica no CTA).
      const linesWithMatch: CreateImportBatchLineInput[] = parsed.lines.map(
        (line, i) => {
          const suggestion = suggestions[i];
          if (!suggestion) {
            return { ...line, status: 'unmatched' as const };
          }
          return {
            ...line,
            status: 'suggested' as const,
            matchedTransactionId: suggestion.transactionId,
            matchConfidence: suggestion.confidence,
          };
        },
      );

      const { batch, lines } = await createImportBatch({
        householdId,
        accountId,
        source,
        fileName: file.name,
        checksum,
        periodStart: parsed.periodStart,
        periodEnd: parsed.periodEnd,
        createdBy: user?.id ?? null,
        lines: linesWithMatch,
      });

      const suggested = lines.filter((l) => l.status === 'suggested').length;
      const unmatched = lines.filter((l) => l.status === 'unmatched').length;
      const highConfidence = lines.filter(
        (l) =>
          l.status === 'suggested' &&
          l.matchConfidence != null &&
          isHighConfidence(l.matchConfidence),
      ).length;

      return {
        batch,
        lines,
        suggested,
        unmatched,
        highConfidence,
        reused: false as const,
      };
    },
    onSuccess: (result) => {
      invalidateImport(queryClient, result.batch.id);

      if (result.reused) {
        toast.message('Este arquivo já foi importado — abrindo o lote');
        return;
      }

      const parts: string[] = [
        `${result.lines.length} ${result.lines.length === 1 ? 'linha' : 'linhas'}`,
      ];
      if (result.highConfidence > 0) {
        parts.push(
          `${result.highConfidence} ${result.highConfidence === 1 ? 'vínculo óbvio' : 'vínculos óbvios'}`,
        );
      }
      if (result.unmatched > 0) {
        parts.push(
          `${result.unmatched} ${result.unmatched === 1 ? 'nova' : 'novas'}`,
        );
      }
      toast.success(`${parts.join(' · ')} — revise e importe`);
    },
    onError: (err: Error) => {
      toast.error(err.message || 'Não deu para ler o arquivo');
    },
  });
}

/**
 * Fase 2: aplica o lote — alta confiança → matched; unmatched → cria lançamentos.
 * Sugestões médias ficam para revisão manual.
 */
export function useApplyImportBatch() {
  const queryClient = useQueryClient();
  const { householdId } = useHousehold();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({
      lines,
      batchId,
      accountId,
      personId,
    }: {
      lines: ImportLine[];
      batchId: string;
      accountId: string;
      personId: string | null;
    }) => {
      if (!householdId) throw new Error('Household não encontrado');

      writeStoredImportPerson(personId);

      const highConf = lines.filter(
        (l) =>
          l.status === 'suggested' &&
          l.matchedTransactionId &&
          l.matchConfidence != null &&
          isHighConfidence(l.matchConfidence),
      );

      if (highConf.length > 0) {
        await updateImportLinesByIds(
          highConf.map((l) => l.id),
          { status: 'matched' },
        );
      }

      const undoMatched: UndoMatched[] = highConf.map((l) => ({
        lineId: l.id,
        restoreSuggested: l,
      }));

      const toCreate = lines.filter((l) => l.status === 'unmatched');
      const { map: categoryByLineId, usedFingerprints } =
        await categoryMapFromSavedRules(householdId, toCreate);

      const { created, linked } = await createFromImportLines({
        householdId,
        lines: toCreate,
        batchId,
        accountId,
        personId,
        createdBy: user?.id ?? null,
        categoryByLineId,
      });

      if (usedFingerprints.length > 0) {
        await bumpCategorizationRuleHits(householdId, usedFingerprints);
      }

      for (const item of linked) {
        undoMatched.push({ lineId: item.line.id });
      }

      const undoCreated: UndoCreated[] = created.map((item) => ({
        lineId: item.line.id,
        transactionId: item.tx.id,
      }));

      const transferCreated = created.filter(
        (item) => item.tx.kind === 'transfer',
      ).length;

      const freshLines = await listImportLines(batchId);
      const suggestedLeft = freshLines.filter(
        (l) => l.status === 'suggested',
      ).length;

      return {
        batchId,
        lines: freshLines,
        autoMatched: undoMatched.length,
        autoCreated: undoCreated.length,
        transferCreated,
        suggestedLeft,
        undoPayload: { created: undoCreated, matched: undoMatched },
      };
    },
    onSuccess: (result) => {
      invalidateImport(queryClient, result.batchId);

      if (
        result.autoCreated === 0 &&
        result.autoMatched === 0
      ) {
        toast.message(
          result.suggestedLeft > 0
            ? 'Nada automático — revise as sugestões'
            : 'Nada pendente para importar',
        );
        return;
      }

      const parts: string[] = [];
      if (result.autoCreated > 0) {
        parts.push(
          `${result.autoCreated} ${result.autoCreated === 1 ? 'criada' : 'criadas'}`,
        );
      }
      if (result.transferCreated > 0) {
        parts.push(
          `${result.transferCreated} ${result.transferCreated === 1 ? 'transferência' : 'transferências'}`,
        );
      }
      if (result.autoMatched > 0) {
        parts.push(
          `${result.autoMatched} ${result.autoMatched === 1 ? 'vinculada' : 'vinculadas'}`,
        );
      }
      if (result.suggestedLeft > 0) {
        parts.push(
          `${result.suggestedLeft} ${result.suggestedLeft === 1 ? 'sugestão restante' : 'sugestões restantes'}`,
        );
      }

      const payload = result.undoPayload;
      const canUndo =
        payload.created.length > 0 || payload.matched.length > 0;

      toast.success(parts.join(' · '), {
        action: canUndo
          ? {
              label: 'Desfazer',
              onClick: () => {
                void (async () => {
                  await undoCreatedAndMatched(
                    payload.created,
                    payload.matched,
                  );
                  invalidateImport(queryClient, result.batchId);
                  toast.message('Importação desfeita');
                })();
              },
            }
          : undefined,
      });
    },
    onError: (err: Error) => {
      toast.error(err.message || 'Não deu para importar automaticamente');
    },
  });
}

export function useMatchImportLine() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      lineId,
      batchId,
      transactionId,
    }: {
      lineId: string;
      batchId: string;
      transactionId: string;
    }) => {
      const line = await updateImportLine(lineId, {
        status: 'matched',
        matchedTransactionId: transactionId,
        matchConfidence: 100,
        createdTransactionId: null,
      });
      return { line, batchId };
    },
    onSuccess: ({ batchId }) => {
      invalidateImport(queryClient, batchId);
      toast.success('Linha vinculada');
    },
    onError: () => toast.error('Não deu para vincular'),
  });
}

export function useCreateFromImportLine() {
  const queryClient = useQueryClient();
  const { householdId } = useHousehold();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({
      line,
      batchId,
      accountId,
      personId,
      categoryId,
      transferAccountId,
      applySame,
      remember,
      allLines,
    }: {
      line: ImportLine;
      batchId: string;
      accountId: string;
      personId?: string | null;
      categoryId?: string | null;
      /** Conta de destino — só com ela a linha vira transferência. */
      transferAccountId?: string | null;
      /** Cria também as unmatched com o mesmo fingerprint. */
      applySame?: boolean;
      /** Grava regra para próximos extratos. */
      remember?: boolean;
      /** Linhas do lote (necessário para applySame). */
      allLines?: ImportLine[];
    }) => {
      if (!householdId) throw new Error('Household não encontrado');

      writeStoredImportPerson(personId ?? null);

      const result = await createFromImportLine({
        householdId,
        line,
        batchId,
        accountId,
        personId: personId ?? null,
        createdBy: user?.id ?? null,
        categoryId,
        transferAccountId,
      });

      const undoCreated: UndoCreated[] = result.created
        ? [{ lineId: result.line.id, transactionId: result.tx.id }]
        : [];

      let sameCreated = 0;
      const fp = fingerprint(line.descriptionRaw);

      if (
        applySame &&
        categoryId &&
        !transferAccountId &&
        allLines &&
        allLines.length > 0
      ) {
        const siblings = pendingLinesSameFingerprint(
          allLines,
          line.descriptionRaw,
          line.id,
        );
        if (siblings.length > 0) {
          const categoryByLineId = new Map<string, string | null>(
            siblings.map((s) => [s.id, categoryId]),
          );
          const batch = await createFromImportLines({
            householdId,
            lines: siblings,
            batchId,
            accountId,
            personId: personId ?? null,
            createdBy: user?.id ?? null,
            categoryByLineId,
          });
          sameCreated = batch.created.length;
          for (const item of batch.created) {
            undoCreated.push({
              lineId: item.line.id,
              transactionId: item.tx.id,
            });
          }
        }
      }

      if (remember && categoryId && fp && !transferAccountId) {
        await upsertCategorizationRule({
          householdId,
          fingerprint: fp,
          matchExample: line.descriptionRaw,
          categoryId,
          personId: personId ?? null,
        });
        const hitCount = 1 + sameCreated;
        await bumpCategorizationRuleHits(
          householdId,
          Array.from({ length: hitCount }, () => fp),
        );
      }

      return {
        ...result,
        batchId,
        sameCreated,
        undoCreated,
      };
    },
    onSuccess: ({ batchId, created, tx, sameCreated, undoCreated }) => {
      invalidateImport(queryClient, batchId);
      const total = (created ? 1 : 0) + sameCreated;
      const createdLabel =
        tx.kind === 'transfer'
          ? 'Transferência criada'
          : total > 1
            ? `${total} lançamentos criados`
            : 'Lançamento criado';
      toast.success(
        created || sameCreated > 0
          ? createdLabel
          : 'Já existia — vinculado',
        {
          action:
            undoCreated.length > 0
              ? {
                  label: 'Desfazer',
                  onClick: () => {
                    void (async () => {
                      await undoCreatedAndMatched(undoCreated, []);
                      invalidateImport(queryClient, batchId);
                      toast.message('Lançamento desfeito');
                    })();
                  },
                }
              : undefined,
        },
      );
    },
    onError: (err: Error) => {
      const msg =
        err.message?.includes('duplicate') || err.message?.includes('unique')
          ? 'Já existe lançamento com este id externo'
          : 'Não deu para criar o lançamento';
      toast.error(msg);
    },
  });
}

/** Cria lançamentos para todas as linhas `unmatched` do lote. */
export function useCreatePendingImportLines() {
  const queryClient = useQueryClient();
  const { householdId } = useHousehold();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({
      lines,
      batchId,
      accountId,
      personId,
    }: {
      lines: ImportLine[];
      batchId: string;
      accountId: string;
      personId: string | null;
    }) => {
      if (!householdId) throw new Error('Household não encontrado');

      writeStoredImportPerson(personId);

      const pending = lines.filter((l) => l.status === 'unmatched');
      const { map: categoryByLineId, usedFingerprints } =
        await categoryMapFromSavedRules(householdId, pending);

      const { created, linked } = await createFromImportLines({
        householdId,
        lines: pending,
        batchId,
        accountId,
        personId,
        createdBy: user?.id ?? null,
        categoryByLineId,
      });

      if (usedFingerprints.length > 0) {
        await bumpCategorizationRuleHits(householdId, usedFingerprints);
      }

      return {
        batchId,
        created: created.length,
        linked: linked.length,
        undoCreated: created.map((item) => ({
          lineId: item.line.id,
          transactionId: item.tx.id,
        })),
      };
    },
    onSuccess: (result) => {
      invalidateImport(queryClient, result.batchId);
      if (result.created === 0 && result.linked === 0) {
        toast.message('Nenhuma pendente para criar');
        return;
      }
      const parts: string[] = [];
      if (result.created > 0) {
        parts.push(
          `${result.created} ${result.created === 1 ? 'criada' : 'criadas'}`,
        );
      }
      if (result.linked > 0) {
        parts.push(
          `${result.linked} ${result.linked === 1 ? 'vinculada' : 'vinculadas'}`,
        );
      }
      toast.success(parts.join(' · '), {
        action:
          result.undoCreated.length > 0
            ? {
                label: 'Desfazer',
                onClick: () => {
                  void (async () => {
                    await undoCreatedAndMatched(result.undoCreated, []);
                    invalidateImport(queryClient, result.batchId);
                    toast.message('Criação em lote desfeita');
                  })();
                },
              }
            : undefined,
      });
    },
    onError: () => toast.error('Não deu para criar as pendentes'),
  });
}

/**
 * Converte lançamentos já criados deste lote em `transfer` para uma conta
 * de destino escolhida pelo usuário.
 *
 * Não existe conversão "automática": sem destino conhecido o dinheiro deixou
 * a casa e continua sendo gasto (ver `core/transactions/transfer`).
 */
export function useConvertImportLinesToTransfer() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      lines,
      batchId,
      transferAccountId,
    }: {
      lines: ImportLine[];
      batchId: string;
      /** Conta de destino — obrigatória. */
      transferAccountId: string;
    }) => {
      if (!transferAccountId) {
        throw new Error('Escolha a conta de destino da transferência');
      }

      const candidates = lines.filter(
        (l) => l.status === 'created' && l.createdTransactionId,
      );

      const ids = candidates.map((l) => l.createdTransactionId!);
      await updateTransactionsByIds(ids, {
        kind: 'transfer',
        categoryId: null,
        transferAccountId,
      });

      return { batchId, count: candidates.length };
    },
    onSuccess: ({ batchId, count }) => {
      invalidateImport(queryClient, batchId);
      if (count === 0) {
        toast.message('Nada para converter');
        return;
      }
      toast.success(
        count === 1
          ? '1 lançamento virou transferência'
          : `${count} lançamentos viraram transferência`,
      );
    },
    onError: (err: Error) =>
      toast.error(err.message || 'Não deu para converter'),
  });
}

export function useIgnorePendingImportLines() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      lines,
      batchId,
    }: {
      lines: ImportLine[];
      batchId: string;
    }) => {
      const pending = lines.filter(
        (l) => l.status === 'unmatched' || l.status === 'suggested',
      );
      await updateImportLinesByIds(
        pending.map((l) => l.id),
        {
          status: 'ignored',
          matchedTransactionId: null,
          createdTransactionId: null,
          matchConfidence: null,
        },
      );
      return { batchId, count: pending.length };
    },
    onSuccess: ({ batchId, count }) => {
      invalidateImport(queryClient, batchId);
      toast.message(
        count === 1 ? '1 linha ignorada' : `${count} linhas ignoradas`,
      );
    },
    onError: () => toast.error('Não deu para ignorar'),
  });
}

export function useConfirmAllSuggested() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      lines,
      batchId,
    }: {
      lines: ImportLine[];
      batchId: string;
    }) => {
      const suggested = lines.filter(
        (l) => l.status === 'suggested' && l.matchedTransactionId,
      );
      await updateImportLinesByIds(
        suggested.map((l) => l.id),
        {
          status: 'matched',
        },
      );
      return { batchId, count: suggested.length };
    },
    onSuccess: ({ batchId, count }) => {
      invalidateImport(queryClient, batchId);
      toast.success(
        count === 1
          ? '1 sugestão confirmada'
          : `${count} sugestões confirmadas`,
      );
    },
    onError: () => toast.error('Não deu para confirmar'),
  });
}

export function useIgnoreImportLine() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      lineId,
      batchId,
    }: {
      lineId: string;
      batchId: string;
    }) => {
      const line = await updateImportLine(lineId, {
        status: 'ignored',
        matchedTransactionId: null,
        createdTransactionId: null,
        matchConfidence: null,
      });
      return { line, batchId };
    },
    onSuccess: ({ batchId }) => {
      invalidateImport(queryClient, batchId);
      toast.message('Linha ignorada');
    },
    onError: () => toast.error('Não deu para ignorar'),
  });
}

export function useUndoImportLine() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      line,
      batchId,
    }: {
      line: ImportLine;
      batchId: string;
    }) => {
      if (line.status === 'created' && line.createdTransactionId) {
        await deleteTransaction(line.createdTransactionId);
      }
      const updated = await updateImportLine(line.id, {
        status: 'unmatched',
        matchedTransactionId: null,
        createdTransactionId: null,
        matchConfidence: null,
      });
      return { line: updated, batchId };
    },
    onSuccess: ({ batchId }) => {
      invalidateImport(queryClient, batchId);
      toast.message('Ação desfeita');
    },
    onError: () => toast.error('Não deu para desfazer'),
  });
}

export function useConfirmSuggestedMatch() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      line,
      batchId,
    }: {
      line: ImportLine;
      batchId: string;
    }) => {
      if (!line.matchedTransactionId) {
        throw new Error('Sem sugestão');
      }
      const updated = await updateImportLine(line.id, {
        status: 'matched',
        matchConfidence: line.matchConfidence ?? 100,
      });
      return { line: updated, batchId };
    },
    onSuccess: ({ batchId }) => {
      invalidateImport(queryClient, batchId);
      toast.success('Sugestão confirmada');
    },
    onError: () => toast.error('Não deu para confirmar'),
  });
}

export function useFinishImportBatch() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (batchId: string) => {
      return updateImportBatchStatus(batchId, 'applied');
    },
    onSuccess: (batch) => {
      invalidateImport(queryClient, batch.id);
      toast.success('Importação concluída');
    },
    onError: () => toast.error('Não deu para concluir'),
  });
}

export function useMatchCandidates(
  accountId: string | undefined,
  postedOn: string | undefined,
) {
  const { householdId } = useHousehold();
  const from = postedOn ? shiftDate(postedOn, -7) : '';
  const to = postedOn ? shiftDate(postedOn, 7) : '';

  return useQuery({
    queryKey: ['import-candidates', accountId, from, to],
    enabled: Boolean(householdId && accountId && postedOn),
    queryFn: () =>
      listTransactionsForMatch(householdId!, accountId!, from, to),
  });
}
