import type { MatchCandidate, MatchSuggestion, ParsedImportLine } from './types';
import { HIGH_CONFIDENCE } from './types';

const MS_PER_DAY = 86_400_000;
const DATE_WINDOW_DAYS = 2;

/**
 * Match v1: amount exato + mesma conta (pré-filtrado) + data ±2d + fuzzy leve.
 * Retorna melhor candidato ou null.
 */
export function suggestMatch(
  line: Pick<
    ParsedImportLine,
    'postedOn' | 'amountCents' | 'description' | 'kind'
  >,
  candidates: ReadonlyArray<MatchCandidate>,
): MatchSuggestion | null {
  let best: MatchSuggestion | null = null;

  for (const c of candidates) {
    if (c.amountCents !== line.amountCents) continue;

    const dayDiff = Math.abs(daysBetween(line.postedOn, c.date));
    if (dayDiff > DATE_WINDOW_DAYS) continue;

    const conf = scoreMatch(line, c, dayDiff);
    if (best == null || conf > best.confidence) {
      best = { transactionId: c.transactionId, confidence: conf };
    }
  }

  return best;
}

export function isHighConfidence(confidence: number): boolean {
  return confidence >= HIGH_CONFIDENCE;
}

/**
 * Atribui matches 1:1 (cada transaction só uma vez; preferência pela maior confiança).
 */
export function assignMatches(
  lines: ReadonlyArray<
    Pick<ParsedImportLine, 'postedOn' | 'amountCents' | 'description' | 'kind'>
  >,
  candidates: ReadonlyArray<MatchCandidate>,
): Array<MatchSuggestion | null> {
  const used = new Set<string>();
  const scored: Array<{
    lineIndex: number;
    suggestion: MatchSuggestion;
  }> = [];

  lines.forEach((line, lineIndex) => {
    const available = candidates.filter((c) => !used.has(c.transactionId));
    // First pass: gather all best without consuming — then assign greedily by confidence
    const suggestion = suggestMatch(line, available);
    if (suggestion) {
      scored.push({ lineIndex, suggestion });
    }
  });

  scored.sort((a, b) => b.suggestion.confidence - a.suggestion.confidence);

  const result: Array<MatchSuggestion | null> = lines.map(() => null);
  for (const { lineIndex, suggestion } of scored) {
    if (used.has(suggestion.transactionId)) {
      // Re-score excluding used
      const line = lines[lineIndex]!;
      const alt = suggestMatch(
        line,
        candidates.filter((c) => !used.has(c.transactionId)),
      );
      if (!alt) continue;
      used.add(alt.transactionId);
      result[lineIndex] = alt;
    } else {
      used.add(suggestion.transactionId);
      result[lineIndex] = suggestion;
    }
  }

  return result;
}

function scoreMatch(
  line: Pick<ParsedImportLine, 'description' | 'kind'>,
  candidate: MatchCandidate,
  dayDiff: number,
): number {
  // Base: amount already exact
  let score = 70;

  // Data: 0d → +20, 1d → +12, 2d → +5
  if (dayDiff === 0) score += 20;
  else if (dayDiff === 1) score += 12;
  else score += 5;

  // Fuzzy descrição (0–10)
  score += Math.round(descriptionSimilarity(line.description, candidate.description) * 10);

  return Math.min(100, Math.max(0, score));
}

/**
 * Similaridade leve 0–1: tokens em comum / max(tokens).
 * Normaliza acentos e case.
 */
export function descriptionSimilarity(a: string, b: string): number {
  const ta = tokenize(a);
  const tb = tokenize(b);
  if (ta.size === 0 && tb.size === 0) return 1;
  if (ta.size === 0 || tb.size === 0) return 0;

  let common = 0;
  for (const t of ta) {
    if (tb.has(t)) common++;
  }
  return common / Math.max(ta.size, tb.size);
}

function tokenize(s: string): Set<string> {
  const normalized = s
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ');
  const parts = normalized.split(/\s+/).filter((p) => p.length >= 2);
  return new Set(parts);
}

function daysBetween(a: string, b: string): number {
  const da = Date.parse(`${a}T12:00:00Z`);
  const db = Date.parse(`${b}T12:00:00Z`);
  return Math.round((da - db) / MS_PER_DAY);
}

export { HIGH_CONFIDENCE };
