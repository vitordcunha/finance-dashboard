/** Tipos compartilhados do domínio de importação (puro, sem I/O). */

export type ParsedLineKind = 'expense' | 'income';

export type ParsedImportLine = {
  postedOn: string; // yyyy-MM-dd
  amountCents: number; // ≥ 0
  kind: ParsedLineKind;
  description: string;
  externalId: string | null;
};

export type ParseImportResult = {
  lines: ParsedImportLine[];
  periodStart: string | null;
  periodEnd: string | null;
};

export type MatchCandidate = {
  transactionId: string;
  date: string;
  amountCents: number;
  description: string;
  accountId: string;
};

export type MatchSuggestion = {
  transactionId: string;
  confidence: number; // 0–100
};

/** Limiar de auto-aplicação (matched). */
export const HIGH_CONFIDENCE = 85;
