import { add, asCents, type Cents } from '@/core/money';

export type AnchorBalanceInput = {
  accountId: string;
  /** Kind da conta — crédito já deve vir com sinal negativo se for dívida. */
  kind?: 'credit' | 'checking' | 'cash' | 'savings';
  balanceCents: number;
  asOfDate: string;
};

export type BalanceAnchor = {
  /** Soma dos últimos saldos (crédito negativo = dívida). */
  totalCents: Cents;
  /** Contas com saldo informado. */
  balances: AnchorBalanceInput[];
  /** Data mais recente entre os saldos. */
  asOfDate: string | null;
  hasAnchor: boolean;
};

/**
 * Resolve a âncora a partir dos últimos saldos por conta.
 * Preferir account_balances; month_closes é só ritual/histórico.
 */
export function resolveBalanceAnchor(
  latestBalances: ReadonlyArray<AnchorBalanceInput>,
): BalanceAnchor {
  if (latestBalances.length === 0) {
    return {
      totalCents: asCents(0),
      balances: [],
      asOfDate: null,
      hasAnchor: false,
    };
  }

  let total = 0;
  let asOfDate: string | null = null;
  for (const row of latestBalances) {
    total += row.balanceCents;
    if (asOfDate == null || row.asOfDate > asOfDate) {
      asOfDate = row.asOfDate;
    }
  }

  return {
    totalCents: asCents(total),
    balances: [...latestBalances],
    asOfDate,
    hasAnchor: true,
  };
}

/**
 * Aplica o líquido planejado do mês sobre a âncora.
 * plannedNetCents = incomes − expenses (centavos, sinal já líquido).
 */
export function applyPlanDeltaToAnchor(
  anchorCents: number,
  plannedNetCents: number,
): Cents {
  return add(anchorCents, plannedNetCents);
}

/**
 * Converte valor digitado na UI para balance_cents persistido.
 * Crédito: UI pede “quanto deve” (positivo) → grava negativo (dívida).
 * Demais: UI pede “quanto tem” → grava positivo.
 */
export function toStoredBalanceCents(
  enteredAbsCents: number,
  accountKind: 'credit' | 'checking' | 'cash' | 'savings',
): Cents {
  const abs = Math.abs(enteredAbsCents);
  if (accountKind === 'credit') {
    return asCents(-abs);
  }
  return asCents(abs);
}

/** Valor absoluto para exibir/editar na UI a partir do stored. */
export function toDisplayAbsCents(storedBalanceCents: number): Cents {
  return asCents(Math.abs(storedBalanceCents));
}
