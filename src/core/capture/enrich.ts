import type { CaptureDraft } from '@/core/capture/draft';
import { parse } from '@/core/money';

const AMOUNT_MISMATCH_WARNING =
  'LLM discordou do valor — mantido o parse local; revise';

/**
 * Cheap-parse trava o dinheiro; LLM só enriquece (descrição, categoria, conta, quem).
 * Se a LLM reportar valor diferente, mantém o do cheap e adiciona warning.
 */
export function mergeCheapWithLlm(
  cheap: CaptureDraft,
  llm: CaptureDraft,
): CaptureDraft {
  let amountMismatch = false;
  try {
    const cheapCents = parse(cheap.amountRaw);
    const llmCents = parse(llm.amountRaw);
    if (llmCents > 0 && cheapCents > 0 && llmCents !== cheapCents) {
      amountMismatch = true;
    }
  } catch {
    // LLM amount inválido — ignora
  }

  const description =
    llm.description?.trim() && llm.description.trim().length >= 2
      ? llm.description.trim().slice(0, 200)
      : cheap.description;

  const warnings = [
    ...cheap.warnings,
    ...llm.warnings.filter((w) => !cheap.warnings.includes(w)),
  ];
  if (amountMismatch && !warnings.includes(AMOUNT_MISMATCH_WARNING)) {
    warnings.push(AMOUNT_MISMATCH_WARNING);
  }

  // Kind: cheap manda, exceto se cheap era expense genérico e LLM viu income claro
  // — na prática mantemos cheap (determinístico).
  const kind = cheap.kind;

  return {
    kind,
    amountRaw: cheap.amountRaw,
    description,
    date: cheap.date ?? llm.date,
    personHint: pickHint(llm.personHint, cheap.personHint),
    accountHint: pickHint(llm.accountHint, cheap.accountHint),
    transferAccountHint: pickHint(
      llm.transferAccountHint,
      cheap.transferAccountHint,
    ),
    categoryHint: pickHint(llm.categoryHint, cheap.categoryHint),
    notes: llm.notes ?? cheap.notes ?? null,
    installments: cheap.installments ?? llm.installments,
    lineItems: cheap.lineItems ?? llm.lineItems ?? null,
    confidence: amountMismatch
      ? Math.min(llm.confidence, 0.7)
      : Math.max(cheap.confidence, llm.confidence),
    warnings,
  };
}

function pickHint(
  preferred: string | null | undefined,
  fallback: string | null | undefined,
): string | null {
  const p = preferred?.trim();
  if (p) return p;
  const f = fallback?.trim();
  return f || null;
}

export { AMOUNT_MISMATCH_WARNING };

/** Auto-grava só se parse seguro e sem conflito de valor. */
export function shouldAutoConfirmEnriched(draft: CaptureDraft): boolean {
  if (draft.kind === 'transfer') return false;
  if (draft.installments && draft.installments >= 2) return false;
  if (draft.warnings.some((w) => w.includes('discordou do valor'))) {
    return false;
  }
  return draft.confidence >= 0.95 && draft.warnings.length === 0;
}
