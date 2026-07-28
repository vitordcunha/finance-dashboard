/**
 * Saldo de caixa numa data, a partir de âncoras reais por conta.
 *
 *     saldo(conta, d) = âncora(conta) + Σ movimentos da conta em (âncora, d]
 *
 * Funciona nos dois sentidos: se `d` é anterior à âncora, os movimentos do
 * intervalo são **subtraídos**. Isso é o que permite abrir um mês passado sem
 * ritual de fechamento.
 *
 * Substitui a antiga "abertura estimada pelo líquido do mês anterior", que
 * confundia variação com saldo — o líquido de um mês só coincide com o saldo
 * se a conta começou zerada.
 */

export type DatedCashTx = {
  /** ISO yyyy-MM-dd. */
  date: string;
  kind: 'income' | 'expense' | 'transfer';
  amountCents: number;
  accountId?: string | null;
  transferAccountId?: string | null;
};

export type AccountAnchor = {
  accountId: string;
  balanceCents: number;
  /** ISO yyyy-MM-dd — o saldo vale no fim deste dia. */
  asOfDate: string;
};

export type CashBalanceAt = {
  cents: number;
  /** `none` quando nenhuma conta de caixa tem saldo informado. */
  source: 'anchor' | 'none';
  /** Contas que contribuíram (têm âncora). */
  anchoredAccountIds: string[];
  /** Data da âncora mais recente usada. */
  anchorAsOfDate: string | null;
};

/**
 * Efeito de um lançamento no saldo de **uma** conta.
 * Saída da conta é negativa; chegada por transferência é positiva.
 */
export function accountDelta(tx: DatedCashTx, accountId: string): number {
  let delta = 0;

  if (tx.accountId === accountId) {
    if (tx.kind === 'income') delta += tx.amountCents;
    else delta -= tx.amountCents; // expense e transfer saem
  }

  // Chegada por transferência interna.
  if (tx.kind === 'transfer' && tx.transferAccountId === accountId) {
    delta += tx.amountCents;
  }

  return delta;
}

/**
 * Saldo somado das contas de caixa em `date` (inclusive).
 * Contas sem âncora ficam de fora — não dá para inventar ponto de partida.
 */
export function cashBalanceAt(input: {
  anchors: ReadonlyArray<AccountAnchor>;
  transactions: ReadonlyArray<DatedCashTx>;
  /** ISO yyyy-MM-dd, inclusive. */
  date: string;
  /** Contas que guardam caixa; cartão de crédito fica de fora. */
  cashAccountIds?: ReadonlySet<string> | null;
}): CashBalanceAt {
  const usable = input.cashAccountIds
    ? input.anchors.filter((a) => input.cashAccountIds!.has(a.accountId))
    : input.anchors;

  if (usable.length === 0) {
    return {
      cents: 0,
      source: 'none',
      anchoredAccountIds: [],
      anchorAsOfDate: null,
    };
  }

  let total = 0;
  let latestAnchorDate: string | null = null;

  for (const anchor of usable) {
    total += anchor.balanceCents + deltaBetween(input.transactions, anchor, input.date);
    if (latestAnchorDate == null || anchor.asOfDate > latestAnchorDate) {
      latestAnchorDate = anchor.asOfDate;
    }
  }

  return {
    cents: total,
    source: 'anchor',
    anchoredAccountIds: usable.map((a) => a.accountId),
    anchorAsOfDate: latestAnchorDate,
  };
}

/**
 * Movimento líquido da conta entre a âncora e `date`.
 * Sinal invertido quando `date` é anterior à âncora (andando para trás).
 */
function deltaBetween(
  transactions: ReadonlyArray<DatedCashTx>,
  anchor: AccountAnchor,
  date: string,
): number {
  if (date === anchor.asOfDate) return 0;

  const forward = date > anchor.asOfDate;
  const from = forward ? anchor.asOfDate : date;
  const to = forward ? date : anchor.asOfDate;

  let delta = 0;
  for (const tx of transactions) {
    // Janela (from, to] — exclui o dia da borda inicial, inclui o final.
    if (tx.date <= from || tx.date > to) continue;
    delta += accountDelta(tx, anchor.accountId);
  }

  return forward ? delta : -delta;
}
