/** Money helpers (centavos) — espelho mínimo de src/core/money.ts */

export function parseAmount(raw: string): number {
  const trimmed = raw.trim();
  if (!trimmed) return 0;
  const cleaned = trimmed.replace(/[^\d,.-]/g, '');
  if (!cleaned || cleaned === '-' || cleaned === ',' || cleaned === '.') return 0;

  let normalized: string;
  if (cleaned.includes(',')) {
    normalized = cleaned.replace(/\./g, '').replace(',', '.');
  } else {
    normalized = cleaned;
  }
  const value = Number(normalized);
  if (!Number.isFinite(value)) throw new Error(`Valor inválido: ${raw}`);
  return Math.round(value * 100);
}

export function formatBRL(cents: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(cents / 100);
}
