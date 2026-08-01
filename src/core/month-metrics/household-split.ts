/**
 * Como a casa se divide — e qual parcela fecha a conta.
 *
 * Duas coisas mudaram em relação à primeira versão, e as duas eram erro de conta,
 * não de forma.
 *
 * **1. O pote é declarado, não inferido.** Antes a conta da casa era "tem série ou
 * categoria essencial", que captura o que é *recorrente*, não o que é
 * *compartilhado*. Em agosto/2026 isso punha no pote o pagamento do drone da mãe
 * dele (R$ 500), o transporte dele (R$ 200) e 100% da fatura do cartão dele
 * (R$ 2.000) — e o card então acusava "Greicy: falta R$ 442,54" sobre um rateio que
 * estava exatamente na regra combinada. Os R$ 442,54 eram 34,03% de R$ 1.300 de
 * itens que não são da casa. Seguir o conselho do card faria ela pagar 34% do
 * transporte dele. Agora o pote são as **categorias marcadas como da casa** em
 * Ajustes (`household_shared_categories`).
 *
 * **2. A política vem de `core/contribution`.** Havia dois motores de rateio: este,
 * proporcional à renda e fixo, e o de `core/contribution` (proporcional / 50-50 /
 * personalizado, com arredondamento sem perder centavo) — que a tela de Ajustes
 * editava e **nenhuma tela lia**. Escolher 50/50 lá não mudava nada em lugar nenhum.
 * Agora o modo escolhido governa esta conta, e o rateio de centavos usa o
 * `largest remainder` de lá em vez de `Math.round` por pessoa.
 *
 * Mede **`nominalCents`**: a compra da casa no cartão dele pertence ao pote no dia
 * da compra. E é por isso que o pagamento da fatura fica fora — ratear a fatura
 * cobraria dela um pedaço das compras pessoais dele, e ainda contaria as compras da
 * casa duas vezes.
 */

import {
  computeQuotas,
  computeShareBps,
  type ContributionMode,
} from '@/core/contribution';
import type { TimelineMonth } from '@/core/timeline';

export type SplitPerson = {
  personId: string;
  name: string;
  /** Renda recorrente da pessoa no mês — a base do peso no modo proporcional. */
  fixedIncomeCents: number;
  /** Peso na divisão, em basis points. */
  weightBps: number;
  /** Parte da conta da casa que cabe a ela pela regra. */
  expectedShareCents: number;
  /** Conta da casa que sai direto das contas dela. */
  paidDirectCents: number;
  /** Repasse que ela transfere para a outra pessoa. */
  transferredCents: number;
  /** Repasse que ela recebe. */
  receivedCents: number;
  /**
   * Ônus real: o que ela paga da casa, mais o que repassa, menos o que recebe.
   * É este número que se compara com `expectedShareCents`.
   */
  burdenCents: number;
  /** `burdenCents − expectedShareCents`. Positivo = paga além da proporção. */
  driftCents: number;
  /**
   * Repasse que fecharia a conta dela neste mês.
   *
   * `cota − o que ela já paga direto`. Zero para quem paga as contas: essa pessoa
   * **recebe**, não transfere. É o número que o card oferece, e a resposta para
   * "quanto deve ser a parcela deste mês" — que antes vivia numa planilha fora do
   * app e envelhecia em silêncio.
   */
  suggestedTransferCents: number;
};

export type HouseholdSplit = {
  people: SplitPerson[];
  /** Conta da casa no mês — o pote a dividir. */
  houseCostCents: number;
  totalFixedIncomeCents: number;
  /** Maior divergência entre ônus e cota, em centavos. */
  worstDriftCents: number;
  /** Existe repasse agendado neste mês. */
  hasContribution: boolean;
  /** Política em vigor, para a tela dizer de onde vem o peso. */
  mode: ContributionMode;
  /** O modo é proporcional mas ninguém tem renda recorrente → caiu em 1/N. */
  usedFallback: boolean;
  /** Nenhuma categoria marcada como da casa: não há pote a dividir. */
  needsSharedCategories: boolean;
};

export function householdSplit(input: {
  month: TimelineMonth;
  /** Dono de cada conta. Sem dono, a conta é da casa e não entra em ninguém. */
  accountOwnerById: ReadonlyMap<string, string | null>;
  personNameById: ReadonlyMap<string, string>;
  /** Quem participa da divisão — normalmente quem tem conta própria. */
  personIds: ReadonlyArray<string>;
  /** Categorias que são conta da casa. Vazio = nada a dividir. */
  sharedCategoryIds: ReadonlySet<string>;
  mode?: ContributionMode;
  customBps?: Record<string, number> | null;
}): HouseholdSplit | null {
  const { month, accountOwnerById, personNameById, sharedCategoryIds } = input;
  const mode = input.mode ?? 'income_share';

  if (input.personIds.length < 2) return null;

  const fixedIncome = new Map<string, number>();
  const paidDirect = new Map<string, number>();
  const transferred = new Map<string, number>();
  const received = new Map<string, number>();
  let houseCostCents = 0;

  const ownerOf = (accountId: string | null) =>
    accountId ? (accountOwnerById.get(accountId) ?? null) : null;
  const add = (map: Map<string, number>, key: string | null, cents: number) => {
    if (!key) return;
    map.set(key, (map.get(key) ?? 0) + cents);
  };

  for (const day of month.days) {
    for (const event of day.events) {
      if (event.kind === 'forecast') continue;
      const owner = ownerOf(event.accountId);

      // Repasse interno: não é conta da casa, é quem já está pagando a sua parte.
      if (event.internal) {
        if (event.nominalCents < 0) {
          add(transferred, owner, -event.nominalCents);
        } else {
          add(received, owner, event.nominalCents);
        }
        continue;
      }

      if (event.flow === 'income') {
        // Só recorrência entra no peso: salário é peso, bônus e reembolso não.
        // Renda eventual como base faria a divisão oscilar todo mês.
        if (!event.seriesId) continue;
        add(fixedIncome, owner, event.nominalCents);
        continue;
      }

      // Quitação de fatura não é conta da casa: as compras dentro dela já
      // contaram, cada uma na própria categoria e no próprio dia.
      if (event.flow === 'transfer') continue;
      if (event.nominalCents >= 0) continue;
      if (!event.categoryId || !sharedCategoryIds.has(event.categoryId)) {
        continue;
      }

      const abs = -event.nominalCents;
      houseCostCents += abs;
      add(paidDirect, owner, abs);
    }
  }

  const incomesByPerson: Record<string, number> = {};
  for (const personId of input.personIds) {
    incomesByPerson[personId] = fixedIncome.get(personId) ?? 0;
  }

  const share = computeShareBps({
    mode,
    personIds: [...input.personIds],
    incomesByPerson,
    customBps: input.customBps,
  });
  const quotas = computeQuotas(share.shares, houseCostCents);

  const people: SplitPerson[] = input.personIds
    .map((personId) => {
      const paidDirectCents = paidDirect.get(personId) ?? 0;
      const transferredCents = transferred.get(personId) ?? 0;
      const receivedCents = received.get(personId) ?? 0;
      const expectedShareCents = quotas[personId] ?? 0;
      const burdenCents =
        paidDirectCents + transferredCents - receivedCents;

      return {
        personId,
        name: personNameById.get(personId) ?? 'Pessoa',
        fixedIncomeCents: incomesByPerson[personId] ?? 0,
        weightBps: share.shares[personId] ?? 0,
        expectedShareCents,
        paidDirectCents,
        transferredCents,
        receivedCents,
        burdenCents,
        driftCents: burdenCents - expectedShareCents,
        suggestedTransferCents: Math.max(
          0,
          expectedShareCents - paidDirectCents,
        ),
      };
    })
    .sort((a, b) => b.weightBps - a.weightBps);

  const hasContribution = people.some((p) => p.transferredCents > 0);

  return {
    people,
    houseCostCents,
    totalFixedIncomeCents: Object.values(incomesByPerson).reduce(
      (s, v) => s + v,
      0,
    ),
    // Sem repasse agendado a divisão simplesmente não está em vigor no mês, e
    // acusar "falta R$ 866" seria culpar alguém por um mês em que ninguém
    // combinou nada.
    worstDriftCents: hasContribution
      ? people.reduce((worst, p) => Math.max(worst, Math.abs(p.driftCents)), 0)
      : 0,
    hasContribution,
    mode,
    usedFallback: share.usedFallback,
    needsSharedCategories: sharedCategoryIds.size === 0,
  };
}
