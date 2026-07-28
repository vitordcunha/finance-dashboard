export type OpeningSource = 'anchor' | 'declared' | 'none';

export type OpeningBalance = {
  cents: number;
  source: OpeningSource;
};

/**
 * Abertura do mês.
 *
 * Ordem: saldo real derivado da âncora (`core/cashflow/balance-at`) vence,
 * porque é o único número ligado ao extrato. Fechamento declarado à mão entra
 * só como reserva quando não há âncora.
 *
 * **Não existe mais "estimado pelo líquido do mês anterior"**: o líquido é a
 * variação do mês, não o saldo. Só coincidem se a conta começou zerada — o que
 * fazia a abertura de julho/2026 acertar por acidente e errar em qualquer
 * outro mês.
 */
export function resolveOpeningBalance(input: {
  anchoredCents: number | null | undefined;
  declaredPreviousCloseCents: number | null | undefined;
}): OpeningBalance {
  const anchored = input.anchoredCents;
  if (anchored != null && Number.isInteger(anchored)) {
    return { cents: anchored, source: 'anchor' };
  }

  const declared = input.declaredPreviousCloseCents;
  if (declared != null && Number.isInteger(declared)) {
    return { cents: declared, source: 'declared' };
  }

  return { cents: 0, source: 'none' };
}
