/**
 * De que natureza é uma saída.
 *
 * A régua vive em `core/transactions/commitment` — aqui só a aplicamos a um
 * evento da linha do tempo. Ter o mesmo critério aqui e na projeção é o que
 * torna "ritmo" e "estimado" comparáveis: enquanto cada um tinha o seu, o app
 * dizia "você gasta R$ 131/dia" e "não sei o que você gasta" na mesma tela.
 *
 * Sem esse corte o ritmo diário virava ficção: julho/2026 dividia aluguel
 * (R$ 4.295,26) e fatura (R$ 3.400,00) por 28 dias e anunciava R$ 407/dia como
 * se fosse hábito. O hábito era R$ 133/dia — os outros R$ 275 eram dois eventos
 * datados que nenhum dia do mês viveu.
 */

import type { TimelineEvent } from '@/core/timeline';
import { isCommitment } from '@/core/transactions/commitment';

export type OutflowKind =
  /** Compromisso: recorrência, parcelamento ou categoria essencial. */
  | 'fixed'
  /** Pagamento de fatura: quitação de compras já feitas, não gasto novo. */
  | 'settlement'
  /** Discricionário: o que se decide gastar durante o mês. */
  | 'variable'
  /** Mediana do histórico, não é lançamento de ninguém. */
  | 'estimated'
  /** Repasse entre as contas do casal: o dinheiro não saiu de casa. */
  | 'internal';

export function outflowKind(
  event: Pick<
    TimelineEvent,
    'kind' | 'flow' | 'seriesId' | 'categoryId' | 'label' | 'internal'
  >,
  essentialCategoryIds?: ReadonlySet<string> | null,
): OutflowKind {
  if (event.kind === 'forecast') return 'estimated';

  // Antes de tudo: repasse não é gasto. O rateio dela caía em "variável" e
  // inflava o ritmo de gasto da casa com dinheiro que só trocou de conta.
  if (event.internal) return 'internal';

  // Transferência move caixa mas não cria gasto: as compras do cartão já
  // aconteceram no mês passado. Contar aqui seria contá-las duas vezes.
  if (event.flow === 'transfer') return 'settlement';

  if (
    isCommitment({ ...event, description: event.label }, essentialCategoryIds)
  ) {
    return 'fixed';
  }

  return 'variable';
}
