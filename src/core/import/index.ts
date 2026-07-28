import type { ParseImportResult } from './types';
import { parseOfx } from './parse-ofx';
import { parseCsv } from './parse-csv';

export type ImportFileSource = 'ofx' | 'csv';

export function detectSource(fileName: string): ImportFileSource {
  const lower = fileName.toLowerCase();
  if (lower.endsWith('.ofx') || lower.endsWith('.qfx')) return 'ofx';
  return 'csv';
}

export function parseImportFile(
  raw: string,
  source: ImportFileSource,
): ParseImportResult {
  if (source === 'ofx') return parseOfx(raw);
  return parseCsv(raw);
}

/** SHA-256 hex do conteúdo (Web Crypto). */
export async function sha256Hex(content: string): Promise<string> {
  const data = new TextEncoder().encode(content);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export { parseOfx } from './parse-ofx';
export { parseCsv } from './parse-csv';
export {
  suggestMatch,
  assignMatches,
  isHighConfidence,
  descriptionSimilarity,
  HIGH_CONFIDENCE,
} from './match';
export type {
  ParsedImportLine,
  ParseImportResult,
  MatchCandidate,
  MatchSuggestion,
  ParsedLineKind,
} from './types';
