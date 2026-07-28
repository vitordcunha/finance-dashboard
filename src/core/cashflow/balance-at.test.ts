import { describe, expect, it } from 'vitest';
import {
  accountDelta,
  cashBalanceAt,
  type DatedCashTx,
} from '@/core/cashflow/balance-at';

const C6 = 'c6';
const CARTAO = 'cartao';
const CORRENTE = 'corrente';

describe('accountDelta', () => {
  it('entrada soma na conta', () => {
    expect(
      accountDelta(
        { date: '2026-07-01', kind: 'income', amountCents: 1000, accountId: C6 },
        C6,
      ),
    ).toBe(1000);
  });

  it('gasto subtrai da conta', () => {
    expect(
      accountDelta(
        { date: '2026-07-01', kind: 'expense', amountCents: 1000, accountId: C6 },
        C6,
      ),
    ).toBe(-1000);
  });

  it('transferência sai da origem e chega no destino', () => {
    const tx: DatedCashTx = {
      date: '2026-07-01',
      kind: 'transfer',
      amountCents: 5000,
      accountId: C6,
      transferAccountId: CORRENTE,
    };
    expect(accountDelta(tx, C6)).toBe(-5000);
    expect(accountDelta(tx, CORRENTE)).toBe(5000);
  });

  it('ignora conta não envolvida', () => {
    expect(
      accountDelta(
        { date: '2026-07-01', kind: 'expense', amountCents: 1000, accountId: C6 },
        CORRENTE,
      ),
    ).toBe(0);
  });
});

describe('cashBalanceAt', () => {
  const anchors = [
    { accountId: C6, balanceCents: 809_500, asOfDate: '2026-06-30' },
  ];

  it('sem âncora não inventa saldo', () => {
    const r = cashBalanceAt({
      anchors: [],
      transactions: [],
      date: '2026-07-31',
    });
    expect(r).toEqual({
      cents: 0,
      source: 'none',
      anchoredAccountIds: [],
      anchorAsOfDate: null,
    });
  });

  it('na data da âncora devolve a âncora', () => {
    const r = cashBalanceAt({
      anchors,
      transactions: [
        { date: '2026-07-05', kind: 'expense', amountCents: 100, accountId: C6 },
      ],
      date: '2026-06-30',
    });
    expect(r.cents).toBe(809_500);
    expect(r.source).toBe('anchor');
  });

  it('anda para frente somando movimentos', () => {
    const r = cashBalanceAt({
      anchors,
      transactions: [
        { date: '2026-07-05', kind: 'income', amountCents: 10_000, accountId: C6 },
        { date: '2026-07-10', kind: 'expense', amountCents: 4_000, accountId: C6 },
        // fora da janela
        { date: '2026-08-01', kind: 'expense', amountCents: 99_999, accountId: C6 },
      ],
      date: '2026-07-31',
    });
    expect(r.cents).toBe(809_500 + 10_000 - 4_000);
  });

  it('anda para trás subtraindo movimentos', () => {
    const r = cashBalanceAt({
      anchors,
      transactions: [
        { date: '2026-06-28', kind: 'income', amountCents: 900_000, accountId: C6 },
      ],
      date: '2026-06-27',
    });
    // Antes do salário entrar, tinha 809.500 − 900.000
    expect(r.cents).toBe(809_500 - 900_000);
  });

  it('exclui o dia da âncora e inclui o dia final', () => {
    const r = cashBalanceAt({
      anchors,
      transactions: [
        // mesmo dia da âncora: já está embutido no saldo informado
        { date: '2026-06-30', kind: 'expense', amountCents: 5_000, accountId: C6 },
        { date: '2026-07-01', kind: 'expense', amountCents: 3_000, accountId: C6 },
      ],
      date: '2026-07-01',
    });
    expect(r.cents).toBe(809_500 - 3_000);
  });

  it('pagamento de fatura sai do caixa e não entra no cartão', () => {
    const r = cashBalanceAt({
      anchors,
      transactions: [
        {
          date: '2026-07-14',
          kind: 'transfer',
          amountCents: 340_000,
          accountId: C6,
          transferAccountId: CARTAO,
        },
      ],
      date: '2026-07-31',
      cashAccountIds: new Set([C6]),
    });
    expect(r.cents).toBe(809_500 - 340_000);
  });

  it('transferência entre contas de caixa não muda o total', () => {
    const r = cashBalanceAt({
      anchors: [
        { accountId: C6, balanceCents: 100_000, asOfDate: '2026-06-30' },
        { accountId: CORRENTE, balanceCents: 50_000, asOfDate: '2026-06-30' },
      ],
      transactions: [
        {
          date: '2026-07-10',
          kind: 'transfer',
          amountCents: 30_000,
          accountId: C6,
          transferAccountId: CORRENTE,
        },
      ],
      date: '2026-07-31',
      cashAccountIds: new Set([C6, CORRENTE]),
    });
    expect(r.cents).toBe(150_000);
  });

  it('sobra do mês = fechamento − abertura, por construção', () => {
    const transactions: DatedCashTx[] = [
      { date: '2026-07-06', kind: 'expense', amountCents: 429_526, accountId: C6 },
      { date: '2026-07-12', kind: 'income', amountCents: 183_000, accountId: C6 },
    ];
    const abertura = cashBalanceAt({
      anchors,
      transactions,
      date: '2026-06-30',
    });
    const fechamento = cashBalanceAt({
      anchors,
      transactions,
      date: '2026-07-31',
    });
    expect(fechamento.cents - abertura.cents).toBe(183_000 - 429_526);
  });

  it('ignora conta sem âncora', () => {
    const r = cashBalanceAt({
      anchors,
      transactions: [
        { date: '2026-07-05', kind: 'expense', amountCents: 7_000, accountId: CORRENTE },
      ],
      date: '2026-07-31',
    });
    expect(r.cents).toBe(809_500);
    expect(r.anchoredAccountIds).toEqual([C6]);
  });
});
