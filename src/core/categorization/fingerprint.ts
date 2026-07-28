/**
 * Fingerprint estável de descrição de extrato.
 * Igualdade determinística — sem fuzzy — para regras de categoria.
 */

/** Tokens de localização / país comuns em MEMO de cartão BR. */
const LOCATION_NOISE = new Set([
  'bra',
  'brasil',
  'brazil',
  'br',
  'porto',
  'alegre',
  'sao',
  'paulo',
  'rio',
  'janeiro',
  'curitiba',
  'belo',
  'horizonte',
  'brasilia',
  'salvador',
  'fortaleza',
  'recife',
  'manaus',
  'belem',
  'goiania',
  'campinas',
  'guarulhos',
  'osasco',
  'niteroi',
  'florianopolis',
  'vitoria',
  'sp',
  'rj',
  'rs',
  'pr',
  'mg',
  'ba',
  'pe',
  'ce',
  'df',
  'sc',
  'es',
  'go',
  'am',
  'pa',
]);

/** Prefixos / ruído de pagamento que não identificam o merchant. */
const PAYMENT_NOISE = new Set([
  'pag',
  'pagto',
  'pagamento',
  'compra',
  'deb',
  'debito',
  'credito',
  'cartao',
  'visa',
  'master',
  'elo',
]);

/** Prefixos de adquirente / intermediário no início do MEMO (ex.: IFD*IFOOD). */
const ACQUIRER_PREFIX = new Set([
  'ifd',
  'sq',
  'zoop',
  'stone',
  'cielo',
  'rede',
  'getnet',
  'pagseguro',
  'mercadopago',
]);

/**
 * Normaliza e reduz a descrição a uma chave comparável.
 * Retorna string vazia se não sobrar nada útil.
 */
export function fingerprint(descriptionRaw: string): string {
  const tokens = tokenizeDescription(descriptionRaw);
  return tokens.join(' ');
}

/**
 * Rótulo curto para UI a partir do fingerprint (ou do raw se fingerprint vazio).
 */
export function fingerprintLabel(
  descriptionRaw: string,
  maxTokens = 4,
): string {
  const fp = fingerprint(descriptionRaw);
  const source = fp || descriptionRaw.trim();
  if (!source) return 'Sem descrição';
  const words = source.split(/\s+/).filter(Boolean).slice(0, maxTokens);
  return words
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

export function tokenizeDescription(descriptionRaw: string): string[] {
  const normalized = descriptionRaw
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[*._\-/\\|,;:]+/g, ' ')
    .replace(/[^a-z0-9\s]/g, ' ');

  const rawTokens = normalized.split(/\s+/).filter(Boolean);

  const out: string[] = [];
  for (const t of rawTokens) {
    if (t.length < 2) continue;
    if (/^\d+$/.test(t)) continue;
    if (LOCATION_NOISE.has(t)) continue;
    if (PAYMENT_NOISE.has(t)) continue;
    out.push(t);
  }

  // IFD*IFOOD → drop leading acquirer token so equals plain IFOOD …
  if (out.length >= 2 && ACQUIRER_PREFIX.has(out[0]!)) {
    out.shift();
  }

  return out;
}

/**
 * Conta linhas pendentes (`unmatched`) com o mesmo fingerprint.
 * `excludeId` ignora a linha atual.
 */
export function countPendingSameFingerprint(
  lines: ReadonlyArray<{ id: string; descriptionRaw: string; status: string }>,
  descriptionRaw: string,
  excludeId?: string,
): number {
  const target = fingerprint(descriptionRaw);
  if (!target) return 0;

  let n = 0;
  for (const line of lines) {
    if (excludeId && line.id === excludeId) continue;
    if (line.status !== 'unmatched') continue;
    if (fingerprint(line.descriptionRaw) === target) n += 1;
  }
  return n;
}

/**
 * Filtra linhas `unmatched` com o mesmo fingerprint (exceto `excludeId`).
 */
export function pendingLinesSameFingerprint<
  T extends { id: string; descriptionRaw: string; status: string },
>(lines: ReadonlyArray<T>, descriptionRaw: string, excludeId?: string): T[] {
  const target = fingerprint(descriptionRaw);
  if (!target) return [];

  return lines.filter((line) => {
    if (excludeId && line.id === excludeId) return false;
    if (line.status !== 'unmatched') return false;
    return fingerprint(line.descriptionRaw) === target;
  });
}
