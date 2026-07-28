import { describe, expect, it } from 'vitest';
import {
  assertTransferShape,
  mergedTransferShape,
  checkTransferShape,
  isInternalTransfer,
  resolveImportedKind,
} from '@/core/transactions/transfer';

describe('isInternalTransfer', () => {
  it('exige conta de destino', () => {
    expect(
      isInternalTransfer({
        kind: 'transfer',
        accountId: 'a',
        transferAccountId: null,
      }),
    ).toBe(false);
  });

  it('reconhece transferência entre contas diferentes', () => {
    expect(
      isInternalTransfer({
        kind: 'transfer',
        accountId: 'a',
        transferAccountId: 'b',
      }),
    ).toBe(true);
  });

  it('não é transferência para a mesma conta', () => {
    expect(
      isInternalTransfer({
        kind: 'transfer',
        accountId: 'a',
        transferAccountId: 'a',
      }),
    ).toBe(false);
  });

  it('gasto nunca é transferência', () => {
    expect(
      isInternalTransfer({
        kind: 'expense',
        accountId: 'a',
        transferAccountId: 'b',
      }),
    ).toBe(false);
  });
});

describe('checkTransferShape', () => {
  it('aponta destino faltando', () => {
    expect(
      checkTransferShape({
        kind: 'transfer',
        accountId: 'a',
        transferAccountId: null,
      }),
    ).toBe('missing_destination');
  });

  it('aponta origem igual ao destino', () => {
    expect(
      checkTransferShape({
        kind: 'transfer',
        accountId: 'a',
        transferAccountId: 'a',
      }),
    ).toBe('same_account');
  });

  it('ignora income e expense', () => {
    expect(
      checkTransferShape({
        kind: 'expense',
        accountId: 'a',
        transferAccountId: null,
      }),
    ).toBeNull();
  });
});

describe('assertTransferShape', () => {
  it('lança sem destino', () => {
    expect(() =>
      assertTransferShape({
        kind: 'transfer',
        accountId: 'a',
        transferAccountId: null,
      }),
    ).toThrow(/conta de destino/i);
  });

  it('passa com destino válido', () => {
    expect(() =>
      assertTransferShape({
        kind: 'transfer',
        accountId: 'a',
        transferAccountId: 'b',
      }),
    ).not.toThrow();
  });
});

describe('mergedTransferShape', () => {
  /** O gasto do print: importado do extrato, sem destino nenhum. */
  const gasto = {
    kind: 'expense' as const,
    accountId: 'c6',
    transferAccountId: null,
  };

  it('editar um gasto não o transforma em transferência', () => {
    // O formulário manda date e accountId em toda edição. Com `kind: 'transfer'`
    // fixo na borda de persistência, todo gasto sem destino era rejeitado:
    // "Transferência precisa de conta de destino".
    const doFormulario = {
      date: '2026-07-01',
      description: 'N T DELL OSBEL MINIMER',
      amountCents: 3_400,
      accountId: 'c6',
      categoryId: 'mercado',
      status: 'actual' as const,
    };
    const merged = mergedTransferShape(doFormulario, gasto);

    expect(merged.kind).toBe('expense');
    expect(() => assertTransferShape(merged)).not.toThrow();
  });

  it('patch sem kind preserva o kind da linha', () => {
    const transferencia = {
      kind: 'transfer' as const,
      accountId: 'c6',
      transferAccountId: 'cartao',
    };
    expect(mergedTransferShape({ accountId: 'inter' }, transferencia)).toEqual({
      kind: 'transfer',
      accountId: 'inter',
      transferAccountId: 'cartao',
    });
  });

  it('virar transferência sem destino continua barrado', () => {
    const merged = mergedTransferShape({ kind: 'transfer' }, gasto);
    expect(() => assertTransferShape(merged)).toThrow(/conta de destino/i);
  });

  it('null limpa, undefined preserva', () => {
    const transferencia = {
      kind: 'transfer' as const,
      accountId: 'c6',
      transferAccountId: 'cartao',
    };
    // Virar gasto limpa o destino de propósito — e passa, porque não é transfer.
    const paraGasto = mergedTransferShape(
      { kind: 'expense', transferAccountId: null },
      transferencia,
    );
    expect(paraGasto.transferAccountId).toBeNull();
    expect(() => assertTransferShape(paraGasto)).not.toThrow();

    expect(
      mergedTransferShape({ kind: 'transfer' }, transferencia).transferAccountId,
    ).toBe('cartao');
  });
});

describe('resolveImportedKind', () => {
  it('sem destino mantém o sinal do extrato', () => {
    expect(resolveImportedKind('expense')).toBe('expense');
    expect(resolveImportedKind('expense', null)).toBe('expense');
    expect(resolveImportedKind('income', null)).toBe('income');
  });

  it('com destino vira transferência', () => {
    expect(resolveImportedKind('expense', 'acc-b')).toBe('transfer');
  });

  it('PIX enviado sem destino continua gasto', () => {
    // O bug que escondia R$ 9.090 em julho/2026.
    expect(resolveImportedKind('expense', null)).toBe('expense');
  });
});
