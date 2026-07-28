import { describe, expect, it } from 'vitest';
import {
  compareToAverage,
  dailySeries,
  lowestAhead,
  lowestPoint,
  monthMetrics,
  sparklineOutflows,
  upcomingEvents,
} from '@/core/month-metrics';
import { buildTimelineEvents, groupTimeline } from '@/core/timeline';
import type { Occurrence } from '@/core/series';

function occ(over: Partial<Occurrence> & { id: string; date: string }): Occurrence {
  return {
    ym: over.date.slice(0, 7),
    kind: 'expense',
    amountCents: 10_000,
    description: 'Gasto',
    categoryId: null,
    accountId: 'c6',
    transferAccountId: null,
    personId: 'eu',
    status: 'actual',
    rowId: over.id,
    seriesId: null,
    virtual: false,
    ...over,
  };
}

/** Mês de julho/2026 com abertura de R$ 1.000. */
function julho(occurrences: Occurrence[], anchorCents = 100_000) {
  const events = buildTimelineEvents({
    occurrences,
    months: ['2026-07'],
    today: '2026-07-15',
  });
  return groupTimeline({ events, anchorCents, months: ['2026-07'] })[0]!;
}

describe('dailySeries', () => {
  it('preenche todo dia do mês carregando o saldo', () => {
    const month = julho([occ({ id: 'a', date: '2026-07-10', amountCents: 30_000 })]);
    const points = dailySeries({
      month,
      today: '2026-07-15',
      minimumCents: 0,
    });

    expect(points).toHaveLength(31);
    expect(points[0]!.date).toBe('2026-07-01');
    expect(points[0]!.balanceCents).toBe(100_000);
    // Do dia 10 em diante o saldo segue caído, mesmo sem movimento.
    expect(points[8]!.balanceCents).toBe(100_000);
    expect(points[9]!.balanceCents).toBe(70_000);
    expect(points[30]!.balanceCents).toBe(70_000);
  });

  it('marca hoje, projetado e abaixo do mínimo', () => {
    const month = julho([occ({ id: 'a', date: '2026-07-20', amountCents: 90_000 })]);
    const points = dailySeries({
      month,
      today: '2026-07-15',
      minimumCents: 50_000,
    });

    expect(points.find((p) => p.isToday)!.date).toBe('2026-07-15');
    expect(points[13]!.projected).toBe(false);
    expect(points[15]!.projected).toBe(true);
    // 100.000 − 90.000 = 10.000, abaixo do colchão de 50.000.
    expect(points[18]!.belowMinimum).toBe(false);
    expect(points[19]!.belowMinimum).toBe(true);
  });

  it('dia com movimento guarda entrou e saiu', () => {
    const month = julho([
      occ({ id: 'a', date: '2026-07-10', amountCents: 30_000 }),
      occ({ id: 'b', date: '2026-07-10', kind: 'income', amountCents: 5_000 }),
    ]);
    const points = dailySeries({ month, today: '2026-07-15', minimumCents: 0 });

    expect(points[9]!.inCents).toBe(5_000);
    expect(points[9]!.outCents).toBe(30_000);
    expect(points[9]!.hasEvents).toBe(true);
    expect(points[10]!.hasEvents).toBe(false);
  });
});

describe('lowestPoint / lowestAhead', () => {
  const month = julho([
    occ({ id: 'a', date: '2026-07-05', amountCents: 95_000 }),
    occ({ id: 'b', date: '2026-07-25', kind: 'income', amountCents: 200_000 }),
  ]);
  const points = dailySeries({ month, today: '2026-07-15', minimumCents: 0 });

  it('acha o fundo do poço', () => {
    expect(lowestPoint(points)!.date).toBe('2026-07-05');
    expect(lowestPoint(points)!.balanceCents).toBe(5_000);
  });

  it('de hoje em diante ignora o buraco que já passou', () => {
    const ahead = lowestAhead(points, '2026-07-15')!;
    expect(ahead.date).toBe('2026-07-15');
    expect(ahead.balanceCents).toBe(5_000);
  });
});

describe('monthMetrics', () => {
  const month = julho([
    occ({ id: 'passado', date: '2026-07-05', amountCents: 20_000 }),
    occ({
      id: 'aluguel',
      date: '2026-07-20',
      amountCents: 60_000,
      status: 'planned',
      rowId: null,
      seriesId: 'serie-aluguel',
      virtual: true,
      description: 'Aluguel',
    }),
    occ({
      id: 'salario',
      date: '2026-07-31',
      kind: 'income',
      amountCents: 150_000,
      status: 'planned',
      description: 'Salário',
    }),
  ]);
  const points = dailySeries({ month, today: '2026-07-15', minimumCents: 10_000 });
  const m = monthMetrics({
    month,
    points,
    today: '2026-07-15',
    minimumCents: 10_000,
  });

  it('livre para gastar é o menor saldo à frente menos o colchão', () => {
    // 100.000 − 20.000 = 80.000; cai para 20.000 no dia 20 e só sobe no 31.
    expect(m.lowestAhead!.balanceCents).toBe(20_000);
    expect(m.freeToSpendCents).toBe(10_000);
  });

  it('divide o que sobra pelos dias que faltam', () => {
    expect(m.daysLeft).toBe(17); // 15 a 31
    expect(m.safeDailyCents).toBe(Math.floor(10_000 / 17));
  });

  it('separa o que ainda sai do que ainda entra', () => {
    expect(m.committedAheadCents).toBe(60_000);
    expect(m.estimatedAheadCents).toBe(0);
    expect(m.incomingAheadCents).toBe(150_000);
  });

  it('separa fixo (série) de variável e estimado', () => {
    expect(m.fixedOutCents).toBe(60_000);
    expect(m.variableOutCents).toBe(20_000);
    expect(m.estimatedOutCents).toBe(0);
  });

  it('estimado não entra no comprometido nem na maior saída', () => {
    const comEstimado = groupTimeline({
      events: buildTimelineEvents({
        occurrences: [
          occ({
            id: 'aluguel',
            date: '2026-08-06',
            amountCents: 360_000,
            status: 'planned',
            rowId: null,
            seriesId: 'serie-aluguel',
            virtual: true,
            description: 'Aluguel',
          }),
        ],
        months: ['2026-08'],
        today: '2026-07-27',
        forecastMonthlyCents: 440_000,
      }),
      anchorCents: 800_000,
      months: ['2026-08'],
    })[0]!;
    const points = dailySeries({
      month: comEstimado,
      today: '2026-07-27',
      minimumCents: 0,
    });
    const mm = monthMetrics({
      month: comEstimado,
      points,
      today: '2026-07-27',
      minimumCents: 0,
    });

    expect(mm.committedAheadCents).toBe(360_000);
    expect(mm.estimatedAheadCents).toBe(440_000);
    expect(mm.estimatedOutCents).toBe(440_000);
    expect(mm.biggestExpense).toEqual({
      label: 'Aluguel',
      cents: 360_000,
      date: '2026-08-06',
    });
    expect(comEstimado.bookedOutCents).toBe(360_000);
    expect(comEstimado.estimatedOutCents).toBe(440_000);
    expect(comEstimado.outCents).toBe(800_000);
  });

  it('acha o maior gasto e a próxima entrada', () => {
    expect(m.biggestExpense).toEqual({
      label: 'Aluguel',
      cents: 60_000,
      date: '2026-07-20',
    });
    expect(m.nextIncome!.date).toBe('2026-07-31');
  });

  it('média diária usa só os dias já vividos', () => {
    // R$ 200 de saída realizada em 15 dias.
    expect(m.dailyBurnCents).toBe(Math.round(20_000 / 15));
    expect(m.elapsedDays).toBe(15);
  });

  it('estimado por dia dilui o restante nos dias à frente', () => {
    // Agosto futuro: 440.000 / 31 dias.
    const comEstimado = groupTimeline({
      events: buildTimelineEvents({
        occurrences: [],
        months: ['2026-08'],
        today: '2026-07-27',
        forecastMonthlyCents: 440_000,
      }),
      anchorCents: 800_000,
      months: ['2026-08'],
    })[0]!;
    const pts = dailySeries({
      month: comEstimado,
      today: '2026-07-27',
      minimumCents: 0,
    });
    const mm = monthMetrics({
      month: comEstimado,
      points: pts,
      today: '2026-07-27',
      minimumCents: 0,
    });
    expect(mm.estimatedAheadCents).toBe(440_000);
    expect(mm.daysAhead).toBe(31);
    expect(mm.estimatedDailyCents).toBe(Math.round(440_000 / 31));
  });

  it('conta os dias abaixo do colchão e quando começa', () => {
    // Do dia 20 ao 30 o saldo é 20.000 — acima de 10.000. Nenhum dia fura.
    expect(m.daysBelowMinimum).toBe(0);
    expect(m.firstBelowMinimum).toBeNull();
  });

  it('sinaliza quando o colchão é furado', () => {
    const alto = dailySeries({ month, today: '2026-07-15', minimumCents: 50_000 });
    const furado = monthMetrics({
      month,
      points: alto,
      today: '2026-07-15',
      minimumCents: 50_000,
    });
    expect(furado.firstBelowMinimum).toBe('2026-07-20');
    expect(furado.firstBelowAhead).toBe('2026-07-20');
    expect(furado.daysUntilBelow).toBe(5);
    expect(furado.daysBelowMinimum).toBe(11); // 20 a 30
    expect(furado.freeToSpendCents).toBe(-30_000);
    expect(furado.safeDailyCents).toBeNull(); // negativo não vira mesada
  });

  it('firstBelowAhead ignora furo que já passou', () => {
    const monthPastHole = julho([
      occ({ id: 'cedo', date: '2026-07-05', amountCents: 95_000 }),
      occ({
        id: 'tarde',
        date: '2026-07-25',
        amountCents: 10_000,
        status: 'planned',
        rowId: null,
        virtual: true,
      }),
    ]);
    // Após o dia 5 o saldo está em 5.000; colchão 10.000. Hoje = 15.
    const pts = dailySeries({
      month: monthPastHole,
      today: '2026-07-15',
      minimumCents: 10_000,
    });
    const mm = monthMetrics({
      month: monthPastHole,
      points: pts,
      today: '2026-07-15',
      minimumCents: 10_000,
    });
    expect(mm.firstBelowMinimum).toBe('2026-07-05');
    // De hoje em diante o saldo já está abaixo — o furo "à frente" é hoje.
    expect(mm.firstBelowAhead).toBe('2026-07-15');
    expect(mm.daysUntilBelow).toBe(0);
  });

  it('headroomBurnDays divide a folga pelo ritmo cheio', () => {
    // Livre = só compromissos. Ritmo come a folga inteira (estimado não está
    // embutido no herói).
    const events = buildTimelineEvents({
      occurrences: [
        // 15 dias × ~2.000/dia variável = 30.000 → burn 2.000
        ...Array.from({ length: 10 }, (_, i) =>
          occ({
            id: `v${i}`,
            date: `2026-07-${String(i + 1).padStart(2, '0')}`,
            amountCents: 3_000,
          }),
        ),
      ],
      months: ['2026-07'],
      today: '2026-07-15',
      forecastMonthlyCents: 31_000,
    });
    const m = groupTimeline({
      events,
      anchorCents: 200_000,
      months: ['2026-07'],
    })[0]!;
    const pts = dailySeries({ month: m, today: '2026-07-15', minimumCents: 0 });
    const mm = monthMetrics({
      month: m,
      points: pts,
      today: '2026-07-15',
      minimumCents: 0,
    });

    expect(mm.dailyBurnCents).toBeGreaterThan(0);
    expect(mm.estimatedDailyCents).toBeGreaterThan(0);
    expect(mm.freeToSpendCents).not.toBeNull();
    expect(mm.freeToSpendWithEstimateCents).not.toBeNull();
    // Com estimado o poço é mais fundo — o alerta é pior que o herói.
    expect(mm.freeToSpendWithEstimateCents!).toBeLessThan(mm.freeToSpendCents!);
    if (mm.freeToSpendCents != null && mm.freeToSpendCents > 0) {
      expect(mm.headroomBurnDays).toBe(
        Math.floor(mm.freeToSpendCents / mm.dailyBurnCents),
      );
    }
  });

  it('livre para gastar ignora o estimado — só compromissos', () => {
    const comEstimado = groupTimeline({
      events: buildTimelineEvents({
        occurrences: [
          occ({
            id: 'aluguel',
            date: '2026-08-06',
            amountCents: 360_000,
            status: 'planned',
            rowId: null,
            seriesId: 'serie-aluguel',
            virtual: true,
            description: 'Aluguel',
          }),
          occ({
            id: 'salario',
            date: '2026-08-31',
            kind: 'income',
            amountCents: 950_000,
            status: 'planned',
            rowId: null,
            seriesId: 'serie-salario',
            virtual: true,
            description: 'Salário',
          }),
        ],
        months: ['2026-08'],
        today: '2026-07-27',
        forecastMonthlyCents: 440_000,
      }),
      anchorCents: 800_000,
      months: ['2026-08'],
    })[0]!;
    const pts = dailySeries({
      month: comEstimado,
      today: '2026-07-27',
      minimumCents: 0,
    });
    const mm = monthMetrics({
      month: comEstimado,
      points: pts,
      today: '2026-07-27',
      minimumCents: 0,
    });

    // Sem estimado: fundo no dia do aluguel = 800k − 360k = 440k.
    expect(mm.lowestAhead!.balanceCents).toBe(440_000);
    expect(mm.freeToSpendCents).toBe(440_000);
    // Com estimado: goteja 440k no mês → fundo bem mais baixo.
    expect(mm.freeToSpendWithEstimateCents).toBeLessThan(440_000);
    expect(comEstimado.closingCents).toBe(800_000 - 360_000 + 950_000);
    expect(comEstimado.closingWithEstimateCents).toBe(
      comEstimado.closingCents - 440_000,
    );
    // Renda comprometida: estimado não come a fatia "livre".
    expect(mm.income!.variableCents).toBe(0);
    expect(mm.income!.estimatedCents).toBe(440_000);
    expect(mm.income!.freeCents).toBe(950_000 - 360_000);
  });

  it('sem excesso sobre o estimado, headroom é null', () => {
    // Só previsto + estimado; sem ritmo variável realizado.
    const events = buildTimelineEvents({
      occurrences: [],
      months: ['2026-08'],
      today: '2026-07-27',
      forecastMonthlyCents: 310_000,
    });
    const m = groupTimeline({
      events,
      anchorCents: 800_000,
      months: ['2026-08'],
    })[0]!;
    const pts = dailySeries({ month: m, today: '2026-07-27', minimumCents: 0 });
    const mm = monthMetrics({
      month: m,
      points: pts,
      today: '2026-07-27',
      minimumCents: 0,
    });
    expect(mm.dailyBurnCents).toBe(0);
    expect(mm.headroomBurnDays).toBeNull();
    expect(mm.paceGapCents).toBeNull();
  });

  it('conta atrasado', () => {
    const vencido = julho([
      occ({
        id: 'v',
        date: '2026-07-02',
        amountCents: 40_000,
        status: 'planned',
        rowId: null,
        virtual: true,
      }),
    ]);
    const p = dailySeries({ month: vencido, today: '2026-07-15', minimumCents: 0 });
    const mm = monthMetrics({
      month: vencido,
      points: p,
      today: '2026-07-15',
      minimumCents: 0,
    });
    expect(mm.overdueCount).toBe(1);
    expect(mm.overdueCents).toBe(40_000);
  });

  it('mês fechado não tem "livre para gastar"', () => {
    const mm = monthMetrics({
      month,
      points,
      today: '2026-09-01',
      minimumCents: 0,
    });
    expect(mm.freeToSpendCents).toBeNull();
    expect(mm.daysLeft).toBe(0);
  });
});

describe('compareToAverage', () => {
  const a = julho([occ({ id: 'a', date: '2026-07-10', amountCents: 30_000 })]);

  /** Mês com movimento do dia 2 ao 30 — cobertura suficiente. */
  function coberto(ym: string, outCents: number) {
    const days = [2, 15, 30].map((d) => ({
      date: `${ym}-${String(d).padStart(2, '0')}`,
      events: [],
      inCents: 0,
      outCents: 0,
      balanceCents: 0,
      balanceWithEstimateCents: 0,
      hasPlanned: false,
    }));
    return {
      ...a,
      ym,
      outCents,
      bookedOutCents: outCents,
      estimatedOutCents: 0,
      days,
    };
  }

  it('sem mês fechado não compara', () => {
    expect(compareToAverage(a, [])).toBeNull();
  });

  it('compara a saída com a média dos outros meses', () => {
    const out = compareToAverage(a, [
      coberto('2026-06', 20_000),
      coberto('2026-05', 40_000),
    ])!;

    expect(out.averageOutCents).toBe(30_000);
    expect(out.deltaBps).toBe(0);
  });

  it('mede o excesso em basis points', () => {
    expect(compareToAverage(a, [coberto('2026-06', 20_000)])!.deltaBps).toBe(
      5_000, // +50%
    );
  });

  it('mês mal coberto não vira base de comparação', () => {
    // Junho só com extrato dos últimos dias: R$ 1.064 de saída faria julho
    // parecer +1027%.
    const junhoParcial = {
      ...a,
      ym: '2026-06',
      outCents: 106_438,
      bookedOutCents: 106_438,
      estimatedOutCents: 0,
      days: [26, 28, 30].map((d) => ({
        date: `2026-06-${d}`,
        events: [],
        inCents: 0,
        outCents: 0,
        balanceCents: 0,
        balanceWithEstimateCents: 0,
        hasPlanned: false,
      })),
    };

    expect(compareToAverage(a, [junhoParcial])).toBeNull();
  });
});

describe('ritmo variável', () => {
  const MORADIA = 'moradia';
  const ESSENCIAIS = new Set([MORADIA]);

  /** A forma real de julho/2026: aluguel, fatura e o miúdo do dia a dia. */
  function julhoReal() {
    const month = julho(
      [
        occ({
          id: 'aluguel',
          date: '2026-07-06',
          amountCents: 429_526,
          description: 'Aluguel',
          categoryId: MORADIA,
        }),
        occ({
          id: 'fatura',
          date: '2026-07-14',
          kind: 'transfer',
          amountCents: 340_000,
          description: 'Pagamento fatura',
          transferAccountId: 'cartao',
        }),
        occ({ id: 'mercado', date: '2026-07-05', amountCents: 16_854 }),
        occ({ id: 'farmacia', date: '2026-07-09', amountCents: 2_748 }),
      ],
      1_000_000,
    );
    const points = dailySeries({ month, today: '2026-07-15', minimumCents: 0 });
    return { month, points };
  }

  it('não dilui aluguel nem fatura no ritmo diário', () => {
    const { month, points } = julhoReal();
    const m = monthMetrics({
      month,
      points,
      today: '2026-07-15',
      minimumCents: 0,
      essentialCategoryIds: ESSENCIAIS,
    });

    // Sem o corte: (429.526 + 340.000 + 19.602) / 15 = R$ 526/dia de "hábito".
    expect(m.realizedVariableCents).toBe(19_602);
    expect(m.realizedCommittedCents).toBe(769_526);
    expect(m.dailyBurnCents).toBe(Math.round(19_602 / 15));
  });

  it('compromisso, fatura e variável são fatias distintas', () => {
    const { month, points } = julhoReal();
    const m = monthMetrics({
      month,
      points,
      today: '2026-07-15',
      minimumCents: 0,
      essentialCategoryIds: ESSENCIAIS,
    });

    expect(m.fixedOutCents).toBe(429_526);
    expect(m.settlementOutCents).toBe(340_000);
    expect(m.variableOutCents).toBe(19_602);
    // A composição fecha com a saída lançada do mês.
    expect(
      m.fixedOutCents + m.settlementOutCents + m.variableOutCents,
    ).toBe(month.bookedOutCents);
  });

  it('sem a lista de essenciais, só recorrência sai do ritmo', () => {
    // O aluguel importado do extrato não tem série: sem a lista ele volta a ser
    // tratado como gasto do dia, e o ritmo infla de novo.
    const { month, points } = julhoReal();
    const m = monthMetrics({
      month,
      points,
      today: '2026-07-15',
      minimumCents: 0,
    });

    expect(m.realizedVariableCents).toBe(429_526 + 19_602);
    expect(m.settlementOutCents).toBe(340_000);
  });

  it('recorrência sai do ritmo mesmo sem categoria', () => {
    const month = julho([
      occ({
        id: 'luz',
        date: '2026-07-10',
        amountCents: 30_000,
        seriesId: 'serie-luz',
      }),
      occ({ id: 'ifood', date: '2026-07-11', amountCents: 7_950 }),
    ]);
    const points = dailySeries({ month, today: '2026-07-15', minimumCents: 0 });
    const m = monthMetrics({
      month,
      points,
      today: '2026-07-15',
      minimumCents: 0,
    });

    expect(m.fixedOutCents).toBe(30_000);
    expect(m.realizedVariableCents).toBe(7_950);
  });

  it('compra no cartão pesa no dia da compra, não na fatura', () => {
    // O caixa não se move (cashless), mas a decisão de gastar foi naquele dia.
    // A fatura é `settlement`, então a mesma compra não conta duas vezes.
    const events = buildTimelineEvents({
      occurrences: [
        occ({
          id: 'terapia',
          date: '2026-07-08',
          amountCents: 23_000,
          accountId: 'cartao',
        }),
      ],
      months: ['2026-07'],
      today: '2026-07-15',
      cashAccountIds: new Set(['c6']),
    });
    const month = groupTimeline({
      events,
      anchorCents: 100_000,
      months: ['2026-07'],
    })[0]!;
    const points = dailySeries({ month, today: '2026-07-15', minimumCents: 0 });
    const m = monthMetrics({
      month,
      points,
      today: '2026-07-15',
      minimumCents: 0,
    });

    expect(month.bookedOutCents).toBe(0); // caixa parado
    expect(m.realizedVariableCents).toBe(23_000); // hábito registrado
  });
});

describe('upcomingEvents', () => {
  it('lista só o horizonte a partir de hoje', () => {
    const month = julho([
      occ({ id: 'passado', date: '2026-07-10', amountCents: 5_000 }),
      occ({
        id: 'logo',
        date: '2026-07-18',
        amountCents: 40_000,
        status: 'planned',
        rowId: null,
        virtual: true,
        description: 'Luz',
      }),
      occ({
        id: 'longe',
        date: '2026-07-30',
        amountCents: 60_000,
        status: 'planned',
        rowId: null,
        virtual: true,
        description: 'Aluguel',
      }),
    ]);
    const items = upcomingEvents({
      month,
      today: '2026-07-15',
      horizonDays: 7,
    });
    expect(items.map((i) => i.eventId)).toEqual(['logo']);
    expect(items[0]!.cents).toBe(40_000);
  });
});

describe('sparklineOutflows', () => {
  it('ignora mês mal coberto e devolve os últimos N', () => {
    const base = julho([occ({ id: 'a', date: '2026-07-10', amountCents: 10_000 })]);
    function coberto(ym: string, out: number) {
      return {
        ...base,
        ym,
        bookedOutCents: out,
        outCents: out,
        estimatedOutCents: 0,
        days: [2, 15, 28].map((d) => ({
          date: `${ym}-${String(d).padStart(2, '0')}`,
          events: [],
          inCents: 0,
          outCents: 0,
          balanceCents: 0,
          balanceWithEstimateCents: 0,
          hasPlanned: false,
        })),
      };
    }
    const points = sparklineOutflows({
      months: [
        coberto('2026-04', 10_000),
        coberto('2026-05', 20_000),
        coberto('2026-06', 30_000),
        base,
      ],
      beforeYm: '2026-07',
      limit: 2,
    });
    expect(points).toEqual([
      { ym: '2026-05', bookedOutCents: 20_000 },
      { ym: '2026-06', bookedOutCents: 30_000 },
    ]);
  });
});
