import { describe, expect, it } from 'vitest';
import { endBeforeMonth, expandSeries, isOverdue, type SeriesRow } from '@/core/series';

function row(over: Partial<SeriesRow> & { id: string; date: string }): SeriesRow {
  return {
    kind: 'expense',
    amountCents: 100_000,
    description: 'Aluguel',
    categoryId: 'moradia',
    accountId: 'c6',
    transferAccountId: null,
    personId: 'eu',
    status: 'planned',
    recurrence: 'none',
    recurrenceEnd: null,
    seriesId: null,
    ...over,
  };
}

const MENSAL = row({
  id: 'aluguel',
  date: '2026-08-06',
  recurrence: 'monthly',
  amountCents: 360_000,
});

describe('expandSeries', () => {
  it('linha avulsa aparece só no mês dela', () => {
    const out = expandSeries({
      rows: [row({ id: 't1', date: '2026-08-10' })],
      fromYm: '2026-07',
      toYm: '2026-10',
    });

    expect(out).toHaveLength(1);
    expect(out[0]!.ym).toBe('2026-08');
    expect(out[0]!.virtual).toBe(false);
    expect(out[0]!.rowId).toBe('t1');
  });

  it('mensal gera um por mês, do mês de origem em diante', () => {
    const out = expandSeries({ rows: [MENSAL], fromYm: '2026-08', toYm: '2026-11' });

    expect(out.map((o) => o.date)).toEqual([
      '2026-08-06',
      '2026-09-06',
      '2026-10-06',
      '2026-11-06',
    ]);
    // Inclusive o mês de origem: a linha-modelo é definição, não ocorrência.
    expect(out.every((o) => o.virtual)).toBe(true);
    expect(out.every((o) => o.rowId === null)).toBe(true);
    expect(out.every((o) => o.seriesId === 'aluguel')).toBe(true);
  });

  it('ocorrência de série é sempre previsto até alguém confirmar', () => {
    const out = expandSeries({
      rows: [{ ...MENSAL, status: 'actual' }],
      fromYm: '2026-08',
      toYm: '2026-09',
    });
    expect(out.every((o) => o.status === 'planned')).toBe(true);
  });

  it('não retroage antes da linha-modelo', () => {
    const out = expandSeries({ rows: [MENSAL], fromYm: '2026-01', toYm: '2026-09' });
    expect(out.map((o) => o.ym)).toEqual(['2026-08', '2026-09']);
  });

  it('dia 31 vira o último dia em mês curto', () => {
    const salario = row({
      id: 'salario',
      date: '2026-08-31',
      kind: 'income',
      recurrence: 'monthly',
      amountCents: 900_000,
    });

    const out = expandSeries({ rows: [salario], fromYm: '2026-08', toYm: '2027-02' });
    expect(out.map((o) => o.date)).toEqual([
      '2026-08-31',
      '2026-09-30',
      '2026-10-31',
      '2026-11-30',
      '2026-12-31',
      '2027-01-31',
      '2027-02-28',
    ]);
  });

  it('recurrenceEnd encerra a série', () => {
    const out = expandSeries({
      rows: [{ ...MENSAL, recurrenceEnd: '2026-10-31' }],
      fromYm: '2026-08',
      toYm: '2027-01',
    });
    expect(out.map((o) => o.ym)).toEqual(['2026-08', '2026-09', '2026-10']);
  });

  it('exceção do mês substitui a ocorrência virtual', () => {
    const excecao = row({
      id: 'set-real',
      date: '2026-09-08',
      amountCents: 429_526,
      status: 'actual',
      seriesId: 'aluguel',
    });

    const out = expandSeries({
      rows: [MENSAL, excecao],
      fromYm: '2026-09',
      toYm: '2026-10',
    });

    const setembro = out.filter((o) => o.ym === '2026-09');
    expect(setembro).toHaveLength(1);
    expect(setembro[0]!.amountCents).toBe(429_526);
    expect(setembro[0]!.status).toBe('actual');
    expect(setembro[0]!.virtual).toBe(false);

    // Outubro segue virtual, com o valor do modelo.
    const outubro = out.filter((o) => o.ym === '2026-10');
    expect(outubro[0]!.amountCents).toBe(360_000);
    expect(outubro[0]!.virtual).toBe(true);
  });

  it('exceção em data diferente ainda ocupa o mês', () => {
    // Aluguel de setembro pago no dia 20 em vez do 6: não pode gerar as duas.
    const atrasado = row({
      id: 'set-real',
      date: '2026-09-20',
      status: 'actual',
      seriesId: 'aluguel',
    });

    const out = expandSeries({
      rows: [MENSAL, atrasado],
      fromYm: '2026-09',
      toYm: '2026-09',
    });

    expect(out).toHaveLength(1);
    expect(out[0]!.date).toBe('2026-09-20');
  });

  it('skipped apaga o mês sem deixar rastro', () => {
    const pulado = row({
      id: 'set-skip',
      date: '2026-09-06',
      amountCents: 0,
      status: 'skipped',
      seriesId: 'aluguel',
    });

    const out = expandSeries({
      rows: [MENSAL, pulado],
      fromYm: '2026-09',
      toYm: '2026-10',
    });

    expect(out.map((o) => o.ym)).toEqual(['2026-10']);
  });

  it('série encerrada e outra começando não geram mês duplicado', () => {
    // "Mudar daqui pra frente": a antiga para em setembro, a nova começa em outubro.
    const antiga = { ...MENSAL, recurrenceEnd: endBeforeMonth('2026-10') };
    const nova = row({
      id: 'aluguel2',
      date: '2026-10-06',
      recurrence: 'monthly',
      amountCents: 420_000,
    });

    const out = expandSeries({
      rows: [antiga, nova],
      fromYm: '2026-08',
      toYm: '2026-11',
    });

    expect(out.map((o) => o.ym)).toEqual([
      '2026-08',
      '2026-09',
      '2026-10',
      '2026-11',
    ]);
    expect(out.filter((o) => o.ym >= '2026-10').every((o) => o.amountCents === 420_000)).toBe(true);
  });

  it('realizado e previsto convivem ordenados por data', () => {
    const out = expandSeries({
      rows: [
        row({ id: 'a', date: '2026-08-20', status: 'actual', amountCents: 5_000 }),
        MENSAL,
      ],
      fromYm: '2026-08',
      toYm: '2026-08',
    });

    expect(out.map((o) => [o.date, o.status, o.virtual])).toEqual([
      ['2026-08-06', 'planned', true],
      ['2026-08-20', 'actual', false],
    ]);
  });
});

describe('isOverdue', () => {
  const [venceu] = expandSeries({
    rows: [row({ id: 'x', date: '2026-07-06' })],
    fromYm: '2026-07',
    toYm: '2026-07',
  });

  it('previsto com dia passado está atrasado', () => {
    expect(isOverdue(venceu!, '2026-07-27')).toBe(true);
  });

  it('previsto com dia futuro não está', () => {
    expect(isOverdue(venceu!, '2026-07-01')).toBe(false);
  });

  it('realizado nunca está atrasado', () => {
    expect(isOverdue({ ...venceu!, status: 'actual' }, '2026-07-27')).toBe(false);
  });
});

describe('endBeforeMonth', () => {
  it('devolve o último dia do mês anterior', () => {
    expect(endBeforeMonth('2026-10')).toBe('2026-09-30');
    expect(endBeforeMonth('2026-03')).toBe('2026-02-28');
  });
});
