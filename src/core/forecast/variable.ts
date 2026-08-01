/**
 * Previsão de gasto variável a partir do histórico.
 *
 * O plano só cobre o que você lembrou de cadastrar. Mercado, farmácia e PIX
 * miúdo nunca entram — e são a maior parte do gasto. Sem isso a projeção fica
 * otimista pelo valor inteiro do variável, todo mês.
 *
 * Três defesas contra número inventado:
 *
 * 1. **Só saída discricionária entra.** A régua é a mesma do ritmo
 *    (`core/transactions/commitment`): recorrência, categoria essencial e
 *    pagamento de fatura ficam fora. Sem isso os dois números mediriam coisas
 *    diferentes e o app se contradiria na mesma tela.
 * 2. **Categoria coberta por um previsto não é prevista pelo histórico** — senão o
 *    mesmo gasto conta duas vezes. Isso é decidido **na aplicação**
 *    (`applicableForecast`, por mês-alvo), não na amostragem: quando era decidido
 *    aqui, um `Supermercado` cadastrado a partir de agosto apagava a mediana de
 *    Mercado do estimado de **julho**, e o painel anunciava R$ 54/dia de estimado
 *    contra R$ 119/dia de ritmo medido — os dois números deixavam de falar do
 *    mesmo conjunto e o app acusava "mês mais caro que o habitual" sem base.
 * 3. **Mês incompleto ou é descartado ou é normalizado.** Um extrato que só
 *    cobre 6 dias de junho não vale como "mês de junho"; usá-lo cru puxaria a
 *    média para baixo e a projeção voltaria a mentir, só que para o outro lado.
 *
 * **O mês corrente conta**, desde que já tenha dias suficientes vividos. Excluí-lo
 * por princípio era o que fazia o app calcular R$ 131/dia de ritmo com 28 dias de
 * julho na mão e ao mesmo tempo anunciar "sem gasto variável estimado". O risco
 * real não é o mês estar aberto, é ele estar **no começo**: três dias escalados
 * para mês cheio produzem número selvagem que governa doze meses de projeção.
 * Daí `minElapsedDays`, e a cobertura do mês corrente medida por **dias vividos**,
 * não pelo intervalo entre o primeiro e o último lançamento.
 *
 * A saída é uma faixa (menor mês / maior mês), não um número exato: com
 * poucos meses de histórico, precisão falsa é pior que uma faixa honesta.
 */

import { getDaysInMonth } from 'date-fns';
import { assertYearMonth, type YearMonth } from '@/core/month';
import { isVariableOutflow } from '@/core/transactions/commitment';

export type ForecastTx = {
  /** ISO yyyy-MM-dd. */
  date: string;
  kind: 'income' | 'expense' | 'transfer';
  amountCents: number;
  categoryId: string | null;
  /** Ocorrência de recorrência — compromisso, não hábito. */
  seriesId?: string | null;
  /** Para reconhecer parcelamento: parcela não é hábito, é compromisso. */
  description?: string | null;
};

export type CategoryForecast = {
  categoryId: string | null;
  /** Mediana dos meses usados, normalizada para mês cheio. */
  monthlyCents: number;
  lowCents: number;
  highCents: number;
  monthsUsed: number;
};

export type SkippedMonth = {
  ym: YearMonth;
  /** `too_early`: mês corrente com poucos dias vividos para servir de amostra. */
  reason: 'no_data' | 'low_coverage' | 'too_early';
  /** Fração do mês com dados (0–1). */
  coverage: number;
};

export type VariableForecast = {
  /** Soma das medianas por categoria. */
  totalMonthlyCents: number;
  lowCents: number;
  highCents: number;
  byCategory: CategoryForecast[];
  monthsUsed: YearMonth[];
  monthsSkipped: SkippedMonth[];
  /**
   * Mês aberto que entrou na amostra, se algum.
   *
   * A tela precisa dizer isso: "inclui julho parcial" é diferente de "três
   * meses fechados", e a confiança que o usuário deposita no número muda.
   */
  partialMonthUsed: YearMonth | null;
  /** `none` sem histórico usável; `low` com 1–2 meses. */
  confidence: 'none' | 'low' | 'medium';
};

const DEFAULT_MIN_COVERAGE = 0.8;

/**
 * Dias vividos mínimos para o mês corrente virar amostra.
 *
 * Duas semanas já contêm um fim de semana, um ciclo de mercado e a rodada de
 * contas do começo do mês. Abaixo disso o fator de escala (1/cobertura) fica
 * grande demais e um único gasto atípico governa a projeção inteira.
 */
const DEFAULT_MIN_ELAPSED_DAYS = 14;

function daysInYm(ym: YearMonth): number {
  const [y, m] = ym.split('-').map(Number);
  return getDaysInMonth(new Date(y!, m! - 1, 1));
}

/** Fração do mês coberta pelos lançamentos (primeiro ao último dia visto). */
export function monthCoverage(ym: string, dates: ReadonlyArray<string>): number {
  assertYearMonth(ym);
  const inMonth = dates.filter((d) => d.slice(0, 7) === ym).sort();
  if (inMonth.length === 0) return 0;

  const [y, m] = ym.split('-').map(Number);
  const dim = getDaysInMonth(new Date(y!, m! - 1, 1));
  const first = Number(inMonth[0]!.slice(8, 10));
  const last = Number(inMonth[inMonth.length - 1]!.slice(8, 10));
  return (last - first + 1) / dim;
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[mid]!;
  return Math.round((sorted[mid - 1]! + sorted[mid]!) / 2);
}

/**
 * Estima o gasto variável mensal por categoria, a partir do histórico puro.
 *
 * Não desconta o que o plano cobre — isso é por mês-alvo, em `applicableForecast`.
 */
export function forecastVariable(input: {
  transactions: ReadonlyArray<ForecastTx>;
  /** Meses de histórico a considerar. Pode incluir o corrente. */
  months: ReadonlyArray<YearMonth>;
  /**
   * Hoje (ISO). Define qual mês é parcial e até onde ele foi observado.
   * Sem isso, todo mês da lista é tratado como fechado.
   */
  today?: string | null;
  /** Categorias essenciais — saída nelas é compromisso, não hábito. */
  essentialCategoryIds?: ReadonlySet<string> | null;
  /** Cobertura mínima para o mês contar. Padrão 0.8. */
  minCoverage?: number;
  /** Dias vividos mínimos para o mês corrente contar. Padrão 14. */
  minElapsedDays?: number;
}): VariableForecast {
  const minCoverage = input.minCoverage ?? DEFAULT_MIN_COVERAGE;
  const minElapsedDays = input.minElapsedDays ?? DEFAULT_MIN_ELAPSED_DAYS;
  const essential = input.essentialCategoryIds ?? null;
  const today = input.today ?? null;
  const currentYm = today ? today.slice(0, 7) : null;

  // Mesma régua do ritmo: só o discricionário. Recorrência, categoria essencial
  // e pagamento de fatura ficam fora — são compromisso ou quitação, não hábito.
  const variable = input.transactions.filter((t) =>
    isVariableOutflow(t, essential),
  );
  const allDates = input.transactions.map((t) => t.date);

  const monthsUsed: YearMonth[] = [];
  const monthsSkipped: SkippedMonth[] = [];
  let partialMonthUsed: YearMonth | null = null;
  /** categoryId → total normalizado por mês usado. */
  const perCategory = new Map<string | null, number[]>();

  for (const ym of input.months) {
    // Mês que ainda não começou não é amostra de nada.
    if (currentYm && ym > currentYm) continue;

    const partial = ym === currentYm;

    if (partial) {
      // Cobertura do mês aberto é **dias vividos**, não o intervalo entre o
      // primeiro e o último lançamento: o mês foi observado até hoje, ponto.
      const elapsed = Number(today!.slice(8, 10));
      const coverage = elapsed / daysInYm(ym);
      if (elapsed < minElapsedDays) {
        monthsSkipped.push({ ym, reason: 'too_early', coverage });
        continue;
      }
      if (monthCoverage(ym, allDates) === 0) {
        monthsSkipped.push({ ym, reason: 'no_data', coverage: 0 });
        continue;
      }
      partialMonthUsed = ym;
      accumulate(ym, coverage);
      continue;
    }

    const coverage = monthCoverage(ym, allDates);
    if (coverage === 0) {
      monthsSkipped.push({ ym, reason: 'no_data', coverage });
      continue;
    }
    if (coverage < minCoverage) {
      monthsSkipped.push({ ym, reason: 'low_coverage', coverage });
      continue;
    }

    accumulate(ym, coverage);
  }

  function accumulate(ym: YearMonth, coverage: number) {
    monthsUsed.push(ym);
    // Normaliza para mês cheio: 26 de 31 dias observados vira o mês inteiro.
    const scale = 1 / coverage;

    const monthTotals = new Map<string | null, number>();
    for (const tx of variable) {
      if (tx.date.slice(0, 7) !== ym) continue;
      monthTotals.set(
        tx.categoryId,
        (monthTotals.get(tx.categoryId) ?? 0) + tx.amountCents,
      );
    }

    // Categorias vistas em qualquer mês precisam de um zero nos meses sem gasto,
    // senão a mediana ignora os meses em que não gastou nada.
    for (const [categoryId, total] of monthTotals) {
      const list = perCategory.get(categoryId) ?? [];
      list.push(Math.round(total * scale));
      perCategory.set(categoryId, list);
    }
    for (const [categoryId, list] of perCategory) {
      if (!monthTotals.has(categoryId) && list.length < monthsUsed.length) {
        list.push(0);
      }
    }
  }

  const byCategory: CategoryForecast[] = [...perCategory.entries()]
    .map(([categoryId, values]) => ({
      categoryId,
      monthlyCents: median(values),
      lowCents: Math.min(...values),
      highCents: Math.max(...values),
      monthsUsed: values.length,
    }))
    .filter((c) => c.monthlyCents > 0 || c.highCents > 0)
    .sort((a, b) => b.monthlyCents - a.monthlyCents);

  const totalMonthlyCents = byCategory.reduce(
    (sum, c) => sum + c.monthlyCents,
    0,
  );
  const lowCents = byCategory.reduce((sum, c) => sum + c.lowCents, 0);
  const highCents = byCategory.reduce((sum, c) => sum + c.highCents, 0);

  const confidence: VariableForecast['confidence'] =
    monthsUsed.length === 0 ? 'none' : monthsUsed.length <= 2 ? 'low' : 'medium';

  return {
    totalMonthlyCents,
    lowCents,
    highCents,
    byCategory,
    monthsUsed,
    monthsSkipped,
    partialMonthUsed,
    confidence,
  };
}

export type ApplicableForecast = {
  monthlyCents: number;
  lowCents: number;
  highCents: number;
  /** Categorias que o plano já cobre neste mês, então saíram da conta. */
  coveredCategoryIds: string[];
  /** As que sobraram, na ordem da mediana — o que a tela lista. */
  byCategory: CategoryForecast[];
};

/**
 * O estimado que se aplica a **um** mês.
 *
 * A mediana histórica é do hábito inteiro; o que não deve ser somado de novo é a
 * categoria que aquele mês já tem cadastrada. Como o plano muda de mês para mês,
 * a subtração é por mês — e não pela janela, que era o que fazia o plano de agosto
 * apagar o histórico de julho.
 *
 * Só desconta a categoria **inteira**: se o previsto de mercado é R$ 1.100 e a
 * mediana é R$ 1.687, o certo seria estimar os R$ 587 de diferença. Não fazemos
 * isso porque o previsto pode ser o mês todo ou uma compra pontual, e chutar qual
 * dos dois produziria número pior que o conservador.
 */
export function applicableForecast(
  forecast: VariableForecast,
  plannedCategoryIds?: ReadonlySet<string> | null,
): ApplicableForecast {
  const planned = plannedCategoryIds ?? null;
  let monthlyCents = 0;
  let lowCents = 0;
  let highCents = 0;
  const coveredCategoryIds: string[] = [];
  const byCategory: CategoryForecast[] = [];

  for (const category of forecast.byCategory) {
    if (category.categoryId && planned?.has(category.categoryId)) {
      coveredCategoryIds.push(category.categoryId);
      continue;
    }
    monthlyCents += category.monthlyCents;
    lowCents += category.lowCents;
    highCents += category.highCents;
    byCategory.push(category);
  }

  return { monthlyCents, lowCents, highCents, coveredCategoryIds, byCategory };
}

/**
 * Parcela do variável que ainda deve acontecer no mês corrente.
 * Proporcional aos dias que faltam — o que já saiu está nos lançamentos.
 */
export function remainingThisMonth(
  monthlyCents: number,
  today: string,
): number {
  const ym = today.slice(0, 7);
  assertYearMonth(ym);
  const [y, m] = ym.split('-').map(Number);
  const dim = getDaysInMonth(new Date(y!, m! - 1, 1));
  const day = Number(today.slice(8, 10));
  const remaining = Math.max(0, dim - day);
  return Math.round((monthlyCents * remaining) / dim);
}

/** Dilui o estimado mensal em custo médio por dia do mês. */
export function monthlyToDailyCents(
  monthlyCents: number,
  ym: YearMonth,
): number {
  assertYearMonth(ym);
  if (monthlyCents <= 0) return 0;
  const [y, m] = ym.split('-').map(Number);
  const dim = getDaysInMonth(new Date(y!, m! - 1, 1));
  return Math.round(monthlyCents / dim);
}
