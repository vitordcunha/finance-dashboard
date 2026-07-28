import { describe, expect, it } from 'vitest';
import {
  buildTimelineEvents,
  dueDateInMonth,
  groupTimeline,
  occurrenceDelta,
  plannedCategoriesIn,
  runningBalance,
  timelineMonths,
} from '@/core/timeline';
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

const CAIXA = new Set(['c6']);

describe('dueDateInMonth', () => {
  it('31 vira o último dia do mês', () => {
    expect(dueDateInMonth('2026-02', 31)).toBe('2026-02-28');
    expect(dueDateInMonth('2026-04', 31)).toBe('2026-04-30');
  });

  it('rejeita dia fora da faixa', () => {
    expect(() => dueDateInMonth('2026-08', 0)).toThrow();
    expect(() => dueDateInMonth('2026-08', 32)).toThrow();
  });
});

describe('occurrenceDelta', () => {
  it('entrada soma, saída subtrai', () => {
    expect(occurrenceDelta({ kind: 'income', amountCents: 500, accountId: 'c6' })).toBe(500);
    expect(occurrenceDelta({ kind: 'expense', amountCents: 500, accountId: 'c6' })).toBe(-500);
  });

  it('pagamento de fatura sai do caixa uma vez só', () => {
    // Destino é o cartão, que não guarda caixa: sai 3.400 e não volta nada.
    const delta = occurrenceDelta(
      { kind: 'transfer', amountCents: 340_000, accountId: 'c6' },
      CAIXA,
    );
    expect(delta).toBe(-340_000);
  });

  it('compra no cartão não mexe no caixa', () => {
    // Vira dívida hoje; o caixa só se mexe quando a fatura for paga. Contar os
    // dois seria pagar a mesma compra duas vezes.
    expect(
      occurrenceDelta(
        { kind: 'expense', amountCents: 5_000, accountId: 'cartao' },
        CAIXA,
      ),
    ).toBe(0);
    expect(
      occurrenceDelta(
        { kind: 'transfer', amountCents: 5_000, accountId: 'cartao' },
        CAIXA,
      ),
    ).toBe(0);
  });

  it('compra no cartão guarda o valor nominal, mesmo com caixa parado', () => {
    // Sem isso a lista mostraria "Terapia −R$ 0,00": verdade sobre o caixa,
    // mentira sobre o gasto.
    const [event] = buildTimelineEvents({
      occurrences: [
        occ({
          id: 'terapia',
          date: '2026-08-10',
          amountCents: 23_000,
          accountId: 'cartao',
        }),
      ],
      months: ['2026-08'],
      today: '2026-07-27',
      cashAccountIds: CAIXA,
    });

    expect(event!.deltaCents).toBe(0);
    expect(event!.nominalCents).toBe(-23_000);
    expect(event!.cashless).toBe(true);
  });

  it('gasto em conta de caixa não é cashless', () => {
    const [event] = buildTimelineEvents({
      occurrences: [occ({ id: 'a', date: '2026-08-10', amountCents: 5_000 })],
      months: ['2026-08'],
      today: '2026-07-27',
      cashAccountIds: CAIXA,
    });

    expect(event!.deltaCents).toBe(-5_000);
    expect(event!.nominalCents).toBe(-5_000);
    expect(event!.cashless).toBeFalsy();
  });

  it('estorno no cartão também não entra no caixa', () => {
    expect(
      occurrenceDelta(
        { kind: 'income', amountCents: 5_000, accountId: 'cartao' },
        CAIXA,
      ),
    ).toBe(0);
  });

  it('sem lista de contas de caixa, tudo conta', () => {
    // A lista é opcional: sem ela não há como saber o que é cartão.
    expect(
      occurrenceDelta({ kind: 'expense', amountCents: 5_000, accountId: 'x' }),
    ).toBe(-5_000);
  });
});

describe('buildTimelineEvents', () => {
  it('realizado e previsto viram eventos do mesmo tipo de linha', () => {
    const events = buildTimelineEvents({
      occurrences: [
        occ({ id: 'a', date: '2026-07-06', amountCents: 429_526 }),
        occ({
          id: 'virtual:sal:2026-07',
          date: '2026-07-31',
          kind: 'income',
          amountCents: 900_000,
          status: 'planned',
          rowId: null,
          seriesId: 'sal',
          virtual: true,
        }),
      ],
      months: ['2026-07'],
      today: '2026-07-27',
    });

    expect(events.map((e) => e.kind)).toEqual(['actual', 'planned']);
    expect(events[1]!.deltaCents).toBe(900_000);
    expect(events[1]!.virtual).toBe(true);
    expect(events[1]!.transactionId).toBeNull();
  });

  it('previsto com dia passado vem marcado como atraso', () => {
    const events = buildTimelineEvents({
      occurrences: [occ({ id: 'x', date: '2026-07-06', status: 'planned' })],
      months: ['2026-07'],
      today: '2026-07-27',
    });

    expect(events[0]!.overdue).toBe(true);
    expect(events[0]!.deltaCents).toBe(-10_000);
  });

  it('estimado goteja um evento por dia, não um tranco no meio do mês', () => {
    const events = buildTimelineEvents({
      occurrences: [],
      months: ['2026-06', '2026-07', '2026-08'],
      today: '2026-07-16', // faltam 15 dias dos 31
      forecastMonthlyCents: 310_000,
    });

    // Junho já fechou: história não recebe estimativa.
    const julho = events.filter((e) => e.date.startsWith('2026-07'));
    const agosto = events.filter((e) => e.date.startsWith('2026-08'));

    // Mês corrente começa amanhã: o que já saiu está nos lançamentos reais.
    expect(julho[0]!.date).toBe('2026-07-17');
    expect(julho.at(-1)!.date).toBe('2026-07-31');
    expect(julho).toHaveLength(15);

    // Mês futuro inteiro, dia 1 ao 31.
    expect(agosto).toHaveLength(31);
    expect(agosto[0]!.date).toBe('2026-08-01');
    expect(agosto.at(-1)!.date).toBe('2026-08-31');

    // 310.000 / 31 dias.
    expect(agosto[0]!.deltaCents).toBe(-10_000);
    expect(julho[0]!.deltaCents).toBe(-10_000);
    expect(events.every((e) => e.estimated)).toBe(true);
  });

  it('o gotejamento move o fundo do poço para o dia certo', () => {
    // Aperto no dia 10, renda no fim: com o estimado num tranco no dia 16 o
    // menor saldo ignorava a estimativa e ficava no dia 10. Diluído, a queda
    // continua e o fundo real aparece depois.
    const events = buildTimelineEvents({
      occurrences: [
        occ({ id: 'aluguel', date: '2026-08-06', amountCents: 360_000 }),
        occ({
          id: 'salario',
          date: '2026-08-31',
          kind: 'income',
          amountCents: 950_000,
        }),
      ],
      months: ['2026-08'],
      today: '2026-07-28',
      forecastMonthlyCents: 310_000,
    });

    const saldos = runningBalance(events, 958_479);
    const fundo = saldos.reduce((a, b) => (b.balanceCents < a.balanceCents ? b : a));

    // Último dia antes do salário, não o dia do aluguel.
    expect(fundo.date).toBe('2026-08-30');
    expect(saldos.at(-1)!.balanceCents).toBe(958_479 - 360_000 + 950_000 - 310_000);
  });

  it('sem estimativa não inventa evento', () => {
    const events = buildTimelineEvents({
      occurrences: [],
      months: ['2026-07'],
      today: '2026-07-16',
      forecastMonthlyCents: 0,
    });
    expect(events).toHaveLength(0);
  });

  it('mesmo dia: entrada antes de saída', () => {
    const events = buildTimelineEvents({
      occurrences: [
        occ({ id: 'saida', date: '2026-07-10', amountCents: 5_000 }),
        occ({ id: 'entrada', date: '2026-07-10', kind: 'income', amountCents: 5_000 }),
      ],
      months: ['2026-07'],
      today: '2026-07-27',
    });

    expect(events.map((e) => e.id)).toEqual(['entrada', 'saida']);
  });
});

describe('plannedCategoriesIn', () => {
  it('junta só categoria de despesa prevista', () => {
    const cats = plannedCategoriesIn([
      occ({ id: 'a', date: '2026-08-06', status: 'planned', categoryId: 'moradia' }),
      occ({ id: 'b', date: '2026-08-31', status: 'planned', kind: 'income', categoryId: 'salario' }),
      occ({ id: 'c', date: '2026-08-02', status: 'actual', categoryId: 'mercado' }),
    ]);

    expect([...cats]).toEqual(['moradia']);
  });
});

describe('runningBalance', () => {
  it('acumula a partir da âncora', () => {
    const events = buildTimelineEvents({
      occurrences: [
        occ({ id: 'a', date: '2026-07-02', amountCents: 1_000 }),
        occ({ id: 'b', date: '2026-07-03', kind: 'income', amountCents: 5_000 }),
      ],
      months: ['2026-07'],
      today: '2026-07-27',
    });

    expect(runningBalance(events, 10_000).map((p) => p.balanceCents)).toEqual([
      9_000, 14_000,
    ]);
  });
});

describe('groupTimeline', () => {
  const events = buildTimelineEvents({
    occurrences: [
      occ({ id: 'a', date: '2026-07-10', amountCents: 30_000 }),
      occ({ id: 'b', date: '2026-08-05', kind: 'income', amountCents: 100_000 }),
      occ({ id: 'c', date: '2026-08-20', amountCents: 25_000, status: 'planned' }),
    ],
    months: ['2026-07', '2026-08'],
    today: '2026-07-27',
  });

  const months = groupTimeline({
    events,
    anchorCents: 50_000,
    months: ['2026-07', '2026-08'],
  });

  it('abertura de um mês é o fechamento do anterior', () => {
    expect(months[0]!.closingCents).toBe(20_000);
    expect(months[1]!.openingCents).toBe(20_000);
  });

  it('resultado é entrou menos saiu, não o saldo', () => {
    expect(months[1]!.inCents).toBe(100_000);
    expect(months[1]!.outCents).toBe(25_000);
    expect(months[1]!.netCents).toBe(75_000);
    expect(months[1]!.closingCents).toBe(95_000);
  });

  it('marca o mês que tem previsto', () => {
    expect(months[0]!.hasPlanned).toBe(false);
    expect(months[1]!.hasPlanned).toBe(true);
  });

  it('dia sem evento não vira linha', () => {
    expect(months[0]!.days.map((d) => d.date)).toEqual(['2026-07-10']);
  });
});

describe('timelineMonths', () => {
  it('monta a janela em torno do mês corrente', () => {
    expect(timelineMonths('2026-07', 2, 2)).toEqual([
      '2026-05',
      '2026-06',
      '2026-07',
      '2026-08',
      '2026-09',
    ]);
  });
});
