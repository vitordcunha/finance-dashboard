import { describe, expect, it } from 'vitest';
import {
  isCommitment,
  isInstallment,
  isVariableOutflow,
} from '@/core/transactions/commitment';

const ESSENCIAIS = new Set(['moradia']);

describe('isInstallment', () => {
  it('reconhece as formas que o app escreve', () => {
    expect(isInstallment('Dívida · parcela 1 de 2')).toBe(true);
    expect(isInstallment('Rateio casa · parcela 2')).toBe(true);
    expect(isInstallment('Notebook 3/12 · parcela 3')).toBe(true);
  });

  it('não confunde com gasto solto', () => {
    expect(isInstallment('Mercado')).toBe(false);
    expect(isInstallment('Parcelamento estudado')).toBe(false);
    expect(isInstallment(null)).toBe(false);
    expect(isInstallment(undefined)).toBe(false);
  });
});

describe('isCommitment', () => {
  it('recorrência é compromisso', () => {
    expect(isCommitment({ seriesId: 'serie' })).toBe(true);
  });

  it('categoria essencial é compromisso', () => {
    expect(isCommitment({ categoryId: 'moradia' }, ESSENCIAIS)).toBe(true);
    expect(isCommitment({ categoryId: 'lazer' }, ESSENCIAIS)).toBe(false);
  });

  it('parcela avulsa é compromisso', () => {
    // O valor foi decidido no dia da compra; nenhum dia deste mês decidiu nada.
    // Sem esta régua a parcela caía em "variável" por eliminação e o ritmo de
    // gasto passava a incluir dívida e rateio.
    expect(
      isCommitment(
        { seriesId: null, categoryId: null, description: 'Dívida · parcela 1 de 2' },
        ESSENCIAIS,
      ),
    ).toBe(true);
  });
});

describe('isVariableOutflow', () => {
  it('só despesa entra', () => {
    expect(isVariableOutflow({ kind: 'income' })).toBe(false);
    expect(isVariableOutflow({ kind: 'transfer' })).toBe(false);
    expect(isVariableOutflow({ kind: 'expense' })).toBe(true);
  });

  it('repasse interno não é gasto de ninguém', () => {
    expect(isVariableOutflow({ kind: 'expense', internal: true })).toBe(false);
  });

  it('parcela não entra no ritmo', () => {
    expect(
      isVariableOutflow({
        kind: 'expense',
        description: 'Rateio casa · parcela 2',
      }),
    ).toBe(false);
  });
});
