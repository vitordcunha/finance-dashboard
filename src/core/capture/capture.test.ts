import { describe, expect, it } from 'vitest';
import { cheapParseMessage } from './cheap-parse';
import {
  resolveAccountHint,
  resolveCategoryHint,
  resolvePersonHint,
} from './resolve-hints';

describe('cheapParseMessage', () => {
  it('parseia /saida com valor e descrição', () => {
    const d = cheapParseMessage('/saida 35,90 café');
    expect(d).toMatchObject({
      kind: 'expense',
      amountRaw: '35,90',
      description: 'café',
      confidence: 0.95,
    });
  });

  it('parseia entrada', () => {
    const d = cheapParseMessage('entrada 500 freelance');
    expect(d?.kind).toBe('income');
    expect(d?.amountRaw).toBe('500');
    expect(d?.description).toBe('freelance');
  });

  it('respeita prefixo casa', () => {
    const d = cheapParseMessage('casa 120 mercado');
    expect(d?.personHint).toBe('casa');
    expect(d?.amountRaw).toBe('120');
  });

  it('parseia valor sem comando', () => {
    const d = cheapParseMessage('19,90 padaria');
    expect(d?.kind).toBe('expense');
    expect(d?.amountRaw).toBe('19,90');
    expect(d?.description).toBe('padaria');
  });

  it('retorna null se faltar descrição', () => {
    expect(cheapParseMessage('35,90')).toBeNull();
  });

  it('parseia descrição depois do valor', () => {
    const d = cheapParseMessage('café 35,90');
    expect(d).toMatchObject({
      kind: 'expense',
      amountRaw: '35,90',
      description: 'café',
    });
  });

  it('parseia verbos gastei/recebi', () => {
    expect(cheapParseMessage('gastei 40 uber')).toMatchObject({
      kind: 'expense',
      amountRaw: '40',
      description: 'uber',
    });
    expect(cheapParseMessage('recebi 500 freelance')).toMatchObject({
      kind: 'income',
      amountRaw: '500',
      description: 'freelance',
    });
  });

  it('extrai data relativa ontem', () => {
    const d = cheapParseMessage('ontem 50 farmácia');
    expect(d?.amountRaw).toBe('50');
    expect(d?.description).toBe('farmácia');
    expect(d?.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('parseia parcelas 10x', () => {
    const d = cheapParseMessage('1200 notebook 10x');
    expect(d).toMatchObject({
      kind: 'expense',
      amountRaw: '1200',
      description: 'notebook',
      installments: 10,
    });
  });

  it('parseia transferir origem destino', () => {
    const d = cheapParseMessage('transferir 500 nubank inter');
    expect(d).toMatchObject({
      kind: 'transfer',
      amountRaw: '500',
      accountHint: 'nubank',
      transferAccountHint: 'inter',
    });
  });

  it('parseia transferir com pra', () => {
    const d = cheapParseMessage('transf 200,50 inter pra nubank');
    expect(d?.kind).toBe('transfer');
    expect(d?.accountHint).toBe('inter');
    expect(d?.transferAccountHint).toBe('nubank');
  });
});

describe('mergeCheapWithLlm', () => {
  it('trava amountRaw do cheap e pega categoria da LLM', async () => {
    const { mergeCheapWithLlm, AMOUNT_MISMATCH_WARNING } = await import(
      './enrich'
    );
    const cheap = cheapParseMessage('gastei 50 uber')!;
    const merged = mergeCheapWithLlm(cheap, {
      kind: 'expense',
      amountRaw: '50,00',
      description: 'Uber',
      categoryHint: 'Transporte',
      personHint: 'eu',
      accountHint: 'Nubank',
      confidence: 0.9,
      warnings: [],
    });
    expect(merged.amountRaw).toBe('50');
    expect(merged.description).toBe('Uber');
    expect(merged.categoryHint).toBe('Transporte');
    expect(merged.personHint).toBe('eu');
    expect(merged.warnings).not.toContain(AMOUNT_MISMATCH_WARNING);
  });

  it('avisa se LLM discordar do valor', async () => {
    const { mergeCheapWithLlm, shouldAutoConfirmEnriched } = await import(
      './enrich'
    );
    const cheap = cheapParseMessage('50 café')!;
    const merged = mergeCheapWithLlm(cheap, {
      kind: 'expense',
      amountRaw: '55,00',
      description: 'Café',
      confidence: 0.9,
      warnings: [],
    });
    expect(merged.amountRaw).toBe('50');
    expect(merged.warnings.some((w) => w.includes('discordou'))).toBe(true);
    expect(shouldAutoConfirmEnriched(merged)).toBe(false);
  });
});

describe('splitInstallmentCents', () => {
  it('divide com resto nas primeiras', async () => {
    const { splitInstallmentCents } = await import('./installments');
    expect(splitInstallmentCents(1000, 3)).toEqual([334, 333, 333]);
    expect(splitInstallmentCents(120_000, 10).reduce((a, b) => a + b, 0)).toBe(
      120_000,
    );
  });
});

describe('resolve hints', () => {
  const people = [
    { id: 'p1', name: 'Vitor', shortName: 'Vit' },
    { id: 'p2', name: 'Ana', shortName: 'Ana' },
  ];
  const accounts = [
    { id: 'a1', name: 'Nubank' },
    { id: 'a2', name: 'Inter' },
  ];
  const categories = [
    { id: 'c1', name: 'Mercado', kind: 'expense' as const },
    { id: 'c2', name: 'Salário', kind: 'income' as const },
  ];

  it('casa → null person', () => {
    expect(resolvePersonHint('casa', people, 'p1')).toBeNull();
  });

  it('eu → mePersonId', () => {
    expect(resolvePersonHint('eu', people, 'p1')).toBe('p1');
  });

  it('conta por nome', () => {
    expect(resolveAccountHint('nubank', accounts, 'a2')).toBe('a1');
  });

  it('categoria por kind', () => {
    expect(resolveCategoryHint('mercado', categories, 'expense')).toBe('c1');
    expect(resolveCategoryHint('salário', categories, 'income')).toBe('c2');
  });
});
