import { getSupabase } from '@/data/supabase/client';
import type {
  Database,
  ImportBatchRow,
  ImportLineRow,
} from '@/data/supabase/types';
import type {
  ImportBatch,
  ImportBatchSource,
  ImportBatchStatus,
  ImportLine,
  ImportLineStatus,
} from '@/types/models';
import type { ParsedImportLine } from '@/core/import';

function mapBatch(row: ImportBatchRow): ImportBatch {
  return {
    id: row.id,
    householdId: row.household_id,
    accountId: row.account_id,
    source: row.source,
    fileName: row.file_name,
    checksum: row.checksum,
    periodStart: row.period_start,
    periodEnd: row.period_end,
    competenceMonth: row.competence_month,
    status: row.status,
    createdAt: row.created_at,
    createdBy: row.created_by,
  };
}

function mapLine(row: ImportLineRow): ImportLine {
  return {
    id: row.id,
    batchId: row.batch_id,
    postedOn: row.posted_on,
    amountCents: row.amount_cents,
    descriptionRaw: row.description_raw,
    externalId: row.external_id,
    kind: row.kind,
    status: row.status,
    matchedTransactionId: row.matched_transaction_id,
    createdTransactionId: row.created_transaction_id,
    matchConfidence: row.match_confidence,
    createdAt: row.created_at,
  };
}

function chunkIds<T>(items: T[], size: number): T[][] {
  if (items.length === 0) return [];
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
}

const BATCH_CHUNK = 100;

export async function findBatchByChecksum(
  accountId: string,
  checksum: string,
): Promise<ImportBatch | null> {
  const { data, error } = await getSupabase()
    .from('import_batches')
    .select('*')
    .eq('account_id', accountId)
    .eq('checksum', checksum)
    .maybeSingle();

  if (error) throw error;
  return data ? mapBatch(data) : null;
}

export async function getImportBatch(id: string): Promise<ImportBatch | null> {
  const { data, error } = await getSupabase()
    .from('import_batches')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (error) throw error;
  return data ? mapBatch(data) : null;
}

export async function listImportLines(batchId: string): Promise<ImportLine[]> {
  const { data, error } = await getSupabase()
    .from('import_lines')
    .select('*')
    .eq('batch_id', batchId)
    .order('posted_on', { ascending: false })
    .order('created_at', { ascending: true });

  if (error) throw error;
  return (data ?? []).map(mapLine);
}

/** Linha parseada + status/match opcional (grava já no insert). */
export type CreateImportBatchLineInput = ParsedImportLine & {
  status?: ImportLineStatus;
  matchedTransactionId?: string | null;
  matchConfidence?: number | null;
};

export type CreateImportBatchInput = {
  householdId: string;
  accountId: string;
  source: ImportBatchSource;
  fileName: string;
  checksum: string | null;
  periodStart: string | null;
  periodEnd: string | null;
  competenceMonth?: string | null;
  createdBy?: string | null;
  lines: CreateImportBatchLineInput[];
};

/**
 * Cria batch + lines. Se checksum já existir na conta, devolve o batch existente
 * (idempotência) sem recriar linhas.
 */
export async function createImportBatch(
  input: CreateImportBatchInput,
): Promise<{ batch: ImportBatch; lines: ImportLine[]; reused: boolean }> {
  if (input.checksum) {
    const existing = await findBatchByChecksum(input.accountId, input.checksum);
    if (existing) {
      const lines = await listImportLines(existing.id);
      return { batch: existing, lines, reused: true };
    }
  }

  const { data: batchRow, error: batchError } = await getSupabase()
    .from('import_batches')
    .insert({
      household_id: input.householdId,
      account_id: input.accountId,
      source: input.source,
      file_name: input.fileName,
      checksum: input.checksum,
      period_start: input.periodStart,
      period_end: input.periodEnd,
      competence_month: input.competenceMonth ?? null,
      status: 'pending',
      created_by: input.createdBy ?? null,
    })
    .select('*')
    .single();

  if (batchError) throw batchError;

  const lineInserts: Database['public']['Tables']['import_lines']['Insert'][] =
    input.lines.map((line) => ({
      batch_id: batchRow.id,
      posted_on: line.postedOn,
      amount_cents: line.amountCents,
      description_raw: line.description,
      external_id: line.externalId,
      kind: line.kind,
      status: line.status ?? 'unmatched',
      matched_transaction_id: line.matchedTransactionId ?? null,
      match_confidence: line.matchConfidence ?? null,
    }));

  if (lineInserts.length > 0) {
    for (const chunk of chunkIds(lineInserts, BATCH_CHUNK)) {
      const { error: linesError } = await getSupabase()
        .from('import_lines')
        .insert(chunk);
      if (linesError) throw linesError;
    }
  }

  const lines = await listImportLines(batchRow.id);
  return { batch: mapBatch(batchRow), lines, reused: false };
}

export type UpdateImportLineInput = {
  status?: ImportLineStatus;
  matchedTransactionId?: string | null;
  createdTransactionId?: string | null;
  matchConfidence?: number | null;
};

export async function updateImportLine(
  id: string,
  patch: UpdateImportLineInput,
): Promise<ImportLine> {
  const update: Database['public']['Tables']['import_lines']['Update'] = {};
  if (patch.status !== undefined) update.status = patch.status;
  if (patch.matchedTransactionId !== undefined) {
    update.matched_transaction_id = patch.matchedTransactionId;
  }
  if (patch.createdTransactionId !== undefined) {
    update.created_transaction_id = patch.createdTransactionId;
  }
  if (patch.matchConfidence !== undefined) {
    update.match_confidence = patch.matchConfidence;
  }

  const { data, error } = await getSupabase()
    .from('import_lines')
    .update(update)
    .eq('id', id)
    .select('*')
    .single();

  if (error) throw error;
  return mapLine(data);
}

/** Mesmo patch para várias lines (ex.: ignorar / confirmar sugestões). */
export async function updateImportLinesByIds(
  ids: string[],
  patch: UpdateImportLineInput,
): Promise<void> {
  if (ids.length === 0) return;

  const update: Database['public']['Tables']['import_lines']['Update'] = {};
  if (patch.status !== undefined) update.status = patch.status;
  if (patch.matchedTransactionId !== undefined) {
    update.matched_transaction_id = patch.matchedTransactionId;
  }
  if (patch.createdTransactionId !== undefined) {
    update.created_transaction_id = patch.createdTransactionId;
  }
  if (patch.matchConfidence !== undefined) {
    update.match_confidence = patch.matchConfidence;
  }

  for (const chunk of chunkIds(ids, BATCH_CHUNK)) {
    const { error } = await getSupabase()
      .from('import_lines')
      .update(update)
      .in('id', chunk);
    if (error) throw error;
  }
}

/**
 * Upsert de lines com patches distintos por id (status + FKs diferentes).
 * Inclui colunas obrigatórias para não zerar campos no upsert.
 */
export async function upsertImportLines(
  lines: Array<{
    id: string;
    batchId: string;
    postedOn: string;
    amountCents: number;
    descriptionRaw: string;
    externalId: string | null;
    kind: ImportLine['kind'];
    status: ImportLineStatus;
    matchedTransactionId: string | null;
    createdTransactionId: string | null;
    matchConfidence: number | null;
    createdAt: string;
  }>,
): Promise<ImportLine[]> {
  if (lines.length === 0) return [];

  const result: ImportLine[] = [];
  for (const chunk of chunkIds(lines, BATCH_CHUNK)) {
    const rows: Database['public']['Tables']['import_lines']['Insert'][] =
      chunk.map((line) => ({
        id: line.id,
        batch_id: line.batchId,
        posted_on: line.postedOn,
        amount_cents: line.amountCents,
        description_raw: line.descriptionRaw,
        external_id: line.externalId,
        kind: line.kind,
        status: line.status,
        matched_transaction_id: line.matchedTransactionId,
        created_transaction_id: line.createdTransactionId,
        match_confidence: line.matchConfidence,
        created_at: line.createdAt,
      }));

    const { data, error } = await getSupabase()
      .from('import_lines')
      .upsert(rows, { onConflict: 'id' })
      .select('*');
    if (error) throw error;
    result.push(...(data ?? []).map(mapLine));
  }
  return result;
}

export async function updateImportBatchStatus(
  id: string,
  status: ImportBatchStatus,
): Promise<ImportBatch> {
  const { data, error } = await getSupabase()
    .from('import_batches')
    .update({ status })
    .eq('id', id)
    .select('*')
    .single();

  if (error) throw error;
  return mapBatch(data);
}
