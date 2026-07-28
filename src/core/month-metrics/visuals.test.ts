import { describe, expect, it } from 'vitest';
import {
  bandLowestAhead,
  burnup,
  householdSplit,
  dailySeries,
  invoiceRunway,
  monthMetrics,
  projectionBand,
  trajectory,
} from '@/core/month-metrics';
import { buildTimelineEvents, groupTimeline } from '@/core/timeline';
import type { Occurrence } from '@/core/series';
import type { TimelineMonth } from '@/core/timeline';

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

function mes(
  ym: string,
  occurrences: Occurrence[],
  opts: { today: string; anchorCents?: number; forecastMonthlyCents?: number } = {
    today: '2026-07-15',
  },
) {
  const events = buildTimelineEvents({
    occurrences,
    months: [ym],
    today: opts.today,
    cashAccountIds: new Set(['c6']),
    forecastMonthlyCents: opts.forecastMonthlyCents,
  });
  return groupTimeline({
    events,
    anchorCents: opts.anchorCents ?? 100_000,
    months: [ym],
  })[0]!;
}

describe('projectionBand', () => {
  const month = mes('2026-08', [], {
    today: '2026-07-28',
    anchorCents: 1_000_000,
    forecastMonthlyCents: 310_000,
  });
  const points = dailySeries({ month, today: '2026-07-28', minimumCents: 0 });

  it('abre com o tempo — errar por dia custa mais quanto mais longe', () => {
    const band = projectionBand({
      points,
      centralDailyCents: 10_000,
      lowDailyCents: 8_000,
      highDailyCents: 13_000,
    })!;

    // A faixa envolve a curva com estimado, não a real (só lançamentos).
    const center0 = points[0]!.balanceWithEstimateCents;
    const center30 = points[30]!.balanceWithEstimateCents;
    // Dia 1: um dia projetado. Dia 31: trinta e um.
    expect(band[0]!.highCents - center0).toBe(2_000);
    expect(center0 - band[0]!.lowCents).toBe(3_000);
    expect(band[30]!.highCents - center30).toBe(2_000 * 31);
    expect(center30 - band[30]!.lowCents).toBe(3_000 * 31);
  });

  it('gasto alto puxa o saldo para baixo', () => {
    const band = projectionBand({
      points,
      centralDailyCents: 10_000,
      lowDailyCents: 10_000,
      highDailyCents: 20_000,
    })!;
    const center30 = points[30]!.balanceWithEstimateCents;
    expect(band[30]!.highCents).toBe(center30);
    expect(band[30]!.lowCents).toBeLessThan(center30);
  });

  it('base de um mês não desenha faixa', () => {
    // Piso = teto = mediana: largura zero sugeriria precisão inexistente.
    expect(
      projectionBand({
        points,
        centralDailyCents: 10_000,
        lowDailyCents: 10_000,
        highDailyCents: 10_000,
      }),
    ).toBeNull();
  });

  it('o pior fundo da faixa é mais fundo que o da curva central', () => {
    const band = projectionBand({
      points,
      centralDailyCents: 10_000,
      lowDailyCents: 8_000,
      highDailyCents: 13_000,
    })!;
    const metrics = monthMetrics({
      month,
      points,
      today: '2026-07-28',
      minimumCents: 0,
    });
    const pior = bandLowestAhead(band, points, '2026-07-28')!;

    expect(pior).toBeLessThan(metrics.lowestAhead!.balanceCents);
  });
});

describe('burnup', () => {
  const month = mes('2026-07', [
    occ({ id: 'a', date: '2026-07-02', amountCents: 40_000 }),
    occ({ id: 'b', date: '2026-07-03', amountCents: 40_000 }),
    // Compromisso: não entra no burn-up, senão o aluguel cruzaria a reta todo mês.
    occ({
      id: 'aluguel',
      date: '2026-07-06',
      amountCents: 360_000,
      seriesId: 'serie-aluguel',
    }),
  ]);

  it('acha o dia em que o acumulado passou a reta', () => {
    // Orçamento 310.000/31 = 10.000/dia. 80.000 gastos até o dia 3.
    const b = burnup({ month, today: '2026-07-15', budgetDailyCents: 10_000 })!;

    expect(b.points[0]!.budgetCents).toBe(10_000);
    expect(b.points[1]!.spentCents).toBe(40_000);
    expect(b.crossedOn).toBe(2);
    expect(b.spentCents).toBe(80_000);
  });

  it('a curva de gasto para em hoje; a reta segue', () => {
    const b = burnup({ month, today: '2026-07-15', budgetDailyCents: 10_000 })!;
    const hoje = b.points[14]!;
    const fim = b.points[30]!;

    expect(hoje.spentCents).toBe(fim.spentCents);
    expect(fim.budgetCents).toBeGreaterThan(hoje.budgetCents);
    expect(fim.realized).toBe(false);
  });

  it('sem orçamento não há reta para cruzar', () => {
    expect(burnup({ month, today: '2026-07-15', budgetDailyCents: 0 })).toBeNull();
  });

  it('gap no dia de hoje é o excesso sobre a reta', () => {
    const b = burnup({ month, today: '2026-07-15', budgetDailyCents: 10_000 })!;
    // 80.000 gastos contra 150.000 de orçamento até o dia 15.
    expect(b.gapCents).toBe(80_000 - 150_000);
  });
});

describe('trajectory', () => {
  function m(
    ym: string,
    closingCents: number,
    closingWithEstimateCents = closingCents,
  ): TimelineMonth {
    return {
      ym,
      openingCents: 0,
      closingCents,
      closingWithEstimateCents,
      inCents: 0,
      outCents: 0,
      bookedOutCents: 0,
      estimatedOutCents: 0,
      netCents: 0,
      hasPlanned: false,
      days: [],
    };
  }

  it('acumula em vez de mostrar deltas', () => {
    const t = trajectory({
      months: [m('2026-06', 800_000), m('2026-07', 958_479), m('2026-08', 1_009_843)],
      currentYm: '2026-07',
    })!;

    expect(t.endCents).toBe(1_009_843);
    expect(t.deltaCents).toBe(209_843);
    expect(t.points.map((p) => p.projected)).toEqual([false, true, true]);
    expect(t.showsEstimate).toBe(false);
  });

  it('separa o fechamento com estimado do cadastrado', () => {
    const t = trajectory({
      months: [
        m('2026-06', 800_000),
        m('2026-07', 958_479, 900_000),
        m('2026-08', 1_400_000, 950_000),
      ],
      currentYm: '2026-07',
    })!;

    expect(t.showsEstimate).toBe(true);
    expect(t.endCents).toBe(1_400_000);
    expect(t.endWithEstimateCents).toBe(950_000);
    expect(t.deltaWithEstimateCents).toBe(150_000);
    expect(t.lowestWithEstimate!.ym).toBe('2026-07');
  });

  it('o pior fechamento só conta daqui pra frente', () => {
    // Junho fechou baixo, mas passado não se evita.
    const t = trajectory({
      months: [m('2026-06', 900), m('2026-07', 500_000), m('2026-08', 300_000)],
      currentYm: '2026-07',
    })!;
    expect(t.lowest!.ym).toBe('2026-08');
  });

  it('menos de dois meses não é trajetória', () => {
    expect(trajectory({ months: [m('2026-07', 1)], currentYm: '2026-07' })).toBeNull();
  });
});

describe('invoiceRunway', () => {
  function fatura(ym: string, cents: number): TimelineMonth {
    const month = mes(
      ym,
      cents > 0
        ? [
            occ({
              id: `fat-${ym}`,
              date: `${ym}-05`,
              kind: 'transfer',
              amountCents: cents,
              transferAccountId: 'cartao',
              description: 'Pagamento fatura',
              status: 'planned',
            }),
          ]
        : [],
      { today: '2026-07-28' },
    );
    return month;
  }

  it('mostra a queda e o mês em que zera', () => {
    const r = invoiceRunway({
      months: [
        fatura('2026-08', 200_000),
        fatura('2026-09', 100_000),
        fatura('2026-10', 0),
        fatura('2026-11', 0),
      ],
      currentYm: '2026-08',
    })!;

    expect(r.points.map((p) => p.cents)).toEqual([200_000, 100_000, 0, 0]);
    expect(r.clearFromYm).toBe('2026-10');
    expect(r.maxCents).toBe(200_000);
    // Alívio medido do próximo mês (100.000), não deste: a fatura de agosto pode
    // já ter sido paga e prometer R$ 2.000 de folga seria mentira.
    expect(r.reliefCents).toBe(100_000);
  });

  it('buraco no meio não é fim de pista', () => {
    // Um mês zerado com fatura voltando depois é dado faltando, não folga.
    const r = invoiceRunway({
      months: [
        fatura('2026-08', 200_000),
        fatura('2026-09', 0),
        fatura('2026-10', 100_000),
      ],
      currentYm: '2026-08',
    })!;
    expect(r.clearFromYm).toBeNull();
  });

  it('sem fatura nenhuma não há pista', () => {
    expect(
      invoiceRunway({ months: [fatura('2026-08', 0)], currentYm: '2026-08' }),
    ).toBeNull();
  });
});

describe('IncomeSplit', () => {
  it('comprometido é compromisso + fatura, não a saída inteira', () => {
    const month = mes(
      '2026-08',
      [
        occ({
          id: 'salario',
          date: '2026-08-31',
          kind: 'income',
          amountCents: 950_000,
        }),
        occ({
          id: 'aluguel',
          date: '2026-08-06',
          amountCents: 360_000,
          seriesId: 'serie-aluguel',
        }),
        occ({
          id: 'fatura',
          date: '2026-08-05',
          kind: 'transfer',
          amountCents: 200_000,
          transferAccountId: 'cartao',
        }),
        occ({ id: 'ifood', date: '2026-08-10', amountCents: 40_000 }),
      ],
      { today: '2026-07-28', anchorCents: 1_000_000 },
    );
    const points = dailySeries({ month, today: '2026-07-28', minimumCents: 0 });
    const m = monthMetrics({ month, points, today: '2026-07-28', minimumCents: 0 });

    expect(m.income).toEqual({
      incomeCents: 950_000,
      fixedCents: 360_000,
      settlementCents: 200_000,
      variableCents: 40_000,
      estimatedCents: 0,
      freeCents: 350_000,
      committedBps: Math.round((560_000 / 950_000) * 10_000),
    });
  });

  it('sem entrada não há o que repartir', () => {
    const month = mes('2026-08', [occ({ id: 'a', date: '2026-08-10' })], {
      today: '2026-07-28',
    });
    const points = dailySeries({ month, today: '2026-07-28', minimumCents: 0 });
    expect(
      monthMetrics({ month, points, today: '2026-07-28', minimumCents: 0 }).income,
    ).toBeNull();
  });
});

describe('householdSplit', () => {
  const EU = 'eu';
  const GREICY = 'greicy';
  const OWNERS = new Map([
    ['c6', EU],
    ['inter', GREICY],
  ]);
  const NAMES = new Map([
    [EU, 'Eu'],
    [GREICY, 'Greicy'],
  ]);

  function casa(occurrences: Occurrence[]) {
    const events = buildTimelineEvents({
      occurrences,
      months: ['2026-08'],
      today: '2026-07-28',
      cashAccountIds: new Set(['c6', 'inter']),
    });
    return groupTimeline({
      events,
      anchorCents: 1_000_000,
      months: ['2026-08'],
    })[0]!;
  }

  const RATEIO = 'Rateio casa · parcela 1 · Greicy';

  /** Agosto real: salários, aluguel dele, rateio dela em par espelhado. */
  const agosto = [
    occ({
      id: 'sal-eu',
      date: '2026-08-31',
      kind: 'income',
      amountCents: 950_000,
      description: 'salario',
      accountId: 'c6',
      seriesId: 's-sal-eu',
      status: 'planned',
    }),
    occ({
      id: 'sal-g1',
      date: '2026-08-31',
      kind: 'income',
      amountCents: 240_000,
      description: 'Salario greicy 1 quinzena',
      accountId: 'inter',
      seriesId: 's-g1',
      status: 'planned',
    }),
    occ({
      id: 'sal-g2',
      date: '2026-08-14',
      kind: 'income',
      amountCents: 150_000,
      description: 'Salario Greicy 2 quinzena',
      accountId: 'inter',
      seriesId: 's-g2',
      status: 'planned',
    }),
    occ({
      id: 'aluguel',
      date: '2026-08-06',
      amountCents: 360_000,
      description: 'Aluguel',
      accountId: 'c6',
      seriesId: 's-aluguel',
      status: 'planned',
    }),
    // Par espelhado do rateio: entra na conta dele, sai da dela — e os dois lados
    // têm descrição **diferente**, como na produção.
    occ({
      id: 'rat-in',
      date: '2026-08-05',
      kind: 'income',
      amountCents: 100_000,
      description: RATEIO,
      accountId: 'c6',
      seriesId: 's-rat',
      status: 'planned',
    }),
    occ({
      id: 'rat-out',
      date: '2026-08-05',
      amountCents: 100_000,
      description: 'Rateio casa · parcela 1',
      accountId: 'inter',
      seriesId: 's-rat-out',
      status: 'planned',
    }),
  ];

  it('rateio não conta como renda de quem recebe', () => {
    const split = householdSplit({
      month: casa(agosto),
      accountOwnerById: OWNERS,
      personNameById: NAMES,
    })!;

    const eu = split.people.find((p) => p.personId === EU)!;
    const greicy = split.people.find((p) => p.personId === GREICY)!;

    // Sem o par espelhado ele apareceria com 10.500 e o peso inverteria a regra.
    expect(eu.fixedIncomeCents).toBe(950_000);
    expect(greicy.fixedIncomeCents).toBe(390_000);
    // 9.500 : 3.900 = 70,9% / 29,1%
    expect(eu.weightBps).toBe(7_090);
    expect(greicy.weightBps).toBe(2_910);
  });

  it('cada um deve a sua fatia do compromisso da casa', () => {
    const split = householdSplit({
      month: casa(agosto),
      accountOwnerById: OWNERS,
      personNameById: NAMES,
    })!;

    // Aluguel 3.600 — o rateio é pagamento da divisão, não entra no pote.
    expect(split.houseCostCents).toBe(360_000);
    expect(split.hasContribution).toBe(true);

    const greicy = split.people.find((p) => p.personId === GREICY)!;
    const eu = split.people.find((p) => p.personId === EU)!;
    // Ela paga o rateio; ele paga o aluguel e recebe o rateio → ônus líquido.
    expect(greicy.scheduledOutCents).toBe(100_000);
    expect(eu.scheduledOutCents).toBe(360_000 - 100_000);
    expect(greicy.expectedShareCents).toBe(Math.round((360_000 * 2_910) / 10_000));
  });

  it('parcela avulsa do rateio também conta no agendado', () => {
    // Parcela 2 na produção é `recurrence: none` — sem seriesId. Antes sumia do
    // agendado e o card acusava falta mesmo com o valor certo nas linhas.
    const comP2 = [
      ...agosto,
      occ({
        id: 'rat2-in',
        date: '2026-08-14',
        kind: 'income',
        amountCents: 126_625,
        description: 'Rateio casa · parcela 2 · Greicy',
        accountId: 'c6',
        status: 'planned',
      }),
      occ({
        id: 'rat2-out',
        date: '2026-08-14',
        amountCents: 126_625,
        description: 'Rateio casa · parcela 2',
        accountId: 'inter',
        status: 'planned',
      }),
    ];
    const split = householdSplit({
      month: casa(comP2),
      accountOwnerById: OWNERS,
      personNameById: NAMES,
    })!;

    expect(split.houseCostCents).toBe(360_000);
    const greicy = split.people.find((p) => p.personId === GREICY)!;
    const eu = split.people.find((p) => p.personId === EU)!;
    expect(greicy.scheduledOutCents).toBe(100_000 + 126_625);
    expect(eu.scheduledOutCents).toBe(360_000 - 100_000 - 126_625);
  });

  it('mês sem rateio não acusa ninguém', () => {
    // Julho: compromisso sai todo da conta dele, ela não repassa nada.
    const semRateio = agosto.filter(
      (o) => o.id !== 'rat-in' && o.id !== 'rat-out' && o.id !== 'sal-g2',
    );
    const split = householdSplit({
      month: casa(semRateio),
      accountOwnerById: OWNERS,
      personNameById: NAMES,
    })!;

    expect(split.hasContribution).toBe(false);
    expect(split.worstDriftCents).toBe(0);
  });

  it('uma pessoa só não é divisão', () => {
    const soEu = agosto.filter((o) => o.accountId === 'c6');
    expect(
      householdSplit({
        month: casa(soEu),
        accountOwnerById: OWNERS,
        personNameById: NAMES,
      }),
    ).toBeNull();
  });

  it('entrada eventual não entra no peso', () => {
    // Bônus e reembolso oscilam; peso oscilante faria a divisão mudar todo mês.
    const comBonus = [
      ...agosto,
      occ({
        id: 'bonus',
        date: '2026-08-20',
        kind: 'income',
        amountCents: 500_000,
        description: 'Bônus',
        accountId: 'c6',
      }),
    ];
    const split = householdSplit({
      month: casa(comBonus),
      accountOwnerById: OWNERS,
      personNameById: NAMES,
    })!;
    expect(split.people.find((p) => p.personId === EU)!.fixedIncomeCents).toBe(
      950_000,
    );
  });
});
