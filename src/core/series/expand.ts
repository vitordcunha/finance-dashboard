/**
 * Expansão de recorrência: linhas gravadas → ocorrências de cada mês.
 *
 * Um lançamento marcado como mensal é a **linha-modelo**. Os meses seguintes
 * não viram linhas no banco: são ocorrências virtuais calculadas aqui. Assim
 * "mudar o salário de vez" é uma edição só, e o horizonte não acaba.
 *
 * Uma linha com `seriesId` é a **exceção** de um mês: substitui a ocorrência
 * virtual daquele mês. É como "editar só este" e "pular este" funcionam — e é
 * também o que a importação grava quando o previsto vira realizado.
 */

import { dueDateInMonth } from '@/core/timeline/due-date';
import { addMonths, compareYearMonth, monthRange, type YearMonth } from '@/core/month';

export type TxStatus = 'actual' | 'planned' | 'skipped';
export type Recurrence = 'none' | 'monthly';

/** Subconjunto de `Transaction` que a expansão precisa (puro / testável). */
export type SeriesRow = {
  id: string;
  date: string;
  kind: 'income' | 'expense' | 'transfer';
  amountCents: number;
  description: string;
  categoryId: string | null;
  accountId: string | null;
  transferAccountId: string | null;
  personId: string | null;
  status: TxStatus;
  recurrence: Recurrence;
  /** Último dia em que a série ocorre. Sem isso, vai indefinidamente. */
  recurrenceEnd: string | null;
  seriesId: string | null;
};

export type Occurrence = {
  /** `row:<id>` para linha gravada, `virtual:<seriesId>:<ym>` para projetada. */
  id: string;
  date: string;
  ym: string;
  kind: 'income' | 'expense' | 'transfer';
  amountCents: number;
  description: string;
  categoryId: string | null;
  accountId: string | null;
  transferAccountId: string | null;
  personId: string | null;
  /** `skipped` nunca sai daqui: ocorrência cancelada some. */
  status: 'actual' | 'planned';
  /** Id da linha no banco. Null em ocorrência virtual — não há o que editar. */
  rowId: string | null;
  /** Série de origem. Presente na linha-modelo e em todas as ocorrências dela. */
  seriesId: string | null;
  /** Ocorrência projetada, sem linha correspondente no banco. */
  virtual: boolean;
};

function ymOf(date: string): string {
  return date.slice(0, 7);
}

function dayOf(date: string): number {
  return Number(date.slice(8, 10));
}

function fromRow(row: SeriesRow): Occurrence {
  return {
    id: `row:${row.id}`,
    date: row.date,
    ym: ymOf(row.date),
    kind: row.kind,
    amountCents: row.amountCents,
    description: row.description,
    categoryId: row.categoryId,
    accountId: row.accountId,
    transferAccountId: row.transferAccountId,
    personId: row.personId,
    status: row.status === 'planned' ? 'planned' : 'actual',
    rowId: row.id,
    seriesId: row.seriesId ?? (row.recurrence !== 'none' ? row.id : null),
    virtual: false,
  };
}

export type ExpandSeriesInput = {
  rows: ReadonlyArray<SeriesRow>;
  fromYm: YearMonth;
  toYm: YearMonth;
};

/**
 * Ocorrências entre `fromYm` e `toYm`, ordenadas por data.
 *
 * Precedência: uma exceção do mês sempre vence a ocorrência virtual, mesmo
 * quando o valor ou a data mudaram. Uma exceção `skipped` apaga o mês.
 */
export function expandSeries(input: ExpandSeriesInput): Occurrence[] {
  const { rows, fromYm, toYm } = input;

  /** Meses já resolvidos por exceção, por série — a virtual não entra neles. */
  const claimedMonths = new Map<string, Set<string>>();
  for (const row of rows) {
    if (!row.seriesId) continue;
    const months = claimedMonths.get(row.seriesId) ?? new Set<string>();
    months.add(ymOf(row.date));
    claimedMonths.set(row.seriesId, months);
  }

  const out: Occurrence[] = [];

  for (const row of rows) {
    if (row.status === 'skipped') continue;
    // Linha-modelo é definição da série, não ocorrência: todo mês dela — o
    // primeiro inclusive — sai da expansão. Assim editar ou apagar um mês
    // qualquer funciona igual, sem caso especial para o mês de origem.
    if (row.recurrence !== 'none') continue;
    const ym = ymOf(row.date);
    if (compareYearMonth(ym, fromYm) < 0) continue;
    if (compareYearMonth(ym, toYm) > 0) continue;
    out.push(fromRow(row));
  }

  for (const template of rows) {
    if (template.recurrence !== 'monthly') continue;

    const startYm = ymOf(template.date);
    const day = dayOf(template.date);
    const endYm = template.recurrenceEnd ? ymOf(template.recurrenceEnd) : null;
    const claimed = claimedMonths.get(template.id) ?? new Set<string>();

    let ym = compareYearMonth(fromYm, startYm) > 0 ? fromYm : startYm;

    while (compareYearMonth(ym, toYm) <= 0) {
      if (endYm && compareYearMonth(ym, endYm) > 0) break;
      if (claimed.has(ym)) {
        ym = addMonths(ym, 1);
        continue;
      }

      const date = dueDateInMonth(ym, day);
      if (template.recurrenceEnd && date > template.recurrenceEnd) break;

      out.push({
        id: `virtual:${template.id}:${ym}`,
        date,
        ym,
        kind: template.kind,
        amountCents: template.amountCents,
        description: template.description,
        categoryId: template.categoryId,
        accountId: template.accountId,
        transferAccountId: template.transferAccountId,
        personId: template.personId,
        // Mês futuro de uma série é sempre expectativa, nunca fato.
        // Ocorrência de série é sempre expectativa. Vira fato ao ganhar uma
        // exceção `actual` — pela importação ou pelo "marcar como pago".
        status: 'planned',
        rowId: null,
        seriesId: template.id,
        virtual: true,
      });

      ym = addMonths(ym, 1);
    }
  }

  out.sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? -1 : 1;
    return a.id.localeCompare(b.id);
  });

  return out;
}

/**
 * Ocorrência prevista cujo dia já passou e ninguém confirmou.
 * Continua pesando no saldo — é dívida —, mas precisa aparecer como atraso.
 */
export function isOverdue(occurrence: Occurrence, today: string): boolean {
  return occurrence.status === 'planned' && occurrence.date < today;
}

/** Último dia do mês anterior a `ym` — onde uma série encerrada deve parar. */
export function endBeforeMonth(ym: YearMonth): string {
  return monthRange(addMonths(ym, -1)).end;
}
