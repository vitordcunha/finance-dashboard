/** Basis points: 10000 = 100%. */

export const BPS_TOTAL = 10_000;

export type ContributionMode = 'income_share' | 'equal_50' | 'custom';

export type ShareResult = {
  /** share_bps por person_id (soma ≈ BPS_TOTAL). */
  shares: Record<string, number>;
  /** true quando caiu no 50/50 (ou equal) por falta de renda / custom inválido. */
  usedFallback: boolean;
  fallbackReason: 'none' | 'no_income' | 'invalid_custom' | 'equal_mode';
};

/**
 * Distribui `total` centavos/bps por pesos, sem perder resto (largest remainder).
 */
export function allocateByWeights(
  personIds: string[],
  weights: number[],
  total: number,
): Record<string, number> {
  if (personIds.length === 0) return {};
  if (personIds.length === 1) {
    return { [personIds[0]!]: total };
  }

  const weightSum = weights.reduce((a, b) => a + b, 0);
  if (weightSum <= 0) {
    return allocateEqual(personIds, total);
  }

  const floors: number[] = [];
  const frac: { i: number; rem: number }[] = [];
  let allocated = 0;

  for (let i = 0; i < personIds.length; i++) {
    const exact = (total * weights[i]!) / weightSum;
    const floor = Math.floor(exact);
    floors.push(floor);
    allocated += floor;
    frac.push({ i, rem: exact - floor });
  }

  let left = total - allocated;
  frac.sort((a, b) => b.rem - a.rem || a.i - b.i);
  for (const { i } of frac) {
    if (left <= 0) break;
    floors[i]! += 1;
    left -= 1;
  }

  const out: Record<string, number> = {};
  for (let i = 0; i < personIds.length; i++) {
    out[personIds[i]!] = floors[i]!;
  }
  return out;
}

export function allocateEqual(
  personIds: string[],
  total: number,
): Record<string, number> {
  if (personIds.length === 0) return {};
  const weights = personIds.map(() => 1);
  return allocateByWeights(personIds, weights, total);
}

/**
 * Calcula share_bps por pessoa conforme o modo de cota.
 * Sem renda (income_share) → equal 50/50 (ou 1/N).
 * Custom inválido (soma ≠ 10000 ou pessoa faltando) → equal.
 */
export function computeShareBps(input: {
  mode: ContributionMode;
  personIds: string[];
  incomesByPerson: Record<string, number>;
  customBps?: Record<string, number> | null;
}): ShareResult {
  const { mode, personIds, incomesByPerson, customBps } = input;

  if (personIds.length === 0) {
    return { shares: {}, usedFallback: false, fallbackReason: 'none' };
  }

  if (mode === 'equal_50') {
    return {
      shares: allocateEqual(personIds, BPS_TOTAL),
      usedFallback: false,
      fallbackReason: 'equal_mode',
    };
  }

  if (mode === 'custom') {
    const valid = isValidCustomBps(personIds, customBps);
    if (!valid) {
      return {
        shares: allocateEqual(personIds, BPS_TOTAL),
        usedFallback: true,
        fallbackReason: 'invalid_custom',
      };
    }
    const shares: Record<string, number> = {};
    for (const id of personIds) {
      shares[id] = customBps![id]!;
    }
    return { shares, usedFallback: false, fallbackReason: 'none' };
  }

  // income_share
  const weights = personIds.map((id) => Math.max(0, incomesByPerson[id] ?? 0));
  const totalIncome = weights.reduce((a, b) => a + b, 0);
  if (totalIncome <= 0) {
    return {
      shares: allocateEqual(personIds, BPS_TOTAL),
      usedFallback: true,
      fallbackReason: 'no_income',
    };
  }

  return {
    shares: allocateByWeights(personIds, weights, BPS_TOTAL),
    usedFallback: false,
    fallbackReason: 'none',
  };
}

function isValidCustomBps(
  personIds: string[],
  customBps: Record<string, number> | null | undefined,
): customBps is Record<string, number> {
  if (!customBps) return false;
  let sum = 0;
  for (const id of personIds) {
    const v = customBps[id];
    if (v === undefined || !Number.isInteger(v) || v < 0) return false;
    sum += v;
  }
  return sum === BPS_TOTAL;
}
