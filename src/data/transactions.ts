import { getSupabase } from "@/data/supabase/client";
import { resolveCompetenceMonth } from "@/core/cards/competence";
import {
  assertTransferShape,
  mergedTransferShape,
} from "@/core/transactions/transfer";
import { yearMonthFromDate } from "@/core/month";
import { getAccount } from "@/data/accounts";
import type { Account, Database, Tables } from "@/data/supabase/types";
import type {
  CreateTransactionInput,
  Transaction,
  UpdateTransactionInput,
} from "@/types/models";

type TransactionRow = Tables<"transactions">;

function mapRow(row: TransactionRow): Transaction {
  return {
    id: row.id,
    householdId: row.household_id,
    date: row.date,
    competenceMonth: row.competence_month,
    kind: row.kind,
    description: row.description,
    amountCents: row.amount_cents,
    categoryId: row.category_id,
    personId: row.person_id,
    accountId: row.account_id,
    transferAccountId: row.transfer_account_id,
    status: row.status,
    recurrence: row.recurrence,
    recurrenceEnd: row.recurrence_end,
    seriesId: row.series_id,
    notes: row.notes,
    tags: row.tags ?? [],
    source: row.source,
    externalId: row.external_id,
    createdAt: row.created_at,
  };
}

function competenceFromAccount(
  date: string,
  account: Account | null | undefined,
): string {
  if (!account) return yearMonthFromDate(date);
  return resolveCompetenceMonth({
    date,
    accountKind: account.kind,
    closingDay: account.closing_day,
  });
}

async function competenceForAccount(
  date: string,
  accountId: string | null | undefined,
  explicit?: string | null,
): Promise<string> {
  if (explicit) return explicit;
  if (!accountId) return yearMonthFromDate(date);
  const account = await getAccount(accountId);
  return competenceFromAccount(date, account);
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

export async function listRecentTransactions(
  householdId: string,
  limit = 20,
): Promise<Transaction[]> {
  const { data, error } = await getSupabase()
    .from("transactions")
    .select("*")
    .eq("household_id", householdId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) throw error;
  return (data ?? []).map(mapRow);
}

export async function listTransactionsByMonth(
  householdId: string,
  ym: string,
): Promise<Transaction[]> {
  const { data, error } = await getSupabase()
    .from("transactions")
    .select("*")
    .eq("household_id", householdId)
    .eq("competence_month", ym)
    .order("date", { ascending: false })
    .order("created_at", { ascending: false });

  if (error) throw error;
  return (data ?? []).map(mapRow);
}

/**
 * Lançamentos por **data** (não competência), inclusive nas bordas.
 * Base do saldo ancorado — a âncora vive num dia, não num mês.
 */
export async function listTransactionsBetween(
  householdId: string,
  fromDate: string,
  toDate: string,
): Promise<Transaction[]> {
  const { data, error } = await getSupabase()
    .from("transactions")
    .select("*")
    .eq("household_id", householdId)
    .gte("date", fromDate)
    .lte("date", toDate)
    .order("date", { ascending: true });

  if (error) throw error;
  return (data ?? []).map(mapRow);
}

/**
 * Tudo que a linha do tempo precisa para o intervalo pedido.
 *
 * Além das linhas do intervalo, traz **todas as linhas-modelo** de recorrência:
 * um aluguel cadastrado em agosto precisa vir junto quando se olha janeiro,
 * senão as ocorrências virtuais daquele mês simplesmente não existiriam.
 */
export async function listTimelineRows(
  householdId: string,
  fromDate: string,
  toDate: string,
): Promise<Transaction[]> {
  const { data, error } = await getSupabase()
    .from("transactions")
    .select("*")
    .eq("household_id", householdId)
    .or(`and(date.gte.${fromDate},date.lte.${toDate}),recurrence.neq.none`)
    .order("date", { ascending: true });

  if (error) throw error;
  return (data ?? []).map(mapRow);
}

/** Compras (expenses) do cartão na competence da fatura. */
export async function listCardPurchases(
  householdId: string,
  accountId: string,
  competenceMonth: string,
): Promise<Transaction[]> {
  const { data, error } = await getSupabase()
    .from("transactions")
    .select("*")
    .eq("household_id", householdId)
    .eq("account_id", accountId)
    .eq("competence_month", competenceMonth)
    .eq("kind", "expense")
    .order("date", { ascending: false })
    .order("created_at", { ascending: false });

  if (error) throw error;
  return (data ?? []).map(mapRow);
}

/**
 * Transfers cujo destino é o cartão (pagamento de fatura candidato),
 * ou cujo account_id é checking saindo para o cartão.
 */
export async function listTransferCandidatesForCard(
  householdId: string,
  creditAccountId: string,
  limit = 30,
): Promise<Transaction[]> {
  const { data, error } = await getSupabase()
    .from("transactions")
    .select("*")
    .eq("household_id", householdId)
    .eq("kind", "transfer")
    .or(
      `transfer_account_id.eq.${creditAccountId},account_id.eq.${creditAccountId}`,
    )
    .order("date", { ascending: false })
    .limit(limit);

  if (error) throw error;
  return (data ?? []).map(mapRow);
}

export async function createTransaction(
  input: CreateTransactionInput,
): Promise<Transaction> {
  assertTransferShape({
    kind: input.kind,
    accountId: input.accountId,
    transferAccountId: input.transferAccountId,
  });

  const competenceMonth = await competenceForAccount(
    input.date,
    input.accountId,
    input.competenceMonth,
  );

  const { data, error } = await getSupabase()
    .from("transactions")
    .insert({
      household_id: input.householdId,
      date: input.date,
      competence_month: competenceMonth,
      kind: input.kind,
      description: input.description.trim(),
      amount_cents: input.amountCents,
      category_id: input.categoryId ?? null,
      person_id: input.personId ?? null,
      account_id: input.accountId ?? null,
      transfer_account_id: input.transferAccountId ?? null,
      status: input.status ?? "actual",
      recurrence: input.recurrence ?? "none",
      recurrence_end: input.recurrenceEnd ?? null,
      series_id: input.seriesId ?? null,
      notes: input.notes ?? null,
      created_by: input.createdBy ?? null,
      source: input.source ?? "manual",
      external_id: input.externalId ?? null,
    })
    .select("*")
    .single();

  if (error) throw error;
  return mapRow(data);
}

/**
 * Insere várias transactions numa ou poucas requests.
 * Busca a conta **uma vez** para resolver competência (quando não vier explícita).
 */
export async function createTransactionsBatch(
  inputs: CreateTransactionInput[],
): Promise<Transaction[]> {
  if (inputs.length === 0) return [];

  for (const input of inputs) {
    assertTransferShape({
      kind: input.kind,
      accountId: input.accountId,
      transferAccountId: input.transferAccountId,
    });
  }

  const accountIds = new Set(
    inputs
      .filter((i) => !i.competenceMonth && i.accountId)
      .map((i) => i.accountId!),
  );
  const accountById = new Map<string, Account | null>();
  await Promise.all(
    [...accountIds].map(async (id) => {
      accountById.set(id, await getAccount(id));
    }),
  );

  const rows: Database["public"]["Tables"]["transactions"]["Insert"][] =
    inputs.map((input) => {
      const competenceMonth =
        input.competenceMonth ??
        competenceFromAccount(
          input.date,
          input.accountId ? accountById.get(input.accountId) : null,
        );

      return {
        household_id: input.householdId,
        date: input.date,
        competence_month: competenceMonth,
        kind: input.kind,
        description: input.description.trim(),
        amount_cents: input.amountCents,
        category_id: input.categoryId ?? null,
        person_id: input.personId ?? null,
        account_id: input.accountId ?? null,
        transfer_account_id: input.transferAccountId ?? null,
        notes: input.notes ?? null,
        created_by: input.createdBy ?? null,
        source: input.source ?? "manual",
        external_id: input.externalId ?? null,
      };
    });

  const created: Transaction[] = [];
  for (const chunk of chunkIds(rows, BATCH_CHUNK)) {
    const { data, error } = await getSupabase()
      .from("transactions")
      .insert(chunk)
      .select("*");
    if (error) throw error;
    created.push(...(data ?? []).map(mapRow));
  }
  return created;
}

/** Candidatos a match: mesma conta, janela de datas, amount opcional. */
export async function listTransactionsForMatch(
  householdId: string,
  accountId: string,
  dateFrom: string,
  dateTo: string,
): Promise<Transaction[]> {
  const { data, error } = await getSupabase()
    .from("transactions")
    .select("*")
    .eq("household_id", householdId)
    .eq("account_id", accountId)
    .gte("date", dateFrom)
    .lte("date", dateTo)
    .order("date", { ascending: false });

  if (error) throw error;
  return (data ?? []).map(mapRow);
}

export async function findTransactionByExternalId(
  accountId: string,
  externalId: string,
): Promise<Transaction | null> {
  const { data, error } = await getSupabase()
    .from("transactions")
    .select("*")
    .eq("account_id", accountId)
    .eq("external_id", externalId)
    .maybeSingle();

  if (error) throw error;
  return data ? mapRow(data) : null;
}

/** Lookup em lote por external_id (mesma conta). */
export async function findTransactionsByExternalIds(
  accountId: string,
  externalIds: string[],
): Promise<Map<string, Transaction>> {
  const map = new Map<string, Transaction>();
  const unique = [...new Set(externalIds.filter(Boolean))];
  if (unique.length === 0) return map;

  for (const chunk of chunkIds(unique, BATCH_CHUNK)) {
    const { data, error } = await getSupabase()
      .from("transactions")
      .select("*")
      .eq("account_id", accountId)
      .in("external_id", chunk);
    if (error) throw error;
    for (const row of data ?? []) {
      if (row.external_id) map.set(row.external_id, mapRow(row));
    }
  }
  return map;
}

export async function updateTransaction(
  id: string,
  patch: UpdateTransactionInput,
): Promise<Transaction> {
  const update: Database["public"]["Tables"]["transactions"]["Update"] = {};

  if (patch.kind !== undefined) update.kind = patch.kind;
  if (patch.description !== undefined) {
    update.description = patch.description.trim();
  }
  if (patch.amountCents !== undefined) update.amount_cents = patch.amountCents;
  if (patch.categoryId !== undefined) update.category_id = patch.categoryId;
  if (patch.personId !== undefined) update.person_id = patch.personId;
  if (patch.notes !== undefined) update.notes = patch.notes;
  if (patch.transferAccountId !== undefined) {
    update.transfer_account_id = patch.transferAccountId;
  }
  if (patch.status !== undefined) update.status = patch.status;
  if (patch.recurrence !== undefined) update.recurrence = patch.recurrence;
  if (patch.recurrenceEnd !== undefined) {
    update.recurrence_end = patch.recurrenceEnd;
  }

  const needsCompetence =
    patch.date !== undefined || patch.accountId !== undefined;

  if (patch.date !== undefined) update.date = patch.date;
  if (patch.accountId !== undefined) update.account_id = patch.accountId;

  if (needsCompetence || patch.kind === "transfer") {
    // Busca row atual para completar kind/date/account/destino quando o patch é parcial
    const { data: current, error: readError } = await getSupabase()
      .from("transactions")
      .select("kind, date, account_id, transfer_account_id")
      .eq("id", id)
      .single();
    if (readError) throw readError;

    const accountId =
      patch.accountId !== undefined ? patch.accountId : current.account_id;

    if (needsCompetence) {
      const date = patch.date ?? current.date;
      update.competence_month = await competenceForAccount(date, accountId);
    }

    assertTransferShape(
      mergedTransferShape(patch, {
        kind: current.kind,
        accountId: current.account_id,
        transferAccountId: current.transfer_account_id,
      }),
    );
  }

  const { data, error } = await getSupabase()
    .from("transactions")
    .update(update)
    .eq("id", id)
    .select("*")
    .single();

  if (error) throw error;
  return mapRow(data);
}

/** Atualiza o mesmo patch em várias transactions (ex.: kind → transfer). */
export async function updateTransactionsByIds(
  ids: string[],
  patch: UpdateTransactionInput,
): Promise<void> {
  if (ids.length === 0) return;

  if (patch.kind === "transfer" && !patch.transferAccountId) {
    // O helper não lê linha a linha — o destino tem de vir explícito no patch.
    throw new Error(
      "Converter em lote para transferência exige conta de destino no patch.",
    );
  }

  const update: Database["public"]["Tables"]["transactions"]["Update"] = {};
  if (patch.kind !== undefined) update.kind = patch.kind;
  if (patch.categoryId !== undefined) update.category_id = patch.categoryId;
  if (patch.transferAccountId !== undefined) {
    update.transfer_account_id = patch.transferAccountId;
  }
  if (patch.personId !== undefined) update.person_id = patch.personId;
  if (patch.notes !== undefined) update.notes = patch.notes;
  if (patch.description !== undefined) {
    update.description = patch.description.trim();
  }
  if (patch.amountCents !== undefined) update.amount_cents = patch.amountCents;

  if (patch.date !== undefined || patch.accountId !== undefined) {
    // Competência por linha varia — não usar neste helper genérico.
    throw new Error(
      "updateTransactionsByIds não suporta date/accountId (competência por linha)",
    );
  }

  for (const chunk of chunkIds(ids, BATCH_CHUNK)) {
    const { error } = await getSupabase()
      .from("transactions")
      .update(update)
      .in("id", chunk);
    if (error) throw error;
  }
}

export async function deleteTransaction(id: string): Promise<void> {
  const { error } = await getSupabase()
    .from("transactions")
    .delete()
    .eq("id", id);
  if (error) throw error;
}

export async function deleteTransactions(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  for (const chunk of chunkIds(ids, BATCH_CHUNK)) {
    const { error } = await getSupabase()
      .from("transactions")
      .delete()
      .in("id", chunk);
    if (error) throw error;
  }
}
