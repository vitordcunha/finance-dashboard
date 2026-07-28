import { parse as parseMoney, toCents } from '@/core/money';
import type { ParseImportResult, ParsedImportLine, ParsedLineKind } from './types';

/**
 * CSV mínimo: detecta cabeçalho e mapeia colunas comuns (pt-BR / EN).
 * Sem presets de banco — extensível depois.
 */
export function parseCsv(raw: string): ParseImportResult {
  const rows = splitCsvRows(raw);
  if (rows.length === 0) {
    return { lines: [], periodStart: null, periodEnd: null };
  }

  const headerIdx = rows.findIndex((r) => looksLikeHeader(r));
  const start = headerIdx >= 0 ? headerIdx : -1;
  const mapping: ColMap =
    headerIdx >= 0
      ? mapHeaders(rows[headerIdx]!)
      : { date: 0, amount: 1, description: 2, id: null, tipo: null };

  if (mapping.date == null || mapping.amount == null) {
    throw new Error('CSV sem colunas de data e valor reconhecíveis');
  }

  const dataRows = rows.slice(start + 1);
  const lines: ParsedImportLine[] = [];

  for (const cols of dataRows) {
    if (cols.every((c) => !c.trim())) continue;
    const dateRaw = cols[mapping.date]?.trim() ?? '';
    const amountRaw = cols[mapping.amount]?.trim() ?? '';
    if (!dateRaw || !amountRaw) continue;

    const postedOn = parseCsvDate(dateRaw);
    if (!postedOn) continue;

    const absOrSigned = parseCsvAmount(amountRaw);
    if (absOrSigned === 0) continue;

    const tipoRaw =
      mapping.tipo != null ? (cols[mapping.tipo]?.trim() ?? '') : '';
    const kind = resolveKind(absOrSigned, tipoRaw);

    const descIdx = mapping.description;
    const description =
      descIdx != null ? (cols[descIdx]?.trim() ?? '') : '';
    const idIdx = mapping.id;
    const externalId =
      idIdx != null ? (cols[idIdx]?.trim() || null) : null;

    lines.push({
      postedOn,
      amountCents: Math.abs(absOrSigned),
      kind,
      description,
      externalId,
    });
  }

  return withPeriod(lines);
}

type ColMap = {
  date: number | null;
  amount: number | null;
  description: number | null;
  id: number | null;
  tipo: number | null;
};

function looksLikeHeader(cols: string[]): boolean {
  const joined = cols.join(' ').toLowerCase();
  return (
    /data|date|posted/.test(joined) &&
    /valor|amount|montante|value/.test(joined)
  );
}

function mapHeaders(cols: string[]): ColMap {
  const map: ColMap = {
    date: null,
    amount: null,
    description: null,
    id: null,
    tipo: null,
  };
  cols.forEach((raw, i) => {
    const h = raw.trim().toLowerCase();
    if (map.date == null && /^(data|date|posted|dt)/.test(h)) {
      map.date = i;
    } else if (
      map.amount == null &&
      /^(valor|amount|montante|value|trnamt)/.test(h)
    ) {
      map.amount = i;
    } else if (
      map.description == null &&
      /^(desc|histórico|historico|memo|name|lançamento|lancamento|detalhe)/.test(
        h,
      )
    ) {
      map.description = i;
    } else if (
      map.id == null &&
      /^(id|fitid|external|documento|doc)/.test(h)
    ) {
      map.id = i;
    } else if (
      map.tipo == null &&
      /^(tipo|type|natureza|dc|d\/c)$/.test(h)
    ) {
      map.tipo = i;
    }
  });
  return map;
}

/**
 * Sinal no valor manda; senão coluna tipo (D/C); senão positivo = despesa
 * (padrão de conciliação de compras no extrato).
 */
function resolveKind(signedCents: number, tipoRaw: string): ParsedLineKind {
  if (signedCents < 0) return 'expense';
  if (signedCents > 0 && hasExplicitSignInTipo(tipoRaw) === 'income') {
    return 'income';
  }
  if (signedCents > 0 && hasExplicitSignInTipo(tipoRaw) === 'expense') {
    return 'expense';
  }
  // Valor positivo sem tipo: se o parse veio de número negativo já tratado.
  // Positivo cru → despesa (ritual de compras / débitos).
  if (tipoRaw) {
    const t = tipoRaw.toLowerCase();
    if (/^c|cred|crédito|credito|credit|entrada$/.test(t)) return 'income';
    if (/^d|deb|débito|debito|debit|saida|saída$/.test(t)) return 'expense';
  }
  return signedCents < 0 ? 'expense' : 'expense';
}

function hasExplicitSignInTipo(
  tipoRaw: string,
): ParsedLineKind | null {
  if (!tipoRaw) return null;
  const t = tipoRaw.toLowerCase().trim();
  if (/^(c|cr|cred|crédito|credito|credit|entrada)$/.test(t)) return 'income';
  if (/^(d|db|deb|débito|debito|debit|saida|saída)$/.test(t)) return 'expense';
  return null;
}

function splitCsvRows(raw: string): string[][] {
  const text = raw.replace(/^\uFEFF/, '');
  const lines = text.split(/\r?\n/);
  const sep = detectSeparator(lines);
  return lines
    .map((line) => parseCsvLine(line, sep))
    .filter((cols) => cols.some((c) => c.trim()));
}

function detectSeparator(lines: string[]): ',' | ';' | '\t' {
  const sample = lines.slice(0, 5).join('\n');
  const counts = {
    ';': (sample.match(/;/g) ?? []).length,
    ',': (sample.match(/,/g) ?? []).length,
    '\t': (sample.match(/\t/g) ?? []).length,
  };
  if (counts[';'] >= counts[','] && counts[';'] >= counts['\t']) return ';';
  if (counts['\t'] > counts[',']) return '\t';
  return ',';
}

function parseCsvLine(line: string, sep: string): string[] {
  const result: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!;
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === sep && !inQuotes) {
      result.push(cur);
      cur = '';
    } else {
      cur += ch;
    }
  }
  result.push(cur);
  return result;
}

function parseCsvDate(raw: string): string | null {
  const t = raw.trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(t)) return t.slice(0, 10);
  const br = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (br) {
    const d = br[1]!.padStart(2, '0');
    const m = br[2]!.padStart(2, '0');
    return `${br[3]}-${m}-${d}`;
  }
  const dash = t.match(/^(\d{1,2})-(\d{1,2})-(\d{4})/);
  if (dash) {
    const d = dash[1]!.padStart(2, '0');
    const m = dash[2]!.padStart(2, '0');
    return `${dash[3]}-${m}-${d}`;
  }
  return null;
}

/** Valor CSV: pt-BR ou EN; sinal negativo = despesa. */
function parseCsvAmount(raw: string): number {
  const t = raw.trim();
  if (!t) return 0;
  const paren = t.match(/^\((.+)\)$/);
  if (paren) {
    return -Math.abs(parseMoney(paren[1]!));
  }
  try {
    return parseMoney(t.replace(/^−/, '-'));
  } catch {
    const n = Number.parseFloat(t.replace(/\./g, '').replace(',', '.'));
    if (!Number.isFinite(n)) return 0;
    return toCents(n);
  }
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
