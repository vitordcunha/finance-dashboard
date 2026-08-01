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
    estimatedOutCents = 0,
  ): TimelineMonth {
    return {
      ym,
      openingCents: 0,
      closingCents,
      closingWithEstimateCents: closingCents - estimatedOutCents,
      inCents: 0,
      outCents: 0,
      bookedOutCents: 0,
      estimatedOutCents,
      internalInCents: 0,
      internalOutCents: 0,
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
        m('2026-07', 958_479, 58_479),
        m('2026-08', 1_400_000, 50_000),
      ],
      currentYm: '2026-07',
    })!;

    expect(t.showsEstimate).toBe(true);
    expect(t.endCents).toBe(1_400_000);
    // Agosto desconta o estimado de julho **e** o de agosto: o hábito não
    // recomeça do zero todo mês.
    expect(t.endWithEstimateCents).toBe(1_400_000 - 58_479 - 50_000);
    expect(t.deltaWithEstimateCents).toBe(1_291_521 - 800_000);
    expect(t.lowestWithEstimate!.ym).toBe('2026-07');
  });

  it('o estimado acumula ao longo da janela', () => {
    // Doze meses de sobra com um mês de variável descontado era o que fazia a
    // projeção prometer R$ 105 mil: cada mês reiniciava do caixa real.
    const t = trajectory({
      months: [
        m('2026-07', 100_000, 10_000),
        m('2026-08', 200_000, 10_000),
        m('2026-09', 300_000, 10_000),
      ],
      currentYm: '2026-07',
    })!;

    expect(t.points.map((p) => p.closingWithEstimateCents)).toEqual([
      90_000,
      180_000,
      270_000,
    ]);
  });

  it('mês fechado não desconta estimado', () => {
    const t = trajectory({
      months: [m('2026-06', 800_000, 90_000), m('2026-07', 900_000, 10_000)],
      currentYm: '2026-07',
    })!;

    expect(t.points[0]!.closingWithEstimateCents).toBe(800_000);
    expect(t.points[1]!.closingWithEstimateCents).toBe(890_000);
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
  const PESSOAS = [EU, GREICY];
  const OWNERS = new Map([
    ['c6', EU],
    ['inter', GREICY],
  ]);
  const NAMES = new Map([
    [EU, 'Eu'],
    [GREICY, 'Greicy'],
  ]);
  const MORADIA = 'moradia';
  const TRANSPORTE = 'transporte';
  const CASA = new Set([MORADIA]);

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

  function dividir(
    occurrences: Occurrence[],
    over: {
      sharedCategoryIds?: Set<string>;
      mode?: 'income_share' | 'equal_50' | 'custom';
      customBps?: Record<string, number>;
    } = {},
  ) {
    return householdSplit({
      month: casa(occurrences),
      accountOwnerById: OWNERS,
      personNameById: NAMES,
      personIds: PESSOAS,
      sharedCategoryIds: over.sharedCategoryIds ?? CASA,
      mode: over.mode,
      customBps: over.customBps,
    });
  }

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
      categoryId: MORADIA,
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
      description: 'Rateio casa · parcela 1 · Greicy',
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

  it('o pote são as categorias marcadas, não o que é recorrente', () => {
    // Transporte dele é recorrente e não é conta da casa. Era exatamente esse tipo
    // de item que inflava o pote e fazia o card cobrar dela R$ 442,54 a mais.
    const comTransporte = [
      ...agosto,
      occ({
        id: 'transp',
        date: '2026-08-10',
        amountCents: 20_000,
        description: 'Transporte',
        categoryId: TRANSPORTE,
        accountId: 'c6',
        seriesId: 's-transp',
        status: 'planned',
      }),
    ];
    expect(dividir(comTransporte)!.houseCostCents).toBe(360_000);
  });

  it('pagamento de fatura nunca entra no pote', () => {
    // Ratear a fatura cobraria dela um pedaço das compras pessoais dele — e as
    // compras da casa dentro dela já contaram no dia em que aconteceram.
    const comFatura = [
      ...agosto,
      occ({
        id: 'fatura',
        date: '2026-08-13',
        kind: 'transfer',
        amountCents: 200_000,
        description: 'Pagamento fatura · Cartão principal',
        categoryId: MORADIA,
        accountId: 'c6',
        transferAccountId: 'sicredi',
        status: 'planned',
      }),
    ];
    expect(dividir(comFatura)!.houseCostCents).toBe(360_000);
  });

  it('sem categoria marcada não há pote', () => {
    const split = dividir(agosto, { sharedCategoryIds: new Set() })!;
    expect(split.needsSharedCategories).toBe(true);
    expect(split.houseCostCents).toBe(0);
  });

  it('rateio não conta como renda de quem recebe', () => {
    const split = dividir(agosto)!;
    const eu = split.people.find((p) => p.personId === EU)!;
    const greicy = split.people.find((p) => p.personId === GREICY)!;

    // Sem o par espelhado ele apareceria com 10.500 e o peso inverteria a regra.
    expect(eu.fixedIncomeCents).toBe(950_000);
    expect(greicy.fixedIncomeCents).toBe(390_000);
    // 9.500 : 3.900 = 70,9% / 29,1%
    expect(eu.weightBps).toBe(7_090);
    expect(greicy.weightBps).toBe(2_910);
  });

  it('o ônus é pagar direto + repassar − receber', () => {
    const split = dividir(agosto)!;
    const eu = split.people.find((p) => p.personId === EU)!;
    const greicy = split.people.find((p) => p.personId === GREICY)!;

    expect(eu.paidDirectCents).toBe(360_000);
    expect(eu.receivedCents).toBe(100_000);
    expect(eu.burdenCents).toBe(260_000);

    expect(greicy.paidDirectCents).toBe(0);
    expect(greicy.transferredCents).toBe(100_000);
    expect(greicy.burdenCents).toBe(100_000);
    expect(split.hasContribution).toBe(true);
  });

  it('as cotas somam o pote — sem centavo perdido', () => {
    const split = dividir(agosto)!;
    const soma = split.people.reduce((s, p) => s + p.expectedShareCents, 0);
    expect(soma).toBe(split.houseCostCents);
  });

  it('a parcela sugerida é a cota de quem não paga a conta', () => {
    const split = dividir(agosto)!;
    const eu = split.people.find((p) => p.personId === EU)!;
    const greicy = split.people.find((p) => p.personId === GREICY)!;

    // Quem paga as contas recebe, não transfere.
    expect(eu.suggestedTransferCents).toBe(0);
    expect(greicy.suggestedTransferCents).toBe(greicy.expectedShareCents);
    // E é diferente do que está agendado — é essa diferença que o card mostra.
    expect(greicy.suggestedTransferCents).not.toBe(greicy.transferredCents);
  });

  it('o modo escolhido governa o peso', () => {
    // A tela de Ajustes editava o modo e nenhuma tela lia: escolher 50/50 não
    // mudava nada em lugar nenhum.
    const meio = dividir(agosto, { mode: 'equal_50' })!;
    expect(meio.people.map((p) => p.weightBps)).toEqual([5_000, 5_000]);
    expect(meio.people[0]!.expectedShareCents).toBe(180_000);

    const custom = dividir(agosto, {
      mode: 'custom',
      customBps: { [EU]: 8_000, [GREICY]: 2_000 },
    })!;
    expect(
      custom.people.find((p) => p.personId === GREICY)!.expectedShareCents,
    ).toBe(72_000);
  });

  it('mês sem rateio não acusa ninguém', () => {
    // Julho: a conta da casa sai toda da conta dele, ela não repassa nada.
    const semRateio = agosto.filter(
      (o) => o.id !== 'rat-in' && o.id !== 'rat-out',
    );
    const split = dividir(semRateio)!;
    expect(split.hasContribution).toBe(false);
    expect(split.worstDriftCents).toBe(0);
  });

  it('uma pessoa só não é divisão', () => {
    expect(
      householdSplit({
        month: casa(agosto),
        accountOwnerById: OWNERS,
        personNameById: NAMES,
        personIds: [EU],
        sharedCategoryIds: CASA,
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
    const split = dividir(comBonus)!;
    expect(split.people.find((p) => p.personId === EU)!.fixedIncomeCents).toBe(
      950_000,
    );
  });

  it('sem renda recorrente, o proporcional cai em meio a meio', () => {
    const semSalario = agosto.filter((o) => o.kind !== 'income');
    const split = dividir(semSalario)!;
    expect(split.usedFallback).toBe(true);
    expect(split.people.map((p) => p.weightBps)).toEqual([5_000, 5_000]);
  });
});
