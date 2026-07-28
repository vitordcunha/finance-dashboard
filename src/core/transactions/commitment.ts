/**
 * Compromisso × decisão: a única régua de "variável" da aplicação.
 *
 * A distinção não é "dá para viver sem", é **quem decide o valor**. Aluguel é
 * decidido uma vez por ano; mercado é decidido toda semana. Só o segundo
 * responde "estou gastando rápido demais?".
 *
 * Mora aqui, e não em `month-metrics` nem em `forecast`, porque os dois precisam
 * dela: o ritmo mede o mês corrente, a projeção mede o histórico, e **os dois
 * têm de estar falando da mesma coisa**. Enquanto cada um tinha seu próprio
 * critério, o app dizia "você gasta R$ 131/dia" e "não sei o que você gasta" na
 * mesma tela.
 */

export type CommitmentShape = {
  /** Ocorrência de recorrência — o valor foi decidido quando a série nasceu. */
  seriesId?: string | null;
  categoryId?: string | null;
};

/** Recorrência ou categoria marcada como essencial em Ajustes. */
export function isCommitment(
  tx: CommitmentShape,
  essentialCategoryIds?: ReadonlySet<string> | null,
): boolean {
  if (tx.seriesId) return true;
  return Boolean(tx.categoryId && essentialCategoryIds?.has(tx.categoryId));
}

export type VariableShape = CommitmentShape & {
  /** Tipo do lançamento. */
  kind: 'income' | 'expense' | 'transfer';
};

/**
 * Saída discricionária: despesa que não é compromisso.
 *
 * `transfer` fica fora porque pagamento de fatura é **quitação** — as compras
 * aconteceram antes e já contaram no dia em que foram feitas. Contá-las de novo
 * na quitação seria contar duas vezes.
 */
export function isVariableOutflow(
  tx: VariableShape,
  essentialCategoryIds?: ReadonlySet<string> | null,
): boolean {
  if (tx.kind !== 'expense') return false;
  return !isCommitment(tx, essentialCategoryIds);
}
