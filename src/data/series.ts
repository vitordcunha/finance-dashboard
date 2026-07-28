/**
 * Escrita sobre ocorrências de série.
 *
 * A UI fala em ocorrência ("o aluguel de setembro"), o banco guarda linha-modelo
 * + exceções. A tradução entre os dois mora aqui, e só aqui — as telas nunca
 * decidem sozinhas se gravam uma exceção ou mexem no modelo.
 *
 * Três formas de uma ocorrência existir:
 *
 * | forma | `rowId` | o que é |
 * |---|---|---|
 * | avulsa | id da linha | lançamento normal, sem série |
 * | exceção | id da linha | um mês da série que fugiu do padrão |
 * | virtual | `null` | projetada pela recorrência, não existe no banco |
 *
 * Editar uma virtual **materializa** uma exceção. É por isso que o banco não
 * enche de linhas especulativas: só vira linha o mês que alguém tocou.
 */

import { endBeforeMonth, type Occurrence } from '@/core/series';
import { monthRange } from '@/core/month';
import {
  createTransaction,
  deleteTransaction,
  updateTransaction,
} from '@/data/transactions';
import type {
  SeriesEditScope,
  Transaction,
  TransactionKind,
  TransactionStatus,
} from '@/types/models';

/** Campos que o sheet de lançamento consegue mudar. */
export type OccurrencePatch = {
  date: string;
  kind: TransactionKind;
  description: string;
  amountCents: number;
  categoryId: string | null;
  personId: string | null;
  accountId: string | null;
  transferAccountId: string | null;
  status: TransactionStatus;
};

export type SaveOccurrenceInput = {
  householdId: string;
  occurrence: Occurrence;
  /** Linha-modelo da série, quando a ocorrência veio de uma. */
  template: Transaction | null;
  patch: OccurrencePatch;
  /** Ignorado fora de série. `forward` reescreve a série daqui em diante. */
  scope?: SeriesEditScope;
};

export async function saveOccurrence(input: SaveOccurrenceInput): Promise<void> {
  const { occurrence, template, patch, householdId } = input;
  const scope = input.scope ?? 'one';

  // Fora de série, ou exceção já materializada: é só um update.
  if (occurrence.rowId && (scope === 'one' || !template)) {
    await updateTransaction(occurrence.rowId, patch);
    return;
  }

  if (scope === 'forward' && template) {
    // Encerra a série antiga no mês anterior e abre uma nova a partir daqui.
    // Vale para ocorrência virtual e para exceção — o efeito é o mesmo.
    const end = endBeforeMonth(occurrence.ym);
    if (end < template.date) {
      // Não sobrou mês nenhum na série antiga: ela vira a nova.
      await updateTransaction(template.id, { ...patch, recurrence: 'monthly' });
    } else {
      await updateTransaction(template.id, { recurrenceEnd: end });
      await createTransaction({
        householdId,
        ...patch,
        recurrence: 'monthly',
        competenceMonth: occurrence.ym,
      });
    }
    // A exceção deste mês perderia sentido: o novo modelo já cobre o mês.
    if (occurrence.rowId) await deleteTransaction(occurrence.rowId);
    return;
  }

  // Ocorrência virtual editada só neste mês: materializa a exceção.
  await createTransaction({
    householdId,
    ...patch,
    seriesId: occurrence.seriesId,
    competenceMonth: occurrence.ym,
  });
}

export type DeleteOccurrenceInput = {
  householdId: string;
  occurrence: Occurrence;
  template: Transaction | null;
  scope?: SeriesEditScope;
};

export async function deleteOccurrence(
  input: DeleteOccurrenceInput,
): Promise<void> {
  const { occurrence, template, householdId } = input;
  const scope = input.scope ?? 'one';

  if (!template) {
    if (occurrence.rowId) await deleteTransaction(occurrence.rowId);
    return;
  }

  if (scope === 'forward') {
    const end = endBeforeMonth(occurrence.ym);
    if (end < template.date) {
      // Apagar do primeiro mês em diante é apagar a série inteira; as exceções
      // caem junto pelo `on delete cascade` do `series_id`.
      await deleteTransaction(template.id);
      return;
    }
    await updateTransaction(template.id, { recurrenceEnd: end });
    if (occurrence.rowId) await deleteTransaction(occurrence.rowId);
    return;
  }

  // Só este mês: apagar a exceção faria a virtual voltar. Precisa de marcador.
  if (occurrence.rowId) {
    await updateTransaction(occurrence.rowId, {
      status: 'skipped',
      amountCents: 0,
    });
    return;
  }

  await createTransaction({
    householdId,
    date: occurrence.date,
    kind: occurrence.kind,
    description: occurrence.description,
    amountCents: 0,
    status: 'skipped',
    seriesId: occurrence.seriesId,
    competenceMonth: occurrence.ym,
  });
}

/**
 * "Isso aconteceu": previsto vira realizado, opcionalmente com valor e data
 * reais — que raramente batem com o previsto.
 */
export type ConfirmOccurrenceInput = {
  householdId: string;
  occurrence: Occurrence;
  amountCents?: number;
  date?: string;
};

export async function confirmOccurrence(
  input: ConfirmOccurrenceInput,
): Promise<void> {
  const { occurrence, householdId } = input;
  const amountCents = input.amountCents ?? occurrence.amountCents;
  const date = input.date ?? occurrence.date;

  if (occurrence.rowId) {
    await updateTransaction(occurrence.rowId, {
      status: 'actual',
      amountCents,
      date,
    });
    return;
  }

  await createTransaction({
    householdId,
    date,
    kind: occurrence.kind,
    description: occurrence.description,
    amountCents,
    categoryId: occurrence.categoryId,
    personId: occurrence.personId,
    accountId: occurrence.accountId,
    transferAccountId: occurrence.transferAccountId,
    status: 'actual',
    seriesId: occurrence.seriesId,
    competenceMonth: occurrence.ym,
  });
}

/** Mês de uma data, no formato que a competência usa. */
export function monthOf(date: string): string {
  return monthRange(date.slice(0, 7)).start.slice(0, 7);
}
