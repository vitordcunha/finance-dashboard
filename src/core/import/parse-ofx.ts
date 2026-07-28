import { toCents } from '@/core/money';
import type { ParseImportResult, ParsedImportLine, ParsedLineKind } from './types';

/**
 * Parser OFX mínimo (SGML clássico usado por bancos BR).
 * Lê STMTTRN: DTPOSTED, TRNAMT, MEMO/NAME, FITID.
 */
export function parseOfx(raw: string): ParseImportResult {
  const text = stripOfxHeader(raw);
  const blocks = extractTagBlocks(text, 'STMTTRN');
  const lines: ParsedImportLine[] = [];

  for (const block of blocks) {
    const amountRaw = tagValue(block, 'TRNAMT');
    const dateRaw = tagValue(block, 'DTPOSTED');
    if (!amountRaw || !dateRaw) continue;

    const signed = parseOfxAmount(amountRaw);
    if (signed === 0) continue;

    const postedOn = parseOfxDate(dateRaw);
    if (!postedOn) continue;

    const memo = tagValue(block, 'MEMO') ?? tagValue(block, 'NAME') ?? '';
    const fitid = tagValue(block, 'FITID');

    lines.push({
      postedOn,
      amountCents: Math.abs(signed),
      kind: signed < 0 ? 'expense' : 'income',
      description: memo.trim(),
      externalId: fitid?.trim() || null,
    });
  }

  return withPeriod(lines);
}

function stripOfxHeader(raw: string): string {
  const idx = raw.search(/<OFX>/i);
  if (idx >= 0) return raw.slice(idx);
  return raw;
}

/** Extrai conteúdo interno de cada ocorrência de <TAG>…</TAG> ou <TAG>… até próximo tag. */
function extractTagBlocks(text: string, tag: string): string[] {
  const open = new RegExp(`<${tag}>`, 'gi');
  const close = new RegExp(`</${tag}>`, 'i');
  const blocks: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = open.exec(text)) !== null) {
    const start = match.index + match[0].length;
    const rest = text.slice(start);
    const closeMatch = close.exec(rest);
    if (closeMatch) {
      blocks.push(rest.slice(0, closeMatch.index));
    } else {
      // SGML: fecha no próximo <STMTTRN> ou fim
      const next = rest.search(new RegExp(`<${tag}>`, 'i'));
      blocks.push(next >= 0 ? rest.slice(0, next) : rest);
    }
  }
  return blocks;
}

function tagValue(block: string, tag: string): string | null {
  const re = new RegExp(`<${tag}>([^<\\r\\n]*)`, 'i');
  const m = block.match(re);
  return m ? m[1].trim() : null;
}

/** OFX amount: ponto decimal; negativo = débito. */
function parseOfxAmount(raw: string): number {
  const cleaned = raw.trim().replace(/\s/g, '');
  const n = Number.parseFloat(cleaned);
  if (!Number.isFinite(n)) return 0;
  return toCents(n);
}

/** DTPOSTED: YYYYMMDD[HHMMSS][…] → yyyy-MM-dd */
function parseOfxDate(raw: string): string | null {
  const digits = raw.replace(/[^\d]/g, '');
  if (digits.length < 8) return null;
  const y = digits.slice(0, 4);
  const m = digits.slice(4, 6);
  const d = digits.slice(6, 8);
  const iso = `${y}-${m}-${d}`;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
  return iso;
}

function withPeriod(lines: ParsedImportLine[]): ParseImportResult {
  if (lines.length === 0) {
    return { lines, periodStart: null, periodEnd: null };
  }
  const dates = lines.map((l) => l.postedOn).sort();
  return {
    lines,
    periodStart: dates[0] ?? null,
    periodEnd: dates[dates.length - 1] ?? null,
  };
}

export type { ParsedLineKind };
