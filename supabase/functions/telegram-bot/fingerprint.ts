/** Fingerprint alinhado a src/core/categorization/fingerprint.ts (subset). */

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

export function fingerprint(descriptionRaw: string): string {
  const tokens = tokenizeDescription(descriptionRaw);
  return tokens.join(' ');
}

function tokenizeDescription(descriptionRaw: string): string[] {
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
  if (out.length >= 2 && ACQUIRER_PREFIX.has(out[0]!)) {
    out.shift();
  }
  return out;
}
