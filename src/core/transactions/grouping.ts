/**
 * Agrupa lançamentos por comerciante para categorizar em lote.
 *
 * Extrato bancário repete o mesmo comerciante com ruído em volta:
 * `N.T. DELL OSBEL-MINIM  PORTO ALEGRE  BRA` e `N T DELL OSBEL MINIMER PORTO
 * ALEGRE  BRA` são a mesma padaria em vinte linhas. Categorizar uma por uma é o
 * motivo de 63% da saída de julho estar sem categoria — e essa lacuna trava a
 * projeção, o burn-up e a classificação de essencial.
 *
 * A normalização é deliberadamente burra: sem acento, sem pontuação, sem os
 * sufixos de praça e país, e só as primeiras palavras. Agrupar demais é
 * recuperável — o usuário vê o grupo antes de aplicar; agrupar de menos devolve o
 * problema.
 */

/** Palavras que o extrato cola em tudo e não identificam ninguém. */
const NOISE = new Set([
  'bra',
  'br',
  'ltda',
  'me',
  'mei',
  'eireli',
  'sa',
  'filial',
  'pagto',
  'pag',
  'compra',
  'cartao',
  'debito',
  'credito',
]);

/**
 * Duas palavras, cinco letras cada.
 *
 * O extrato **trunca** nomes de formas diferentes na mesma maquininha:
 * `DELL OSBEL-MINIM` e `DELL OSBEL MINIMER` são o mesmo lugar, então comparar
 * palavras inteiras não junta. E o número de palavras tem de ser pequeno porque o
 * sufixo de praça varia (`ZUFFO` × `ZUFFO PORTO ALEGRE`) e catalogar cidades
 * brasileiras seria uma briga sem fim.
 *
 * O trade-off é assumido: agrupar demais é recuperável — o usuário vê o grupo,
 * o total e a contagem antes de aplicar — e agrupar de menos devolve as 40 linhas
 * uma por uma, que é o problema original.
 */
const KEY_WORDS = 2;
const WORD_PREFIX = 5;

export function merchantKey(description: string): string {
  const words = description
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 1 && !NOISE.has(w) && !/^\d+$/.test(w));

  return words
    .slice(0, KEY_WORDS)
    .map((w) => w.slice(0, WORD_PREFIX))
    .join(' ');
}

export type GroupableTx = {
  id: string;
  description: string;
  amountCents: number;
  date: string;
  categoryId: string | null;
  kind: 'income' | 'expense' | 'transfer';
};

export type MerchantGroup = {
  key: string;
  /** Descrição mais longa do grupo — a que mais informa quem é. */
  label: string;
  ids: string[];
  totalCents: number;
  count: number;
};

/**
 * Grupos de despesa sem categoria, do maior total para o menor.
 *
 * Ordena por **valor**, não por contagem: categorizar o aluguel de R$ 4.295 muda
 * mais a leitura do mês do que trinta cafés.
 */
export function uncategorizedGroups(
  transactions: ReadonlyArray<GroupableTx>,
): MerchantGroup[] {
  const byKey = new Map<string, MerchantGroup>();

  for (const tx of transactions) {
    if (tx.categoryId) continue;
    if (tx.kind !== 'expense') continue;

    const key = merchantKey(tx.description) || tx.description.toLowerCase();
    const hit = byKey.get(key);
    if (hit) {
      hit.ids.push(tx.id);
      hit.totalCents += tx.amountCents;
      hit.count += 1;
      if (tx.description.length > hit.label.length) hit.label = tx.description;
    } else {
      byKey.set(key, {
        key,
        label: tx.description,
        ids: [tx.id],
        totalCents: tx.amountCents,
        count: 1,
      });
    }
  }

  return [...byKey.values()].sort((a, b) => b.totalCents - a.totalCents);
}
