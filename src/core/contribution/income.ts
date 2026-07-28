/**
 * Renda efetiva do mês por pessoa **para cota / orçamento**.
 *
 * - Sem linhas de renda no Plano → 0 (não usa extrato; evita estorno/PIX avulso na %).
 * - Itens não-estimated: valor do plano (expand + override).
 * - Itens estimated: se houver income realizado da pessoa além do fixo,
 *   usa esse restante; senão usa o estimado do plano.
 * - Sem itens estimated: se o realizado superar o plano fixo, usa o realizado.
 * - Incomes com person_id null não entram no share pessoal.
 *
 * Caixa (abertura + movimentos do extrato) vive em `core/cashflow/`.
 */

export type IncomePlanLine = {
  planItemId: string;
  personId: string | null;
  amountCents: number;
  estimated: boolean;
};

export type IncomeTx = {
  personId: string | null;
  amountCents: number;
};

export function resolveMonthIncomes(input: {
  personIds: string[];
  planIncomeLines: IncomePlanLine[];
  incomeTransactions: IncomeTx[];
}): Record<string, number> {
  const { personIds, planIncomeLines, incomeTransactions } = input;
  const result: Record<string, number> = {};

  for (const personId of personIds) {
    result[personId] = resolvePersonIncome(
      personId,
      planIncomeLines,
      incomeTransactions,
    );
  }

  return result;
}

function resolvePersonIncome(
  personId: string,
  planIncomeLines: IncomePlanLine[],
  incomeTransactions: IncomeTx[],
): number {
  const lines = planIncomeLines.filter((l) => l.personId === personId);
  // Sem linhas no Plano: não usa extrato como base de cota
  // (estorno/PIX avulso distorcem o %). Fallback 50/50 em computeShareBps.
  if (lines.length === 0) return 0;

  let fixed = 0;
  let estimated = 0;
  for (const line of lines) {
    if (line.estimated) estimated += line.amountCents;
    else fixed += line.amountCents;
  }

  const actual = incomeTransactions
    .filter((t) => t.personId === personId)
    .reduce((sum, t) => sum + t.amountCents, 0);

  if (estimated > 0) {
    const remainder = actual - fixed;
    const variable = remainder > 0 ? remainder : estimated;
    return fixed + variable;
  }

  // Sem bucket variável: plano fixo, ou realizado se for maior
  return actual > fixed ? actual : fixed;
}

/**
 * Total de despesas da Casa no mês (person_id null).
 */
export function sumCasaExpenses(
  expenses: { personId: string | null; amountCents: number }[],
): number {
  return expenses
    .filter((e) => e.personId === null)
    .reduce((sum, e) => sum + e.amountCents, 0);
}

/**
 * Gastos pessoais (person_id === me).
 */
export function sumPersonalExpenses(
  expenses: { personId: string | null; amountCents: number }[],
  mePersonId: string,
): number {
  return expenses
    .filter((e) => e.personId === mePersonId)
    .reduce((sum, e) => sum + e.amountCents, 0);
}

/**
 * O que paguei de Casa: despesas Casa (person_id null) cuja conta
 * pertence a mim (account.person_id === me). Contas sem dono não entram.
 */
export function sumPaidCasa(input: {
  expenses: {
    personId: string | null;
    amountCents: number;
    accountId: string | null;
  }[];
  accountOwnerById: Record<string, string | null | undefined>;
  mePersonId: string;
}): number {
  const { expenses, accountOwnerById, mePersonId } = input;
  let total = 0;
  for (const e of expenses) {
    if (e.personId !== null) continue;
    if (!e.accountId) continue;
    if (accountOwnerById[e.accountId] === mePersonId) {
      total += e.amountCents;
    }
  }
  return total;
}
