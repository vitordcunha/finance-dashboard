import { describe, expect, it } from 'vitest';
import {
  merchantKey,
  uncategorizedGroups,
  type GroupableTx,
} from '@/core/transactions/grouping';

function tx(over: Partial<GroupableTx> & { id: string; description: string }): GroupableTx {
  return {
    amountCents: 1_000,
    date: '2026-07-01',
    categoryId: null,
    kind: 'expense',
    ...over,
  };
}

describe('merchantKey', () => {
  it('junta a mesma padaria escrita de dois jeitos', () => {
    // As duas formas que o extrato do C6 produz para o mesmo lugar.
    expect(merchantKey('N.T. DELL OSBEL-MINIM  PORTO ALEGRE  BRA')).toBe(
      merchantKey('N T DELL OSBEL MINIMER PORTO ALEGRE  BRA'),
    );
  });

  it('descarta praça, país e ruído de operação', () => {
    expect(merchantKey('FARMACIA SAO JOAO      PORTO ALEGRE  BRA')).toBe(
      'farma sao',
    );
  });

  it('sufixo de praça variável não separa o mesmo comerciante', () => {
    expect(merchantKey('MINIMERCADO ZUFFO')).toBe(
      merchantKey('MINIMERCADO ZUFFO      PORTO ALEGRE  BRA'),
    );
  });

  it('ignora acento e caixa', () => {
    expect(merchantKey('Padaria Açúcar')).toBe(merchantKey('PADARIA ACUCAR'));
  });

  it('não confunde comerciantes diferentes', () => {
    expect(merchantKey('MINIMERCADO ZUFFO')).not.toBe(
      merchantKey('CARREFOUR POA 7'),
    );
  });
});

describe('uncategorizedGroups', () => {
  it('agrupa por comerciante e ordena por valor', () => {
    const groups = uncategorizedGroups([
      tx({ id: 'a', description: 'MINIMERCADO ZUFFO', amountCents: 5_000 }),
      tx({
        id: 'b',
        description: 'MINIMERCADO ZUFFO      PORTO ALEGRE  BRA',
        amountCents: 4_000,
      }),
      tx({ id: 'c', description: 'Aluguel', amountCents: 429_526 }),
    ]);

    // Aluguel primeiro: um lançamento grande muda mais o mês que dois pequenos.
    expect(groups.map((g) => g.count)).toEqual([1, 2]);
    expect(groups[0]!.totalCents).toBe(429_526);
    expect(groups[1]!.ids).toEqual(['a', 'b']);
    expect(groups[1]!.totalCents).toBe(9_000);
  });

  it('já categorizado fica fora', () => {
    expect(
      uncategorizedGroups([tx({ id: 'a', description: 'X', categoryId: 'mercado' })]),
    ).toEqual([]);
  });

  it('entrada e transferência ficam fora', () => {
    // Categoria de entrada é outra pergunta; transferência não tem categoria.
    expect(
      uncategorizedGroups([
        tx({ id: 'a', description: 'salario', kind: 'income' }),
        tx({ id: 'b', description: 'Pagamento fatura', kind: 'transfer' }),
      ]),
    ).toEqual([]);
  });

  it('o rótulo do grupo é a descrição que mais informa', () => {
    const [group] = uncategorizedGroups([
      tx({ id: 'a', description: 'N.T. DELL OSBEL-MINIM' }),
      tx({ id: 'b', description: 'N T DELL OSBEL MINIMER PORTO ALEGRE  BRA' }),
    ]);
    expect(group!.count).toBe(2);
    expect(group!.label).toBe('N T DELL OSBEL MINIMER PORTO ALEGRE  BRA');
    expect(group!.samples[0]).toBe(group!.label);
    expect(group!.samples).toContain('N.T. DELL OSBEL-MINIM');
  });
});
