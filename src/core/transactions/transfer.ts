/**
 * Invariante do modelo: `transfer` é dinheiro que trocou de conta **dentro da casa**.
 * Sem conta de destino conhecida, o dinheiro deixou a casa — e isso é `expense`.
 *
 * Por que isso é regra e não heurística: `transfer` não entra em plano × realizado
 * nem no gasto do mês. Adivinhar transferência pelo texto do extrato
 * ("TRANSF ENVIADA PIX") esconde gasto real — um PIX para outra pessoa é gasto,
 * e o extrato não sabe distinguir dos dois casos.
 */

export type TransactionKind = 'income' | 'expense' | 'transfer';

export type TransferShape = {
  kind: TransactionKind;
  /** Conta de origem (débito). */
  accountId: string | null | undefined;
  /** Conta de destino (crédito) — obrigatória quando `kind` é `transfer`. */
  transferAccountId: string | null | undefined;
};

/** Transferência válida: entre duas contas conhecidas e diferentes. */
export function isInternalTransfer(tx: TransferShape): boolean {
  if (tx.kind !== 'transfer') return false;
  if (!tx.transferAccountId) return false;
  return tx.transferAccountId !== tx.accountId;
}

/** Patch parcial: `undefined` = campo ausente, `null` = limpar de propósito. */
export type TransferPatch = {
  kind?: TransactionKind;
  accountId?: string | null;
  transferAccountId?: string | null;
};

/**
 * Forma efetiva de um lançamento depois de aplicar um patch parcial.
 *
 * Validar a invariante sem fazer essa fusão é o que quebrou a edição: o
 * `updateTransaction` chamava `assertTransferShape` com `kind: 'transfer'`
 * fixo sempre que o patch tocava data ou conta — isto é, em toda edição vinda do
 * formulário. Todo gasto sem destino era rejeitado como transferência quebrada.
 */
export function mergedTransferShape(
  patch: TransferPatch,
  current: { kind: TransactionKind } & TransferShape,
): TransferShape {
  return {
    kind: patch.kind !== undefined ? patch.kind : current.kind,
    accountId:
      patch.accountId !== undefined ? patch.accountId : current.accountId,
    transferAccountId:
      patch.transferAccountId !== undefined
        ? patch.transferAccountId
        : current.transferAccountId,
  };
}

export type TransferViolation =
  | 'missing_destination'
  | 'same_account';

/**
 * Valida a forma de uma transferência. `null` = ok (ou não é transferência).
 */
export function checkTransferShape(
  tx: TransferShape,
): TransferViolation | null {
  if (tx.kind !== 'transfer') return null;
  if (!tx.transferAccountId) return 'missing_destination';
  if (tx.transferAccountId === tx.accountId) return 'same_account';
  return null;
}

const VIOLATION_MESSAGE: Record<TransferViolation, string> = {
  missing_destination:
    'Transferência precisa de conta de destino. Sem destino, o dinheiro saiu da casa — registre como gasto.',
  same_account: 'Transferência precisa de contas de origem e destino diferentes.',
};

/** Lança se a transferência estiver malformada. Use na borda de persistência. */
export function assertTransferShape(tx: TransferShape): void {
  const violation = checkTransferShape(tx);
  if (violation) {
    throw new Error(VIOLATION_MESSAGE[violation]);
  }
}

/**
 * Kind de um lançamento vindo de extrato.
 *
 * O parser só sabe o sinal (entrou / saiu). Só vira `transfer` quando o usuário
 * aponta a conta de destino — nunca por texto.
 */
export function resolveImportedKind(
  parsedKind: 'income' | 'expense',
  destinationAccountId?: string | null,
): TransactionKind {
  return destinationAccountId ? 'transfer' : parsedKind;
}
