import {
  createTransaction,
  createTransactionsBatch,
  findTransactionByExternalId,
  findTransactionsByExternalIds,
} from '@/data/transactions';
import { updateImportLine, upsertImportLines } from '@/data/imports';
import { resolveImportedKind } from '@/core/transactions/transfer';
import type {
  CreateTransactionInput,
  ImportLine,
  Transaction,
} from '@/types/models';

export type CreateFromImportLineResult = {
  line: ImportLine;
  created: boolean;
  tx: Transaction;
};

function externalIdFor(
  line: ImportLine,
  batchId: string,
): string {
  return line.externalId ?? `import:${batchId}:${line.id}`;
}

function toCreateInput(input: {
  householdId: string;
  line: ImportLine;
  batchId: string;
  accountId: string;
  personId: string | null;
  createdBy: string | null;
  categoryId?: string | null;
  /** Conta de destino — só com ela a linha vira `transfer`. */
  transferAccountId?: string | null;
}): CreateTransactionInput {
  const transferAccountId = input.transferAccountId ?? null;
  const kind = resolveImportedKind(input.line.kind, transferAccountId);

  return {
    householdId: input.householdId,
    date: input.line.postedOn,
    kind,
    description: input.line.descriptionRaw || 'Importado',
    amountCents: input.line.amountCents,
    accountId: input.accountId,
    personId: input.personId,
    categoryId: kind === 'transfer' ? null : (input.categoryId ?? null),
    transferAccountId,
    source: 'import',
    externalId: externalIdFor(input.line, input.batchId),
    createdBy: input.createdBy,
  };
}

/** Cria (ou vincula se já existir) um lançamento a partir de uma linha de import. */
export async function createFromImportLine(input: {
  householdId: string;
  line: ImportLine;
  batchId: string;
  accountId: string;
  personId: string | null;
  createdBy: string | null;
  categoryId?: string | null;
  /** Conta de destino escolhida pelo usuário — vira `transfer`. */
  transferAccountId?: string | null;
}): Promise<CreateFromImportLineResult> {
  const externalId = externalIdFor(input.line, input.batchId);

  const existing = await findTransactionByExternalId(
    input.accountId,
    externalId,
  );
  if (existing) {
    const updated = await updateImportLine(input.line.id, {
      status: 'matched',
      matchedTransactionId: existing.id,
      createdTransactionId: null,
      matchConfidence: 100,
    });
    return { line: updated, created: false, tx: existing };
  }

  const tx = await createTransaction(toCreateInput(input));

  const updated = await updateImportLine(input.line.id, {
    status: 'created',
    createdTransactionId: tx.id,
    matchedTransactionId: null,
    matchConfidence: null,
  });

  return { line: updated, created: true, tx };
}

export type CreateFromImportLinesResult = {
  created: Array<{ line: ImportLine; tx: Transaction }>;
  linked: Array<{ line: ImportLine; tx: Transaction }>;
};

/**
 * Cria lançamentos em lote: 1 lookup de external_ids + 1 insert + 1 upsert de lines.
 * `categoryByLineId` pré-preenche categoria (regras ou “aplicar iguais”).
 */
export async function createFromImportLines(input: {
  householdId: string;
  lines: ImportLine[];
  batchId: string;
  accountId: string;
  personId: string | null;
  createdBy: string | null;
  /** Categoria por linha; ausente → null. */
  categoryByLineId?: ReadonlyMap<string, string | null>;
}): Promise<CreateFromImportLinesResult> {
  const pending = input.lines.filter((l) => l.status === 'unmatched');
  if (pending.length === 0) {
    return { created: [], linked: [] };
  }

  const externalByLineId = new Map(
    pending.map((line) => [line.id, externalIdFor(line, input.batchId)]),
  );
  const existingByExternal = await findTransactionsByExternalIds(
    input.accountId,
    [...externalByLineId.values()],
  );

  const toCreate: ImportLine[] = [];
  const linked: Array<{ line: ImportLine; tx: Transaction }> = [];
  const lineUpserts: Parameters<typeof upsertImportLines>[0] = [];

  for (const line of pending) {
    const externalId = externalByLineId.get(line.id)!;
    const existing = existingByExternal.get(externalId);
    if (existing) {
      const updatedShape = {
        id: line.id,
        batchId: line.batchId,
        postedOn: line.postedOn,
        amountCents: line.amountCents,
        descriptionRaw: line.descriptionRaw,
        externalId: line.externalId,
        kind: line.kind,
        status: 'matched' as const,
        matchedTransactionId: existing.id,
        createdTransactionId: null,
        matchConfidence: 100,
        createdAt: line.createdAt,
      };
      lineUpserts.push(updatedShape);
      linked.push({
        line: {
          ...line,
          status: 'matched',
          matchedTransactionId: existing.id,
          createdTransactionId: null,
          matchConfidence: 100,
        },
        tx: existing,
      });
    } else {
      toCreate.push(line);
    }
  }

  const created: Array<{ line: ImportLine; tx: Transaction }> = [];

  if (toCreate.length > 0) {
    const inserts = toCreate.map((line) =>
      toCreateInput({
        householdId: input.householdId,
        line,
        batchId: input.batchId,
        accountId: input.accountId,
        personId: input.personId,
        createdBy: input.createdBy,
        categoryId: input.categoryByLineId?.get(line.id) ?? null,
      }),
    );

    const txs = await createTransactionsBatch(inserts);
    const txByExternal = new Map(
      txs
        .filter((t) => t.externalId)
        .map((t) => [t.externalId!, t] as const),
    );

    for (const line of toCreate) {
      const externalId = externalByLineId.get(line.id)!;
      const tx = txByExternal.get(externalId);
      if (!tx) {
        throw new Error(`Falha ao criar lançamento para linha ${line.id}`);
      }
      lineUpserts.push({
        id: line.id,
        batchId: line.batchId,
        postedOn: line.postedOn,
        amountCents: line.amountCents,
        descriptionRaw: line.descriptionRaw,
        externalId: line.externalId,
        kind: line.kind,
        status: 'created',
        matchedTransactionId: null,
        createdTransactionId: tx.id,
        matchConfidence: null,
        createdAt: line.createdAt,
      });
      created.push({
        line: {
          ...line,
          status: 'created',
          matchedTransactionId: null,
          createdTransactionId: tx.id,
          matchConfidence: null,
        },
        tx,
      });
    }
  }

  if (lineUpserts.length > 0) {
    const upserted = await upsertImportLines(lineUpserts);
    const byId = new Map(upserted.map((l) => [l.id, l]));
    for (const item of created) {
      const fresh = byId.get(item.line.id);
      if (fresh) item.line = fresh;
    }
    for (const item of linked) {
      const fresh = byId.get(item.line.id);
      if (fresh) item.line = fresh;
    }
  }

  return { created, linked };
}
