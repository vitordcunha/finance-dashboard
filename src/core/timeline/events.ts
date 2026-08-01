/**
 * Linha do tempo: uma sequência única de eventos datados com saldo correndo.
 *
 *     saldo(d) = âncora + Σ eventos até d
 *
 * Mês é só um recorte da linha, então "sobrou de julho" e "abertura de agosto"
 * são o mesmo número por construção — sem ritual de fechamento no meio.
 *
 * Desde a unificação do modelo, previsto e realizado são a mesma entidade
 * (`transactions.status`), então aqui não há mais nada a conciliar: a soma é
 * direta. A regra que tentava adivinhar quando um lançamento cumpria uma conta
 * do plano — e que fazia julho/2026 pagar aluguel duas vezes — deixou de
 * existir junto com o `plan_items`.
 */

import { addMonths, monthRange, type YearMonth } from '@/core/month';
import { isOverdue, type Occurrence } from '@/core/series';
import { merchantKey } from '@/core/transactions/grouping';

export type TimelineEventKind = 'actual' | 'planned' | 'forecast';

export type TimelineEvent = {
  id: string;
  /** ISO yyyy-MM-dd. */
  date: string;
  kind: TimelineEventKind;
  /** Efeito no caixa, com sinal. Zero quando o dinheiro não se move hoje. */
  deltaCents: number;
  /**
   * Valor do lançamento, com sinal, **independente do caixa**.
   *
   * Compra no cartão custa R$ 230 e move R$ 0 de caixa no dia. Mostrar o delta
   * na lista faria a linha dizer "Terapia −R$ 0,00", que é verdade sobre o
   * caixa e mentira sobre o gasto.
   */
  nominalCents: number;
  /** Aconteceu, mas não moveu caixa — tipicamente compra no cartão. */
  cashless?: boolean;
  label: string;
  flow: 'income' | 'expense' | 'transfer';
  categoryId: string | null;
  accountId: string | null;
  personId: string | null;
  /** Linha no banco. Null em ocorrência virtual e no estimado. */
  transactionId?: string | null;
  /** Série de origem, quando o evento vem de uma recorrência. */
  seriesId?: string | null;
  /** Ocorrência projetada pela recorrência, sem linha no banco. */
  virtual?: boolean;
  /** Média do histórico, não é lançamento de ninguém. */
  estimated?: boolean;
  /** Previsto cujo dia passou sem ninguém confirmar. */
  overdue?: boolean;
  /**
   * Repasse entre contas do casal — o par espelhado do rateio.
   *
   * Move caixa de uma conta para a outra e some no total da casa. Sem esta marca
   * a mesma transferência era lida três vezes: renda dele, gasto variável dela e
   * contribuição no card de divisão. A casa "recebia" R$ 16.666 quando recebeu
   * R$ 14.400.
   */
  internal?: boolean;
};

/**
 * Efeito no caixa.
 *
 * **Cartão de crédito não guarda caixa.** Nada que sai de uma conta `credit`
 * move dinheiro no dia em que acontece: a compra vira dívida, e o caixa só se
 * mexe quando a fatura é paga — uma transferência da corrente para o cartão.
 * Contar os dois seria pagar a compra duas vezes.
 */
export function occurrenceDelta(
  o: Pick<Occurrence, 'kind' | 'amountCents' | 'accountId'>,
  cashAccountIds?: ReadonlySet<string> | null,
): number {
  const nonCash = Boolean(
    cashAccountIds && o.accountId && !cashAccountIds.has(o.accountId),
  );

  if (o.kind === 'income') return nonCash ? 0 : o.amountCents;
  if (o.kind === 'expense') return nonCash ? 0 : -o.amountCents;

  // transfer: sai da origem. Pagar fatura é caixa que some e não volta.
  return nonCash ? 0 : -o.amountCents;
}

export type BuildTimelineInput = {
  occurrences: ReadonlyArray<Occurrence>;
  /** Meses cobertos pela linha, em ordem — usados para o estimado. */
  months: ReadonlyArray<YearMonth>;
  today: string;
  cashAccountIds?: ReadonlySet<string> | null;
  /**
   * Gasto variável previsto pelo histórico (`core/forecast`), por mês cheio.
   * Cobre o que ninguém cadastra: mercado, farmácia, PIX miúdo.
   *
   * Entra **diluído por dia**, um evento por data. No mês corrente só a partir
   * de amanhã: o que já saiu está nos lançamentos reais.
   */
  forecastMonthlyCents?: number | null;
  /**
   * Estimado mensal **por mês**, quando o valor aplicável muda de mês para mês.
   *
   * Muda porque a defesa contra dobrar é por mês-alvo: se agosto tem
   * `Supermercado` cadastrado, o estimado de agosto não deve somar a mediana de
   * Mercado — mas o de julho, que não tem, deve. Um número único para a janela
   * inteira fazia o plano de agosto apagar o histórico de julho.
   *
   * Ganha de `forecastMonthlyCents`; perde para `forecastDailyCents`.
   */
  forecastMonthlyByYm?: ReadonlyMap<string, number> | null;
  /**
   * Estimado por **dia**, em vez de por mês. Ganha do mensal quando informado.
   *
   * É o que o simulador de ritmo usa: converter R$/dia para um total mensal
   * exigiria adivinhar de qual mês, e fevereiro e agosto dariam projeções
   * diferentes para o mesmo hábito. Desde que o estimado goteja por dia, a taxa
   * diária é a unidade natural do motor.
   */
  forecastDailyCents?: number | null;
};

/** Eventos ordenados por data. Não calcula saldo — ver `runningBalance`. */
export function buildTimelineEvents(input: BuildTimelineInput): TimelineEvent[] {
  const events: TimelineEvent[] = [];
  const currentYm = input.today.slice(0, 7);

  for (const o of input.occurrences) {
    const deltaCents = occurrenceDelta(o, input.cashAccountIds);
    const nominalCents =
      o.kind === 'income' ? o.amountCents : -o.amountCents;

    events.push({
      id: o.id,
      date: o.date,
      kind: o.status === 'planned' ? 'planned' : 'actual',
      deltaCents,
      nominalCents,
      cashless: deltaCents === 0 && o.amountCents > 0,
      label: o.description,
      flow: o.kind,
      categoryId: o.categoryId,
      accountId: o.accountId,
      personId: o.personId,
      transactionId: o.rowId,
      seriesId: o.seriesId,
      virtual: o.virtual,
      overdue: isOverdue(o, input.today),
    });
  }

  markInternalTransfers(events);

  const forecastDaily = input.forecastDailyCents ?? null;
  const forecastByYm = input.forecastMonthlyByYm ?? null;
  const forecastFlat = input.forecastMonthlyCents ?? 0;
  if (forecastDaily != null ? forecastDaily > 0 : forecastByYm || forecastFlat > 0) {
    for (const ym of input.months) {
      // Mês encerrado é história: os lançamentos reais já contam.
      if (ym < currentYm) continue;

      const forecastMonthly = forecastByYm
        ? (forecastByYm.get(ym) ?? 0)
        : forecastFlat;

      const { end } = monthRange(ym);
      const lastDay = Number(end.slice(8, 10));
      // Distribuição exata: `round` por dia deixava R$ 0,14 de sobra num mês e
      // o total do estimado deixava de fechar com o número que a tela anuncia.
      const base =
        forecastDaily != null
          ? forecastDaily
          : Math.floor(forecastMonthly / lastDay);
      const extra =
        forecastDaily != null ? 0 : forecastMonthly - base * lastDay;
      if (base <= 0 && extra <= 0) continue;

      // Um dia por dia, não um tranco no meio do mês.
      //
      // O variável escorre: mercado na quarta, farmácia no sábado, PIX miúdo
      // todo dia. Concentrar o mês inteiro numa data só fazia o gráfico desenhar
      // um penhasco onde existe uma ladeira.
      //
      // Estes eventos **não** mexem no saldo real (`groupTimeline` mantém duas
      // correntes): entram só na curva/faixa de alerta. O herói "livre para
      // gastar" lê a corrente sem estimado — compromisso agendado, não chute.
      const from = ym === currentYm ? Number(input.today.slice(8, 10)) + 1 : 1;
      for (let day = from; day <= lastDay; day++) {
        const date = `${ym}-${String(day).padStart(2, '0')}`;
        // A sobra dos centavos vai nos primeiros dias do mês, sempre nos mesmos:
        // espalhar por dia sorteado faria o gráfico mudar de forma a cada render.
        const perDay = base + (day <= extra ? 1 : 0);
        if (perDay <= 0) continue;
        events.push({
          id: `forecast:${date}`,
          date,
          kind: 'forecast',
          deltaCents: -perDay,
          nominalCents: -perDay,
          label: 'Variável estimado',
          flow: 'expense',
          categoryId: null,
          accountId: null,
          personId: null,
          transactionId: null,
          estimated: true,
        });
      }
    }
  }

  events.sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? -1 : 1;
    // Entradas antes de saídas no mesmo dia: evita saldo negativo cosmético.
    if (a.deltaCents !== b.deltaCents) return b.deltaCents - a.deltaCents;
    return a.id.localeCompare(b.id);
  });

  return events;
}

/**
 * Marca os pares espelhados de repasse interno.
 *
 * O rateio é cadastrado como **par**: saída na conta dela, entrada na conta dele,
 * mesma data, mesmo valor. O modelo não liga os dois lados — a linha do tempo
 * nunca credita o *destino* de uma transferência, e é por isso que o rateio não é
 * `transfer`. Então a evidência disponível é a assinatura.
 *
 * A detecção vive **aqui**, e não em cada consumidor, porque era exatamente a
 * duplicação que fazia `householdSplit` conhecer o par e `metrics` não: a mesma
 * transferência entrava como renda da casa num lugar e como repasse no outro.
 *
 * Exige contas **diferentes**: mesma conta com entrada e saída idênticas no mesmo
 * dia é estorno, não repasse.
 */
function markInternalTransfers(events: TimelineEvent[]): void {
  const byKey = new Map<
    string,
    { inflow: TimelineEvent[]; outflow: TimelineEvent[] }
  >();

  for (const event of events) {
    if (event.kind === 'forecast') continue;
    if (event.flow === 'transfer') continue;
    if (!event.accountId) continue;
    // Descrição **normalizada**: os dois lados raramente têm o mesmo texto —
    // `Rateio casa · parcela 1` × `Rateio casa · parcela 1 · Greicy`.
    const key = `${event.date}|${Math.abs(event.nominalCents)}|${merchantKey(event.label)}`;
    const slot = byKey.get(key) ?? { inflow: [], outflow: [] };
    if (event.flow === 'income') slot.inflow.push(event);
    else slot.outflow.push(event);
    byKey.set(key, slot);
  }

  for (const { inflow, outflow } of byKey.values()) {
    const taken = new Set<number>();
    for (const out of outflow) {
      const match = inflow.findIndex(
        (candidate, i) =>
          !taken.has(i) && candidate.accountId !== out.accountId,
      );
      if (match < 0) continue;
      taken.add(match);
      inflow[match]!.internal = true;
      out.internal = true;
    }
  }
}

/** Categorias cobertas por um previsto — o estimado não deve dobrar com elas. */
export function plannedCategoriesIn(
  occurrences: ReadonlyArray<Occurrence>,
): Set<string> {
  const out = new Set<string>();
  for (const o of occurrences) {
    if (o.status !== 'planned') continue;
    if (o.kind !== 'expense') continue;
    if (o.categoryId) out.add(o.categoryId);
  }
  return out;
}

/**
 * O mesmo, **por mês**.
 *
 * A versão de janela inteira apagava o histórico de uma categoria do estimado de
 * *todos* os meses porque existia um previsto em *um* deles: o `Supermercado`
 * cadastrado a partir de agosto zerava a mediana de Mercado em julho, e o painel
 * anunciava R$ 54/dia de estimado contra R$ 119/dia de ritmo real.
 */
export function plannedCategoriesByYm(
  occurrences: ReadonlyArray<Occurrence>,
): Map<string, Set<string>> {
  const out = new Map<string, Set<string>>();
  for (const o of occurrences) {
    if (o.status !== 'planned') continue;
    if (o.kind !== 'expense') continue;
    if (!o.categoryId) continue;
    const ym = o.date.slice(0, 7);
    const set = out.get(ym) ?? new Set<string>();
    set.add(o.categoryId);
    out.set(ym, set);
  }
  return out;
}

/** Primeiro mês da janela, dado o mês corrente e quantos meses de passado. */
export function timelineMonths(
  currentYm: YearMonth,
  past: number,
  future: number,
): YearMonth[] {
  return Array.from({ length: past + 1 + future }, (_, i) =>
    addMonths(currentYm, i - past),
  );
}
