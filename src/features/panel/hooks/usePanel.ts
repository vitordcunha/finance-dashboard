import { useMemo } from 'react';
import { cashBalanceAt } from '@/core/cashflow';
import { forecastVariable, type VariableForecast } from '@/core/forecast';
import { addMonths, currentYearMonth, monthRange } from '@/core/month';
import { expandSeries, type Occurrence } from '@/core/series';
import {
  buildTimelineEvents,
  groupTimeline,
  plannedCategoriesIn,
  timelineMonths,
  type TimelineMonth,
} from '@/core/timeline';
import { useLatestBalances } from '@/features/balances/hooks/useBalances';
import {
  useAccounts,
  useCategories,
  usePeopleQuery,
} from '@/features/capture/hooks/useCaptureLookups';
import { useTimelineRows } from '@/features/transactions/hooks/useTransactions';
import type { Transaction } from '@/types/models';

/** Meses de histórico usados para estimar o variável. */
const HISTORY_MONTHS = 6;

export type UsePanelOptions = {
  past?: number;
  future?: number;
  /**
   * De quem é o caixa. `null` = todo mundo.
   *
   * Com contas separadas, somar as duas pessoas num saldo só produz um número
   * que não existe em conta nenhuma. O recorte é por **dono da conta**, não por
   * `person_id` do lançamento: dinheiro vive em conta.
   */
  personId?: string | null;
  /**
   * Substitui o variável estimado na projeção, em centavos por **dia**.
   *
   * É o simulador "e se eu segurar o ritmo". Entra **aqui**, no motor, e não numa
   * cópia da curva no componente: uma segunda projeção paralela discordaria do
   * herói, do menor saldo e do burn-up na mesma tela.
   */
  forecastOverrideDailyCents?: number | null;
};

export type PersonOption = { id: string; name: string };

export type PanelResult = {
  /** Pessoas que têm conta própria — quem pode ser recorte. */
  people: PersonOption[];
  /** Meses em ordem cronológica, passado → futuro. */
  months: TimelineMonth[];
  currentYm: string;
  today: string;
  /** Saldo real de hoje — só realizado. Null sem âncora. */
  todayBalanceCents: number | null;
  hasAnchor: boolean;
  /**
   * Contas de caixa no recorte que ninguém ancorou.
   *
   * Os lançamentos delas entram no fluxo mas não no ponto de partida, então o
   * saldo fica deslocado por um valor desconhecido. Silenciar isso faria a
   * visão da casa somar o caixa de um com o fluxo do outro.
   */
  unanchoredAccounts: { id: string; name: string }[];
  /** Data mais recente entre saldos informados (`yyyy-MM-dd`). */
  anchorAsOfDate: string | null;
  forecast: VariableForecast | null;
  categoryNameById: Map<string, string>;
  /** Categorias marcadas como essenciais — saída nelas é compromisso, não hábito. */
  essentialCategoryIds: Set<string>;
  /** Dono de cada conta. A divisão da casa precisa saber de quem é o dinheiro. */
  accountOwnerById: Map<string, string | null>;
  personNameById: Map<string, string>;
  /** Categorias de despesa, para o seletor de categorização em lote. */
  expenseCategories: {
    id: string;
    name: string;
    essential: boolean;
    color: string | null;
  }[];
  /** Ocorrência por id de evento — a edição precisa dela, não do evento. */
  occurrenceById: Map<string, Occurrence>;
  /** Linha-modelo por id de série. */
  templateById: Map<string, Transaction>;
  isLoading: boolean;
  isError: boolean;
  refetch: () => void;
};

function todayIso(): string {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

/**
 * Fonte única de números da aplicação.
 *
 * Uma tela só, um cálculo só. Quando havia Painel, Mês, Futuro e Plano cada um
 * com seu cálculo, as telas discordavam entre si — foi assim que o app passou a
 * errar julho em R$ 9.090.
 */
export function usePanel(options: UsePanelOptions = {}): PanelResult {
  const past = options.past ?? 6;
  const future = options.future ?? 12;
  const personId = options.personId ?? null;
  const forecastOverride = options.forecastOverrideDailyCents ?? null;

  const today = todayIso();
  const currentYm = currentYearMonth();

  const accountsQuery = useAccounts();
  const peopleQuery = usePeopleQuery();
  const categoriesQuery = useCategories();
  const balancesQuery = useLatestBalances();

  const months = useMemo(
    () => timelineMonths(currentYm, past, future),
    [currentYm, past, future],
  );

  // Inclui o mês corrente: `forecastVariable` sabe que ele é parcial e o mede
  // por dias vividos. Excluí-lo por princípio era o que fazia o app calcular
  // R$ 131/dia de ritmo com 28 dias de julho na mão e ao mesmo tempo anunciar
  // "sem gasto variável estimado".
  const historyMonths = useMemo(
    () =>
      Array.from({ length: HISTORY_MONTHS + 1 }, (_, i) =>
        addMonths(currentYm, i - HISTORY_MONTHS),
      ),
    [currentYm],
  );

  // Janela larga: cobre a âncora, o histórico e todo o passado exibido.
  const anchorDates = (balancesQuery.data ?? []).map((b) => b.asOfDate);
  const windowFrom = [
    ...anchorDates,
    monthRange(months[0]!).start,
    monthRange(historyMonths[0]!).start,
  ].sort()[0]!;
  const windowTo = monthRange(months.at(-1)!).end;
  const rowsQuery = useTimelineRows(windowFrom, windowTo);

  const isLoading =
    accountsQuery.isLoading ||
    categoriesQuery.isLoading ||
    balancesQuery.isLoading ||
    rowsQuery.isLoading;
  const isError =
    accountsQuery.isError ||
    categoriesQuery.isError ||
    balancesQuery.isError ||
    rowsQuery.isError;

  const categoryNameById = useMemo(
    () => new Map((categoriesQuery.data ?? []).map((c) => [c.id, c.name])),
    [categoriesQuery.data],
  );

  /**
   * Categorias essenciais. Precisa vir antes do forecast: é a régua que decide
   * o que é hábito, e o ritmo e a projeção têm de usar a mesma.
   */
  const essentialCategoryIds = useMemo(
    () =>
      new Set(
        (categoriesQuery.data ?? [])
          .filter((c) => c.essential)
          .map((c) => c.id),
      ),
    [categoriesQuery.data],
  );

  /** Contas do recorte. Sem dono definido a conta é da casa e entra em todos. */
  const scopedAccounts = useMemo(
    () =>
      (accountsQuery.data ?? []).filter(
        (a) =>
          !a.archived &&
          (personId == null || a.person_id === personId || a.person_id == null),
      ),
    [accountsQuery.data, personId],
  );

  const scopedAccountIds = useMemo(
    () => new Set(scopedAccounts.map((a) => a.id)),
    [scopedAccounts],
  );

  const cashAccountIds = useMemo(
    () => new Set(scopedAccounts.filter((a) => a.kind !== 'credit').map((a) => a.id)),
    [scopedAccounts],
  );

  const unanchoredAccounts = useMemo(() => {
    const anchored = new Set(
      (balancesQuery.data ?? []).map((b) => b.accountId),
    );
    return scopedAccounts
      .filter((a) => a.kind !== 'credit' && !anchored.has(a.id))
      .map((a) => ({ id: a.id, name: a.name }));
  }, [balancesQuery.data, scopedAccounts]);

  const anchors = useMemo(
    () =>
      (balancesQuery.data ?? [])
        .filter((b) => cashAccountIds.has(b.accountId))
        .map((b) => ({
          accountId: b.accountId,
          balanceCents: b.balanceCents,
          asOfDate: b.asOfDate,
        })),
    [balancesQuery.data, cashAccountIds],
  );

  const anchorAsOfDate = useMemo(() => {
    let best: string | null = null;
    for (const a of anchors) {
      if (best == null || a.asOfDate > best) best = a.asOfDate;
    }
    return best;
  }, [anchors]);

  /** Linhas do recorte: conta de origem pertence a quem está sendo olhado. */
  const scopedRows = useMemo(
    () =>
      (rowsQuery.data ?? []).filter(
        (t) => t.accountId == null || scopedAccountIds.has(t.accountId),
      ),
    [rowsQuery.data, scopedAccountIds],
  );

  /** Só o realizado move saldo de verdade. Previsto é expectativa. */
  const actualTxs = useMemo(
    () =>
      scopedRows
        .filter((t) => t.status === 'actual' && t.recurrence === 'none')
        .map((t) => ({
          date: t.date,
          kind: t.kind,
          amountCents: t.amountCents,
          accountId: t.accountId,
          transferAccountId: t.transferAccountId,
        })),
    [scopedRows],
  );

  const occurrences = useMemo(() => {
    if (!rowsQuery.data) return [];
    return expandSeries({
      rows: scopedRows.map((t) => ({
        id: t.id,
        date: t.date,
        kind: t.kind,
        amountCents: t.amountCents,
        description: t.description,
        categoryId: t.categoryId,
        accountId: t.accountId,
        transferAccountId: t.transferAccountId,
        personId: t.personId,
        status: t.status,
        recurrence: t.recurrence,
        recurrenceEnd: t.recurrenceEnd,
        seriesId: t.seriesId,
      })),
      fromYm: months[0]!,
      toYm: months.at(-1)!,
    });
  }, [rowsQuery.data, scopedRows, months]);

  /** Saldo no dia anterior ao primeiro mês exibido — onde a linha começa. */
  const openingCents = useMemo(() => {
    if (anchors.length === 0 || !rowsQuery.data) return null;
    return cashBalanceAt({
      anchors,
      transactions: actualTxs,
      date: monthRange(addMonths(months[0]!, -1)).end,
      cashAccountIds,
    }).cents;
  }, [anchors, rowsQuery.data, actualTxs, months, cashAccountIds]);

  const todayBalanceCents = useMemo(() => {
    if (anchors.length === 0 || !rowsQuery.data) return null;
    return cashBalanceAt({
      anchors,
      transactions: actualTxs,
      date: today,
      cashAccountIds,
    }).cents;
  }, [anchors, rowsQuery.data, actualTxs, today, cashAccountIds]);

  const forecast = useMemo(() => {
    if (!rowsQuery.data) return null;
    return forecastVariable({
      transactions: scopedRows
        .filter((t) => t.status === 'actual')
        .map((t) => ({
          date: t.date,
          kind: t.kind,
          amountCents: t.amountCents,
          categoryId: t.categoryId,
          seriesId: t.seriesId,
        })),
      months: historyMonths,
      today,
      // Categoria já coberta por um previsto não entra na média: seria dobrar.
      plannedCategoryIds: plannedCategoriesIn(occurrences),
      essentialCategoryIds,
    });
  }, [
    rowsQuery.data,
    scopedRows,
    historyMonths,
    occurrences,
    today,
    essentialCategoryIds,
  ]);

  const grouped = useMemo((): TimelineMonth[] => {
    if (!rowsQuery.data || openingCents == null) return [];

    const events = buildTimelineEvents({
      occurrences,
      months,
      today,
      cashAccountIds,
      forecastMonthlyCents: forecast?.totalMonthlyCents ?? 0,
      forecastDailyCents: forecastOverride,
    });

    const all = groupTimeline({ events, anchorCents: openingCents, months });

    // Meses vazios antes do primeiro movimento só achatam a fita e enchem a
    // navegação. O futuro fica, mesmo vazio: ali a ausência é informação.
    const firstWithData = all.findIndex((m) => m.days.length > 0);
    if (firstWithData <= 0) return all;
    const currentIndex = all.findIndex((m) => m.ym === currentYm);
    return all.slice(Math.min(firstWithData, Math.max(0, currentIndex)));
  }, [
    rowsQuery.data,
    occurrences,
    openingCents,
    months,
    today,
    cashAccountIds,
    forecast,
    forecastOverride,
    currentYm,
  ]);

  /** Quem tem conta própria — só esses podem ser recorte. */
  const people = useMemo((): PersonOption[] => {
    const owners = new Set(
      (accountsQuery.data ?? [])
        .filter((a) => !a.archived && a.person_id)
        .map((a) => a.person_id!),
    );
    return (peopleQuery.data ?? [])
      .filter((p) => owners.has(p.id))
      .map((p) => ({ id: p.id, name: p.short_name || p.name }));
  }, [accountsQuery.data, peopleQuery.data]);

  const expenseCategories = useMemo(
    () =>
      (categoriesQuery.data ?? [])
        .filter((c) => c.kind === 'expense')
        .map((c) => ({
          id: c.id,
          name: c.name,
          essential: c.essential,
          color: c.color,
        })),
    [categoriesQuery.data],
  );

  const accountOwnerById = useMemo(
    () =>
      new Map(
        (accountsQuery.data ?? []).map((a) => [a.id, a.person_id ?? null]),
      ),
    [accountsQuery.data],
  );

  const personNameById = useMemo(
    () =>
      new Map(
        (peopleQuery.data ?? []).map((p) => [p.id, p.short_name || p.name]),
      ),
    [peopleQuery.data],
  );

  const occurrenceById = useMemo(
    () => new Map(occurrences.map((o) => [o.id, o])),
    [occurrences],
  );

  const templateById = useMemo(
    () =>
      new Map(
        (rowsQuery.data ?? [])
          .filter((t) => t.recurrence !== 'none')
          .map((t) => [t.id, t]),
      ),
    [rowsQuery.data],
  );

  function refetch() {
    void accountsQuery.refetch();
    void categoriesQuery.refetch();
    void balancesQuery.refetch();
    void rowsQuery.refetch();
  }

  return {
    people,
    months: grouped,
    currentYm,
    today,
    todayBalanceCents,
    hasAnchor: anchors.length > 0,
    unanchoredAccounts,
    anchorAsOfDate,
    forecast,
    categoryNameById,
    essentialCategoryIds,
    accountOwnerById,
    personNameById,
    expenseCategories,
    occurrenceById,
    templateById,
    isLoading,
    isError,
    refetch,
  };
}
