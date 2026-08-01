import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  CalendarRange,
  ChevronLeft,
  ChevronRight,
  Plus,
  Wallet,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { Skeleton } from '@/components/ui/Skeleton';
import { MoneyText } from '@/components/money/MoneyText';
import { addMonths, formatMonth } from '@/core/month';
import {
  bandLowestAhead,
  burnup,
  lowestAheadAtRate,
  compareToAverage,
  dailySeries,
  householdSplit,
  invoiceRunway,
  monthMetrics,
  projectionBand,
  sparklineOutflows,
  trajectory,
  upcomingEvents,
} from '@/core/month-metrics';
import { monthlyToDailyCents } from '@/core/forecast';
import type { Occurrence } from '@/core/series';
import { CategoryBars } from '@/features/panel/components/CategoryBars';
import { CommitmentsSection } from '@/features/panel/components/CommitmentsSection';
import { HabitsSection } from '@/features/panel/components/HabitsSection';
import { HeroSpendable } from '@/features/panel/components/HeroSpendable';
import { TrajectorySection } from '@/features/panel/components/TrajectorySection';
import { TrajectoryChart } from '@/features/panel/components/TrajectoryChart';
import { HouseholdSplitCard } from '@/features/panel/components/HouseholdSplitCard';
import { UncategorizedSection } from '@/features/panel/components/UncategorizedSection';
import { uncategorizedGroups } from '@/core/transactions/grouping';
import { useMinimumBalance } from '@/features/panel/hooks/useMinimumBalance';
import {
  useContributionCustomBps,
  useContributionMode,
  useSharedCategories,
} from '@/features/settings/hooks/useSettingsMutations';
import { DayRow } from '@/features/panel/components/DayRow';
import { MonthStrip } from '@/features/panel/components/MonthStrip';
import { EntrySheet } from '@/features/panel/components/EntrySheet';
import { usePanel } from '@/features/panel/hooks/usePanel';
import { cn } from '@/lib/cn';

function titleCase(v: string): string {
  return v.charAt(0).toUpperCase() + v.slice(1);
}

function formatAsOf(iso: string): string {
  const [, m, d] = iso.split('-');
  return `${Number(d)}/${Number(m)}`;
}

/**
 * A aplicação inteira — um mês por vez, em **camadas**, cada uma com uma pergunta:
 *
 * 1. *dá para gastar?* — o herói, um número, e o comparativo por dia.
 * 2. *por quê?* — a curva do mês, o simulador de ritmo, o colchão.
 * 3. *o que eu faço?* — categorizar, rateio, contas marcadas. Ação, não KPI.
 * 4. *entender o mês* — renda, categorias, fatura, trajetória. **Colapsada.**
 *
 * A ordem anterior era treze seções seguidas sem hierarquia: a divisão da casa
 * caía no meio, depois de um gráfico de treze meses, e a trajetória de 2027 vinha
 * antes de "17 lançamentos sem categoria". Tudo aberto ao mesmo tempo, ~35 números
 * na vertical, e o mais destacado deles era o menos acionável.
 */
export function PanelPage() {
  const [owner, setOwner] = useState<string | null>(null);
  /**
   * Ritmo simulado, em centavos por dia. Null = usa o estimado do histórico.
   *
   * Vive aqui e desce pelo `usePanel` porque a simulação tem de reescrever a
   * projeção inteira — herói, curva, menor saldo, burn-up. Uma curva paralela no
   * componente do gráfico discordaria dos números ao lado dela.
   */
  const [paceDaily, setPaceDaily] = useState<number | null>(null);

  const {
    people,
    months,
    currentYm,
    today,
    todayBalanceCents,
    hasAnchor,
    unanchoredAccounts,
    anchorAsOfDate,
    forecast,
    applicableForecastByYm,
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
  } = usePanel({ personId: owner, forecastOverrideDailyCents: paceDaily });

  /** Colchão da lente aberta: a casa e cada pessoa têm o seu. */
  const { data: minimumCents = 0 } = useMinimumBalance(owner);

  const { data: sharedCategoryIds } = useSharedCategories();
  const { data: contributionMode = 'income_share' } = useContributionMode();
  const { data: customBps } = useContributionCustomBps();
  const sharedSet = useMemo(
    () => new Set(sharedCategoryIds ?? []),
    [sharedCategoryIds],
  );

  const [selectedYm, setSelectedYm] = useState<string | null>(null);
  const [editing, setEditing] = useState<Occurrence | null>(null);
  const [creating, setCreating] = useState(false);
  const [statementOpen, setStatementOpen] = useState(false);
  const [contextOpen, setContextOpen] = useState(false);

  const ym = selectedYm ?? currentYm;
  const month = useMemo(() => months.find((m) => m.ym === ym), [months, ym]);
  const index = months.findIndex((m) => m.ym === ym);

  const isCurrent = ym === currentYm;
  const isFuture = ym > currentYm;
  const phase = isFuture ? 'future' : isCurrent ? 'current' : 'past';

  const points = useMemo(
    () => (month ? dailySeries({ month, today, minimumCents }) : null),
    [month, today, minimumCents],
  );

  const metrics = useMemo(
    () =>
      month && points
        ? monthMetrics({
            month,
            points,
            today,
            minimumCents,
            essentialCategoryIds,
          })
        : null,
    [month, points, today, minimumCents, essentialCategoryIds],
  );

  const comparison = useMemo(
    () =>
      month
        ? compareToAverage(
            month,
            months.filter((m) => m.ym < currentYm),
          )
        : null,
    [month, months, currentYm],
  );

  const sparkline = useMemo(
    () =>
      sparklineOutflows({
        months,
        beforeYm: currentYm,
        limit: 3,
      }),
    [months, currentYm],
  );

  /**
   * O estimado que vale para **este** mês — a mediana menos o que o mês já tem
   * cadastrado. Não existe "o estimado": o de julho e o de agosto são diferentes.
   */
  const applicable = applicableForecastByYm.get(ym) ?? null;

  /**
   * O estimado tem base fora deste mês.
   *
   * O mês corrente entra na amostra da mediana de propósito — é o que faz o número
   * existir com um mês de histórico. Mas então "ritmo acima do estimado" compara o
   * mês com ele mesmo, e o painel acusava "mês mais caro que o habitual" sobre o
   * mês que definiu o habitual.
   */
  const estimateIndependent = useMemo(
    () => forecast?.monthsUsed.some((m) => m !== ym) ?? false,
    [forecast, ym],
  );

  /** Estimado do histórico em R$/dia, para o mês aberto. */
  const baselineDailyCents = useMemo(
    () => monthlyToDailyCents(applicable?.monthlyCents ?? 0, ym),
    [applicable, ym],
  );
  const activeDailyCents = paceDaily ?? baselineDailyCents;

  const band = useMemo(() => {
    if (!points || !applicable || applicable.monthlyCents <= 0) return null;
    // A faixa mede a incerteza do **histórico**. Simulando, o usuário escolheu um
    // número — não há faixa em volta de uma escolha.
    if (paceDaily != null) return null;
    return projectionBand({
      points,
      centralDailyCents: baselineDailyCents,
      lowDailyCents: monthlyToDailyCents(applicable.lowCents, ym),
      highDailyCents: monthlyToDailyCents(applicable.highCents, ym),
    });
  }, [points, applicable, ym, baselineDailyCents, paceDaily]);

  const bandWorstCents = useMemo(
    () => (band && points ? bandLowestAhead(band, points, today) : null),
    [band, points, today],
  );

  /**
   * Fundo do poço no cenário em vigor e no do histórico.
   *
   * A curva base (`points`) é só lançamentos. O estimado entra como `delta`
   * diário — o simulador aplica a taxa escolhida; o baseline aplica a mediana.
   */
  const lowestAheadNow = useMemo(
    () =>
      points
        ? lowestAheadAtRate(
            points,
            activeDailyCents,
            isFuture ? ym + '-01' : today,
          )
        : null,
    [points, activeDailyCents, today, isFuture, ym],
  );
  const baselineLowestAhead = useMemo(
    () =>
      points
        ? lowestAheadAtRate(
            points,
            baselineDailyCents,
            isFuture ? ym + '-01' : today,
          )
        : null,
    [points, baselineDailyCents, today, isFuture, ym],
  );

  /**
   * A reta do burn-up precisa ser **independente do mês olhado**.
   *
   * O estimado inclui o mês corrente como amostra (é o que o torna útil na
   * projeção), então usá-lo como orçamento de julho compara julho contra julho:
   * a reta e a curva coincidem e o gráfico anuncia "R$ 0,04 acima" — verdadeiro
   * e inútil. Quando não há mês independente, a régua honesta é o caixa:
   * `cabe por dia` não vem do histórico, vem do que ainda entra e sai.
   */
  const burnupBudget = useMemo((): { dailyCents: number; label: string } | null => {
    if (paceDaily != null) return { dailyCents: paceDaily, label: 'simulado' };
    if (estimateIndependent && baselineDailyCents > 0) {
      return { dailyCents: baselineDailyCents, label: 'estimado' };
    }
    if (metrics?.safeDailyCents != null && metrics.safeDailyCents > 0) {
      return { dailyCents: metrics.safeDailyCents, label: 'cabe no caixa' };
    }
    return null;
  }, [paceDaily, estimateIndependent, baselineDailyCents, metrics]);

  const monthBurnup = useMemo(
    () =>
      month && !isFuture && burnupBudget
        ? burnup({
            month,
            today,
            budgetDailyCents: burnupBudget.dailyCents,
            essentialCategoryIds,
          })
        : null,
    [month, today, burnupBudget, essentialCategoryIds, isFuture],
  );

  const monthTrajectory = useMemo(
    () => trajectory({ months, currentYm, minimumCents }),
    [months, currentYm, minimumCents],
  );

  /** Só na visão da casa: o recorte de uma pessoa não tem divisão a mostrar. */
  const split = useMemo(
    () =>
      month && owner == null
        ? householdSplit({
            month,
            accountOwnerById,
            personNameById,
            personIds: people.map((p) => p.id),
            sharedCategoryIds: sharedSet,
            mode: contributionMode,
            customBps,
          })
        : null,
    [
      month,
      owner,
      accountOwnerById,
      personNameById,
      people,
      sharedSet,
      contributionMode,
      customBps,
    ],
  );

  const sharedCategoryNames = useMemo(
    () =>
      [...sharedSet]
        .map((id) => categoryNameById.get(id))
        .filter((name): name is string => Boolean(name))
        .sort(),
    [sharedSet, categoryNameById],
  );

  /**
   * Despesa lançada do mês, pela mesma régua de "Para onde foi".
   *
   * `nominalCents`, sem fatura, sem estimado e sem repasse: é o total que a barra
   * de categorias soma. Serve de base do percentual do aviso de categorização —
   * quando cada um tinha a sua, a mesma tela dizia "15% da despesa" no aviso e
   * "19%" na barra, sobre o mesmo mês.
   */
  const bookedExpenseCents = useMemo(() => {
    if (!month) return 0;
    let total = 0;
    for (const day of month.days) {
      for (const event of day.events) {
        if (event.kind === 'forecast') continue;
        if (event.internal) continue;
        if (event.flow === 'transfer') continue;
        if (event.nominalCents >= 0) continue;
        total += -event.nominalCents;
      }
    }
    return total;
  }, [month]);

  /**
   * Grupos sem categoria do mês. Sai da própria timeline — as linhas já estão
   * carregadas, e uma query nova poderia divergir do que a tela mostra.
   *
   * Inclui **previsto**, não só realizado: a barra de categorias já contava, e o
   * aviso não — daí os dois números diferentes para "sem categoria". Só linha com
   * `transactionId` entra, porque ocorrência virtual de série não tem o que
   * atualizar (e herda a categoria do modelo, então nem aparece aqui).
   */
  const uncategorized = useMemo(() => {
    if (!month) return { groups: [], totalCents: 0 };
    const rows = month.days.flatMap((d) =>
      d.events
        .filter(
          (e) =>
            e.kind !== 'forecast' &&
            !e.internal &&
            !e.virtual &&
            Boolean(e.transactionId),
        )
        .map((e) => ({
          id: e.transactionId!,
          description: e.label,
          amountCents: Math.abs(e.nominalCents),
          date: e.date,
          categoryId: e.categoryId,
          kind: e.flow,
        })),
    );
    const groups = uncategorizedGroups(rows);
    return {
      groups,
      totalCents: groups.reduce((s, g) => s + g.totalCents, 0),
    };
  }, [month]);

  const runway = useMemo(
    () => invoiceRunway({ months, currentYm }),
    [months, currentYm],
  );

  const upcoming = useMemo(
    () =>
      month
        ? upcomingEvents({
            month,
            today,
            horizonDays: 14,
            essentialCategoryIds,
          })
        : [],
    [month, today, essentialCategoryIds],
  );

  const entryCount = useMemo(
    () =>
      month
        ? month.days.reduce(
            (s, d) => s + d.events.filter((e) => e.kind !== 'forecast').length,
            0,
          )
        : 0,
    [month],
  );

  /**
   * Dias do extrato. Estimado não é lançamento de ninguém — e desde que ele
   * goteja por dia, um mês futuro teria 31 linhas "Variável estimado" e nenhum
   * lançamento de verdade visível. O filtro é de exibição: quem soma continua
   * sendo a timeline, não esta lista.
   */
  const statementDays = useMemo(
    () =>
      month
        ? month.days.filter((d) =>
            d.events.some((e) => e.kind !== 'forecast'),
          )
        : [],
    [month],
  );

  function openStatementAt(date: string) {
    setStatementOpen(true);
    requestAnimationFrame(() => {
      document
        .getElementById(`statement-day-${date}`)
        ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
  }

  if (isLoading) {
    return (
      <div className="mx-auto max-w-3xl space-y-4">
        <Skeleton className="h-20 w-full rounded-xl" />
        <Skeleton className="h-28 w-full rounded-xl" />
        <Skeleton className="h-72 w-full rounded-xl" />
      </div>
    );
  }

  if (isError) {
    return (
      <EmptyState
        icon={CalendarRange}
        title="Não deu para carregar"
        description="Tente de novo em instantes."
        action={
          <Button variant="secondary" size="sm" onClick={refetch}>
            Tentar de novo
          </Button>
        }
      />
    );
  }

  if (!hasAnchor) {
    return (
      <EmptyState
        icon={Wallet}
        title="Informe um saldo para começar"
        description="Sem o saldo real de alguma conta não há de onde partir. Leva 10 segundos em Mais → Saldos reais."
        action={
          <Link to="/more">
            <Button>Informar saldo</Button>
          </Link>
        }
      />
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-5 pb-24 animate-fade-in">
      <header className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-1">
          <NavButton
            label="Mês anterior"
            disabled={index <= 0}
            onClick={() => setSelectedYm(addMonths(ym, -1))}
          >
            <ChevronLeft className="size-4" aria-hidden />
          </NavButton>
          <h1 className="min-w-[9.5rem] text-center font-display text-lg font-semibold tracking-tight">
            {titleCase(formatMonth(ym, 'MMMM yyyy'))}
          </h1>
          <NavButton
            label="Próximo mês"
            disabled={index < 0 || index >= months.length - 1}
            onClick={() => setSelectedYm(addMonths(ym, 1))}
          >
            <ChevronRight className="size-4" aria-hidden />
          </NavButton>
        </div>

        <div className="flex items-center gap-3">
          {!isCurrent ? (
            <button
              type="button"
              onClick={() => setSelectedYm(currentYm)}
              className="rounded-md px-2 py-1 font-mono text-[10px] uppercase tracking-[0.08em] text-text-muted hover:text-text"
            >
              hoje
            </button>
          ) : null}
          {isCurrent ? (
            <div className="text-right">
              <p className="font-mono text-[9px] uppercase tracking-[0.1em] text-text-muted">
                Saldo agora
              </p>
              <p className="font-display text-sm font-semibold tabular-nums">
                <MoneyText
                  cents={todayBalanceCents ?? 0}
                  tone={(todayBalanceCents ?? 0) < 0 ? 'danger' : 'default'}
                />
              </p>
              {anchorAsOfDate ? (
                <p className="font-mono text-[9px] text-text-muted">
                  âncora {formatAsOf(anchorAsOfDate)}
                </p>
              ) : null}
            </div>
          ) : null}
        </div>
      </header>

      {people.length > 1 ? (
        <div className="flex gap-1 rounded-lg border border-border bg-surface p-0.5">
          {[{ id: null, name: 'Casa' }, ...people].map((p) => (
            <button
              key={p.id ?? 'todos'}
              type="button"
              onClick={() => setOwner(p.id)}
              aria-pressed={owner === p.id}
              className={cn(
                'flex-1 rounded-md px-2 py-1.5 text-xs font-medium transition-colors',
                owner === p.id
                  ? 'bg-accent-muted text-accent'
                  : 'text-text-muted hover:text-text',
              )}
            >
              {p.name}
            </button>
          ))}
        </div>
      ) : null}

      {unanchoredAccounts.length > 0 && hasAnchor ? (
        <div className="flex items-start gap-2 rounded-lg border border-warning/30 bg-warning/[0.06] px-3 py-2">
          <AlertTriangle
            className="mt-0.5 size-3.5 shrink-0 text-warning"
            aria-hidden
          />
          <p className="text-[11px] leading-relaxed text-text-muted">
            <strong className="text-text">
              {unanchoredAccounts.map((a) => a.name).join(', ')}
            </strong>{' '}
            sem saldo informado — o ponto de partida ignora{' '}
            {unanchoredAccounts.length === 1 ? 'essa conta' : 'essas contas'}.{' '}
            <Link
              to="/settings"
              className="text-accent underline-offset-2 hover:underline"
            >
              Informar
            </Link>
          </p>
        </div>
      ) : null}

      <MonthStrip
        months={months}
        selectedYm={ym}
        currentYm={currentYm}
        onSelect={setSelectedYm}
      />

      {month && points && metrics ? (
        <>
          <HeroSpendable
            metrics={metrics}
            phase={phase}
            minimumCents={minimumCents}
            closingCents={month.closingCents}
            netCents={month.netCents}
            estimateIndependent={estimateIndependent}
          />

          <TrajectorySection
            month={month}
            points={points}
            minimumCents={minimumCents}
            lowest={
              phase === 'past'
                ? metrics.lowest
                : (metrics.lowestAhead ?? metrics.lowest)
            }
            isCurrent={isCurrent}
            isFuture={isFuture}
            onSelectDay={openStatementAt}
            band={band}
            bandWorstCents={bandWorstCents}
            baselineDailyCents={baselineDailyCents}
            activeDailyCents={activeDailyCents}
            onPaceChange={setPaceDaily}
            lowestAhead={lowestAheadNow}
            baselineLowestAhead={baselineLowestAhead}
            scopePersonId={owner}
            scopeLabel={owner ? (personNameById.get(owner) ?? null) : null}
          />

          {uncategorized.groups.length > 0 ? (
            <UncategorizedSection
              groups={uncategorized.groups}
              ym={ym}
              totalCents={uncategorized.totalCents}
              monthOutCents={bookedExpenseCents}
              categories={expenseCategories}
            />
          ) : null}

          {split ? (
            <HouseholdSplitCard
              split={split}
              sharedCategoryNames={sharedCategoryNames}
            />
          ) : null}

          <CommitmentsSection
            metrics={metrics}
            phase={phase}
            minimumCents={minimumCents}
            upcoming={upcoming}
            onSelectEvent={(eventId) => {
              const occurrence = occurrenceById.get(eventId);
              if (occurrence) setEditing(occurrence);
            }}
          />

          {/* Camada 4 — entender o mês.
              Colapsada por padrão: `docs/UX.md` pede "Casa calma · home sem grade
              de KPIs", e a home tinha treze seções, seis gráficos e ~35 números
              abertos de uma vez. Nada aqui responde "dá para gastar hoje?" — é
              contexto, e contexto sob demanda continua acessível sem competir com a
              decisão pela primeira tela. */}
          <section className="overflow-hidden rounded-xl border border-border bg-surface">
            <button
              type="button"
              onClick={() => setContextOpen((v) => !v)}
              aria-expanded={contextOpen}
              className="flex w-full items-center gap-2 px-4 py-3 text-left hover:bg-surface-hover"
            >
              <ChevronRight
                className={cn(
                  'size-4 shrink-0 text-text-muted transition-transform',
                  contextOpen && 'rotate-90',
                )}
                aria-hidden
              />
              <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-text-muted">
                Entender o mês
              </span>
              <span className="ml-auto text-[11px] text-text-muted">
                renda, categorias, fatura, trajetória
              </span>
            </button>

            {contextOpen ? (
              <div className="space-y-3 border-t border-border p-3">
                <HabitsSection
                  metrics={metrics}
                  phase={phase}
                  comparison={comparison}
                  sparkline={sparkline}
                  forecast={forecast}
                  applicableForecast={applicable}
                  ym={ym}
                  categoryNameById={categoryNameById}
                  burnup={monthBurnup}
                  burnupBudgetLabel={burnupBudget?.label}
                  income={metrics.income}
                  runway={runway}
                  onSelectMonth={setSelectedYm}
                />

                <CategoryBars
                  month={month}
                  categoryNameById={categoryNameById}
                  onSelectEvent={(event) => {
                    const occurrence = occurrenceById.get(event.id);
                    if (occurrence) setEditing(occurrence);
                  }}
                />

                {monthTrajectory ? (
                  <TrajectoryChart
                    trajectory={monthTrajectory}
                    minimumCents={minimumCents}
                    currentYm={currentYm}
                    onSelect={setSelectedYm}
                  />
                ) : null}
              </div>
            ) : null}
          </section>

          <section className="overflow-hidden rounded-xl border border-border bg-surface">
            <button
              type="button"
              onClick={() => setStatementOpen((v) => !v)}
              aria-expanded={statementOpen}
              className="flex w-full items-center gap-2 px-4 py-3 text-left hover:bg-surface-hover"
            >
              <ChevronRight
                className={cn(
                  'size-4 shrink-0 text-text-muted transition-transform',
                  statementOpen && 'rotate-90',
                )}
                aria-hidden
              />
              <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-text-muted">
                Extrato do mês
              </span>
              <span className="ml-auto font-mono text-[11px] tabular-nums text-text-muted">
                {entryCount} {entryCount === 1 ? 'lançamento' : 'lançamentos'}
              </span>
            </button>

            {statementOpen ? (
              statementDays.length === 0 ? (
                <p className="border-t border-border px-4 py-8 text-center text-[13px] text-text-muted">
                  Nenhum movimento neste mês — o saldo segue em{' '}
                  <MoneyText
                    cents={month.closingCents}
                    className="text-[13px] text-text"
                  />
                  .
                </p>
              ) : (
                <ul className="border-t border-border">
                  {statementDays.map((day) => (
                    <DayRow
                      key={day.date}
                      day={day}
                      categoryNameById={categoryNameById}
                      isToday={day.date === today}
                      onSelect={(event) => {
                        const occurrence = occurrenceById.get(event.id);
                        if (occurrence) setEditing(occurrence);
                      }}
                    />
                  ))}
                </ul>
              )
            ) : null}
          </section>
        </>
      ) : null}

      <button
        type="button"
        onClick={() => setCreating(true)}
        aria-label="Novo lançamento"
        className={cn(
          'fixed bottom-[calc(4.5rem+var(--spacing-safe-bottom))] right-4 z-30 flex items-center gap-2',
          'rounded-pill bg-accent px-4 py-3 font-medium text-accent-fg shadow-lg',
          'hover:brightness-105 sm:bottom-6',
        )}
      >
        <Plus className="size-4" aria-hidden />
        Lançamento
      </button>

      <EntrySheet
        open={creating || editing != null}
        occurrence={editing}
        template={
          editing?.seriesId
            ? (templateById.get(editing.seriesId) ?? null)
            : null
        }
        defaultYm={ym}
        today={today}
        onClose={() => {
          setCreating(false);
          setEditing(null);
        }}
      />
    </div>
  );
}

function NavButton({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'flex size-8 items-center justify-center rounded-md text-text-muted',
        'hover:bg-surface-hover hover:text-text disabled:opacity-30 disabled:hover:bg-transparent',
      )}
    >
      {children}
    </button>
  );
}
