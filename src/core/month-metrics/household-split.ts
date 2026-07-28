/**
 * Como a casa se divide — e se o rateio ainda corresponde à regra.
 *
 * A regra é **proporcional à renda fixa**: quem ganha mais paga mais, na mesma
 * proporção. Renda estimada ou eventual fica fora do peso de propósito — variável
 * como base faria a divisão oscilar todo mês.
 *
 * O problema que isto resolve não é exibir a porcentagem, é que ela está
 * **congelada**: o rateio vive como valor em linhas de lançamento, então mudar um
 * salário não recalcula nada e a divisão silenciosamente vira injusta. Aqui a
 * proporção é recomputada do dado e comparada com o que está agendado, para a
 * divergência aparecer.
 *
 * Não deriva um veredito de "justiça" da saída total de cada um: o rateio é
 * modelado como par entrada/saída, então o repasse dela infla a saída dela e a
 * entrada dele. Comparar saídas brutas leria o repasse duas vezes.
 */

import type { TimelineMonth } from '@/core/timeline';
import { isCommitment } from '@/core/transactions/commitment';
import { merchantKey } from '@/core/transactions/grouping';

export type SplitPerson = {
  personId: string;
  name: string;
  /** Renda recorrente da pessoa no mês — a base do peso. */
  fixedIncomeCents: number;
  /** Peso na divisão, em basis points. */
  weightBps: number;
  /** Parte da conta da casa que cabe a ela pela regra. */
  expectedShareCents: number;
  /** Compromisso que efetivamente sai das contas dela no mês. */
  scheduledOutCents: number;
};

export type HouseholdSplit = {
  people: SplitPerson[];
  /** Compromisso da casa no mês — a conta a dividir. */
  houseCostCents: number;
  totalFixedIncomeCents: number;
  /** Maior divergência entre agendado e devido, em centavos. */
  worstDriftCents: number;
  /**
   * Existe rateio agendado neste mês.
   *
   * Quando não existe, a divisão simplesmente não está em vigor ali — e acusar
   * "falta R$ 866" seria culpar alguém por um mês em que ninguém combinou nada.
   */
  hasContribution: boolean;
};

/**
 * O rateio é um **par espelhado**: entrada na conta de um, saída na conta do
 * outro, mesma data, mesmo valor, mesma descrição. Não é renda de ninguém — é
 * dinheiro dela atravessando a conta dele — e contá-lo como renda inflava o peso
 * de quem recebe, exatamente invertendo o que a divisão deveria mostrar.
 *
 * A detecção é por assinatura porque o modelo não liga os dois lados: a
 * transferência só viraria `transfer` quando a linha do tempo souber creditar o
 * destino. Até lá, esta é a única evidência estrutural disponível.
 */
function internalSignature(
  date: string,
  cents: number,
  description: string,
): string {
  // Descrição **normalizada**, não literal: os dois lados do par raramente têm o
  // mesmo texto. No rateio da casa a saída é "Rateio casa · parcela 1" e a
  // entrada "Rateio casa · parcela 1 · Greicy" — comparar ao pé da letra não
  // casava, e o repasse voltava a contar como renda de quem recebe.
  return `${date}|${Math.abs(cents)}|${merchantKey(description)}`;
}

export function householdSplit(input: {
  month: TimelineMonth;
  /** Dono de cada conta. Sem dono, a conta é da casa e não entra em ninguém. */
  accountOwnerById: ReadonlyMap<string, string | null>;
  personNameById: ReadonlyMap<string, string>;
  essentialCategoryIds?: ReadonlySet<string> | null;
}): HouseholdSplit | null {
  const { month, accountOwnerById, personNameById } = input;
  const essential = input.essentialCategoryIds ?? null;

  const fixedIncome = new Map<string, number>();
  const scheduledOut = new Map<string, number>();
  let houseCostCents = 0;

  const events = month.days.flatMap((d) => d.events);
  const ownerOf = (accountId: string | null) =>
    accountId ? (accountOwnerById.get(accountId) ?? null) : null;

  // Assinaturas de saída, por dono. Uma entrada com assinatura igual saindo da
  // conta de **outra pessoa** é repasse interno, não renda.
  const outflowSignatures = new Map<string, Set<string>>();
  for (const event of events) {
    if (event.kind === 'forecast' || event.nominalCents >= 0) continue;
    const owner = ownerOf(event.accountId);
    if (!owner) continue;
    const sig = internalSignature(event.date, event.nominalCents, event.label);
    const set = outflowSignatures.get(sig) ?? new Set<string>();
    set.add(owner);
    outflowSignatures.set(sig, set);
  }

  for (const day of month.days) {
    for (const event of day.events) {
      if (event.kind === 'forecast') continue;
      const owner = ownerOf(event.accountId);

      if (event.flow === 'income') {
        // Só recorrência: salário é peso, bônus e reembolso não.
        if (!event.seriesId || !owner) continue;
        const mirrored = outflowSignatures.get(
          internalSignature(event.date, event.nominalCents, event.label),
        );
        if (mirrored && [...mirrored].some((o) => o !== owner)) continue;
        fixedIncome.set(
          owner,
          (fixedIncome.get(owner) ?? 0) + event.nominalCents,
        );
        continue;
      }

      if (event.nominalCents >= 0) continue;
      if (!isCommitment(event, essential)) continue;

      houseCostCents += -event.nominalCents;
      if (owner) {
        scheduledOut.set(
          owner,
          (scheduledOut.get(owner) ?? 0) + -event.nominalCents,
        );
      }
    }
  }

  const totalFixedIncomeCents = [...fixedIncome.values()].reduce(
    (s, v) => s + v,
    0,
  );
  // Uma pessoa só não é divisão; sem renda fixa não há peso a calcular.
  if (fixedIncome.size < 2 || totalFixedIncomeCents <= 0) return null;

  const people: SplitPerson[] = [...fixedIncome.entries()]
    .map(([personId, fixedIncomeCents]) => {
      const weightBps = Math.round(
        (fixedIncomeCents / totalFixedIncomeCents) * 10_000,
      );
      return {
        personId,
        name: personNameById.get(personId) ?? 'Pessoa',
        fixedIncomeCents,
        weightBps,
        expectedShareCents: Math.round((houseCostCents * weightBps) / 10_000),
        scheduledOutCents: scheduledOut.get(personId) ?? 0,
      };
    })
    .sort((a, b) => b.weightBps - a.weightBps);

  // Rateio em vigor = pelo menos duas pessoas com compromisso saindo da conta.
  // Com uma só, o mês simplesmente não tem divisão combinada.
  const hasContribution =
    people.filter((p) => p.scheduledOutCents > 0).length >= 2;

  const worstDriftCents = hasContribution
    ? people.reduce(
        (worst, p) =>
          Math.max(worst, Math.abs(p.scheduledOutCents - p.expectedShareCents)),
        0,
      )
    : 0;

  return {
    people,
    houseCostCents,
    totalFixedIncomeCents,
    worstDriftCents,
    hasContribution,
  };
}
