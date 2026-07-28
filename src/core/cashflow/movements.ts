/** Movimentos de caixa do mês a partir de lançamentos (centavos). */

export type CashTx = {
  kind: 'income' | 'expense' | 'transfer';
  amountCents: number;
  /** Conta de origem (débito da transferência). */
  accountId?: string | null;
  /** Conta destino (crédito), se houver. */
  transferAccountId?: string | null;
};

export type MonthMovements = {
  incomeCents: number;
  expenseCents: number;
  /** Saídas kind=transfer (saem da accountId). */
  transferOutCents: number;
  /**
   * Entradas por transferência na conta destino.
   * Só conta se `cashAccountIds` contiver `transferAccountId`.
   */
  transferInCents: number;
  /** income − expense − transferOut + transferIn */
  netCents: number;
};

/**
 * Soma movimentos do mês.
 *
 * `cashAccountIds` = contas que **guardam caixa** (corrente, poupança, dinheiro).
 * Cartão de crédito **não** entra: pagar fatura é dinheiro saindo da casa para
 * abater dívida, não caixa mudando de bolso. Tratá-lo como destino de caixa
 * anula a saída e infla o fechamento do mês.
 *
 * Transferências sem destino conhecido não deveriam existir — ver
 * `core/transactions/transfer`. Se aparecerem, contam só como saída.
 */
export function sumMonthMovements(
  transactions: CashTx[],
  cashAccountIds?: ReadonlySet<string> | null,
): MonthMovements {
  let incomeCents = 0;
  let expenseCents = 0;
  let transferOutCents = 0;
  let transferInCents = 0;

  for (const tx of transactions) {
    if (tx.kind === 'income') {
      incomeCents += tx.amountCents;
      continue;
    }
    if (tx.kind === 'expense') {
      expenseCents += tx.amountCents;
      continue;
    }
    // transfer
    transferOutCents += tx.amountCents;
    if (
      cashAccountIds &&
      tx.transferAccountId &&
      cashAccountIds.has(tx.transferAccountId)
    ) {
      transferInCents += tx.amountCents;
    }
  }

  const netCents =
    incomeCents - expenseCents - transferOutCents + transferInCents;

  return {
    incomeCents,
    expenseCents,
    transferOutCents,
    transferInCents,
    netCents,
  };
}
