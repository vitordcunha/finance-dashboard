import { describe, expect, it } from 'vitest';
import {
  forecastVariable,
  monthCoverage,
  monthlyToDailyCents,
  remainingThisMonth,
  type ForecastTx,
} from '@/core/forecast';

const MERCADO = 'mercado';
const MORADIA = 'moradia';

function exp(date: string, amountCents: number, categoryId: string | null = MERCADO): ForecastTx {
  return { date, amountCents, kind: 'expense', categoryId };
}

describe('monthCoverage', () => {
  it('mede do primeiro ao último dia visto', () => {
    // 25 a 30 de junho = 6 de 30 dias
    expect(
      monthCoverage('2026-06', ['2026-06-25', '2026-06-28', '2026-06-30']),
    ).toBeCloseTo(6 / 30);
  });

  it('mês cheio dá 1', () => {
    expect(monthCoverage('2026-07', ['2026-07-01', '2026-07-31'])).toBe(1);
  });

  it('sem dado dá 0', () => {
    expect(monthCoverage('2026-05', ['2026-07-01'])).toBe(0);
  });
});

describe('forecastVariable', () => {
  it('descarta mês com cobertura baixa', () => {
    // Junho só tem 6 dias importados — não vale como mês.
    const f = forecastVariable({
      transactions: [exp('2026-06-25', 10_000), exp('2026-06-30', 20_000)],
      months: ['2026-06'],
    });

    expect(f.monthsUsed).toEqual([]);
    expect(f.monthsSkipped[0]).toMatchObject({
      ym: '2026-06',
      reason: 'low_coverage',
    });
    expect(f.confidence).toBe('none');
    expect(f.totalMonthlyCents).toBe(0);
  });

  it('normaliza mês parcial para mês cheio', () => {
    // 01 a 15 de julho = 15/31; gastou 100.000 → ~206.666 no mês cheio
    const f = forecastVariable({
      transactions: [exp('2026-07-01', 50_000), exp('2026-07-15', 50_000)],
      months: ['2026-07'],
      minCoverage: 0.4,
    });

    expect(f.monthsUsed).toEqual(['2026-07']);
    expect(f.totalMonthlyCents).toBe(Math.round(100_000 * (31 / 15)));
  });

  it('categoria coberta pelo plano fica de fora', () => {
    const f = forecastVariable({
      transactions: [
        exp('2026-07-01', 100_000, MERCADO),
        exp('2026-07-31', 429_526, MORADIA),
      ],
      months: ['2026-07'],
      plannedCategoryIds: new Set([MORADIA]),
    });

    expect(f.byCategory.map((c) => c.categoryId)).toEqual([MERCADO]);
    expect(f.totalMonthlyCents).toBe(100_000);
  });

  it('ignora entradas e transferências', () => {
    const f = forecastVariable({
      transactions: [
        exp('2026-07-01', 10_000),
        { date: '2026-07-31', amountCents: 900_000, kind: 'income', categoryId: null },
        { date: '2026-07-14', amountCents: 340_000, kind: 'transfer', categoryId: null },
      ],
      months: ['2026-07'],
    });

    expect(f.totalMonthlyCents).toBe(10_000);
  });

  it('usa mediana, então um mês fora da curva não domina', () => {
    const f = forecastVariable({
      transactions: [
        exp('2026-05-01', 100_000),
        exp('2026-05-31', 0),
        exp('2026-06-01', 110_000),
        exp('2026-06-30', 0),
        // mês atípico
        exp('2026-07-01', 900_000),
        exp('2026-07-31', 0),
      ],
      months: ['2026-05', '2026-06', '2026-07'],
    });

    expect(f.monthsUsed).toHaveLength(3);
    expect(f.totalMonthlyCents).toBe(110_000);
    expect(f.highCents).toBe(900_000);
    expect(f.lowCents).toBe(100_000);
    expect(f.confidence).toBe('medium');
  });

  it('mês sem gasto na categoria entra como zero na mediana', () => {
    const f = forecastVariable({
      transactions: [
        exp('2026-05-01', 60_000, MERCADO),
        exp('2026-05-31', 0, MERCADO),
        // junho sem mercado, mas com movimento para dar cobertura
        exp('2026-06-01', 1_000, 'outros'),
        exp('2026-06-30', 1_000, 'outros'),
      ],
      months: ['2026-05', '2026-06'],
    });

    const mercado = f.byCategory.find((c) => c.categoryId === MERCADO)!;
    expect(mercado.monthsUsed).toBe(2);
    expect(mercado.lowCents).toBe(0);
  });

  it('um mês só → confiança baixa', () => {
    const f = forecastVariable({
      transactions: [exp('2026-07-01', 10_000), exp('2026-07-31', 10_000)],
      months: ['2026-06', '2026-07'],
    });

    expect(f.monthsUsed).toEqual(['2026-07']);
    expect(f.confidence).toBe('low');
  });

  it('sem histórico nenhum devolve zero e none', () => {
    const f = forecastVariable({ transactions: [], months: ['2026-07'] });
    expect(f.totalMonthlyCents).toBe(0);
    expect(f.confidence).toBe('none');
    expect(f.byCategory).toEqual([]);
  });
});

describe('remainingThisMonth', () => {
  it('proporcional aos dias que faltam', () => {
    // 27/07: faltam 4 de 31 dias
    expect(remainingThisMonth(310_000, '2026-07-27')).toBe(
      Math.round((310_000 * 4) / 31),
    );
  });

  it('último dia do mês não sobra nada', () => {
    expect(remainingThisMonth(310_000, '2026-07-31')).toBe(0);
  });

  it('dia 1 sobra quase o mês inteiro', () => {
    expect(remainingThisMonth(310_000, '2026-07-01')).toBe(
      Math.round((310_000 * 30) / 31),
    );
  });
});

describe('monthlyToDailyCents', () => {
  it('divide o mês cheio pelos dias do mês', () => {
    expect(monthlyToDailyCents(310_000, '2026-07')).toBe(
      Math.round(310_000 / 31),
    );
  });

  it('zero devolve zero', () => {
    expect(monthlyToDailyCents(0, '2026-07')).toBe(0);
  });
});

describe('forecastVariable — mês corrente como amostra parcial', () => {
  /** Julho/2026 do usuário: 28 dias vividos, aluguel e fatura no meio. */
  const julho: ForecastTx[] = [
    // Compromisso: recorrência. Fora da amostra.
    { date: '2026-07-06', amountCents: 429_526, kind: 'expense', categoryId: MORADIA, seriesId: 'serie-aluguel' },
    // Quitação de compras já feitas. Fora.
    { date: '2026-07-14', amountCents: 340_000, kind: 'transfer', categoryId: null },
    // Hábito.
    exp('2026-07-05', 16_854),
    exp('2026-07-09', 2_748),
    exp('2026-07-20', 18_000),
  ];

  it('usa o mês aberto quando já passaram dias suficientes', () => {
    const f = forecastVariable({
      transactions: julho,
      months: ['2026-06', '2026-07'],
      today: '2026-07-28',
    });

    expect(f.monthsUsed).toEqual(['2026-07']);
    expect(f.partialMonthUsed).toBe('2026-07');
    // 37.602 observados em 28 de 31 dias → 41.631 no mês cheio.
    expect(f.totalMonthlyCents).toBe(Math.round(37_602 * (31 / 28)));
    expect(f.confidence).toBe('low');
  });

  it('mede o mês aberto por dias vividos, não pelo intervalo de lançamentos', () => {
    // Último lançamento no dia 20, mas o mês foi observado até 28: quem decide
    // a escala é o calendário, não o último gasto. Pelo span daria 16/31.
    const f = forecastVariable({
      transactions: julho,
      months: ['2026-07'],
      today: '2026-07-28',
    });
    expect(f.totalMonthlyCents).toBe(Math.round(37_602 * (31 / 28)));
  });

  it('mês aberto no começo não vira amostra', () => {
    // 3 dias escalados para mês cheio multiplicam por 10: um gasto atípico
    // governaria doze meses de projeção.
    const f = forecastVariable({
      transactions: [exp('2026-07-02', 50_000)],
      months: ['2026-07'],
      today: '2026-07-03',
    });

    expect(f.monthsUsed).toEqual([]);
    expect(f.partialMonthUsed).toBeNull();
    expect(f.totalMonthlyCents).toBe(0);
    expect(f.monthsSkipped).toEqual([
      { ym: '2026-07', reason: 'too_early', coverage: 3 / 31 },
    ]);
  });

  it('recorrência e fatura ficam fora — a régua é a do ritmo', () => {
    const f = forecastVariable({
      transactions: julho,
      months: ['2026-07'],
      today: '2026-07-28',
    });

    // Nem Moradia (série) nem a transferência aparecem por categoria.
    expect(f.byCategory.map((c) => c.categoryId)).toEqual([MERCADO]);
  });

  it('categoria essencial fica fora mesmo sem série', () => {
    // Aluguel importado do extrato não tem série; a marcação em Ajustes é o que
    // o tira do hábito.
    const f = forecastVariable({
      transactions: [
        exp('2026-07-06', 429_526, MORADIA),
        exp('2026-07-05', 16_854),
      ],
      months: ['2026-07'],
      today: '2026-07-28',
      essentialCategoryIds: new Set([MORADIA]),
    });

    expect(f.byCategory.map((c) => c.categoryId)).toEqual([MERCADO]);
    expect(f.totalMonthlyCents).toBe(Math.round(16_854 * (31 / 28)));
  });

  it('mês futuro nunca é amostra', () => {
    const f = forecastVariable({
      transactions: [exp('2026-09-10', 50_000)],
      months: ['2026-07', '2026-08', '2026-09'],
      today: '2026-07-28',
    });

    expect(f.monthsSkipped.map((s) => s.ym)).toEqual(['2026-07']);
    expect(f.monthsUsed).toEqual([]);
  });

  it('sem `today`, todo mês da lista é tratado como fechado', () => {
    // Compatibilidade: quem não informa hoje mantém o comportamento antigo.
    const f = forecastVariable({
      transactions: [exp('2026-06-01', 10_000), exp('2026-06-30', 10_000)],
      months: ['2026-06'],
    });
    expect(f.monthsUsed).toEqual(['2026-06']);
    expect(f.partialMonthUsed).toBeNull();
  });
});
