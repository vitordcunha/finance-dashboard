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
  /**
   * Descrição do lançamento, para reconhecer parcelamento.
   *
   * Opcional porque nem toda chamada tem o texto à mão; sem ele a régua só perde
   * o caso da parcela avulsa, não muda de significado.
   */
  description?: string | null;
  /** Transferência entre contas do casal — não é gasto de ninguém. */
  internal?: boolean;
};

/**
 * Parcela de um compromisso assumido antes.
 *
 * `Dívida · parcela 1 de 2` e `Rateio casa · parcela 2` não têm série (cada mês é
 * uma linha avulsa, com valor próprio) nem categoria essencial — então caíam em
 * "variável" por eliminação, e o ritmo de gasto passava a incluir dívida e rateio.
 * O valor de uma parcela foi decidido no dia da compra; nenhum dia deste mês
 * decidiu nada sobre ela.
 *
 * Deliberadamente frouxo (`parcela 2` conta, sem exigir `de 5`): o app escreve o
 * total quando conhece, e não escreve quando o parcelamento é aberto.
 */
const INSTALLMENT = /\bparcela\s*\d+/i;

export function isInstallment(description?: string | null): boolean {
  return Boolean(description && INSTALLMENT.test(description));
}

/** Recorrência, parcelamento ou categoria marcada como essencial em Ajustes. */
export function isCommitment(
  tx: CommitmentShape,
  essentialCategoryIds?: ReadonlySet<string> | null,
): boolean {
  if (tx.seriesId) return true;
  if (isInstallment(tx.description)) return true;
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
 * na quitação seria contar duas vezes. Repasse interno também fica fora: o
 * dinheiro só trocou de conta dentro de casa.
 */
export function isVariableOutflow(
  tx: VariableShape,
  essentialCategoryIds?: ReadonlySet<string> | null,
): boolean {
  if (tx.kind !== 'expense') return false;
  if (tx.internal) return false;
  return !isCommitment(tx, essentialCategoryIds);
}
