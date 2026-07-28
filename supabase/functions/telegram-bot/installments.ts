/** Espelho de src/core/capture/installments.ts */

export function splitInstallmentCents(
  totalCents: number,
  installments: number,
): number[] {
  if (totalCents <= 0 || installments < 2) return [];
  const n = Math.min(48, Math.floor(installments));
  const base = Math.floor(totalCents / n);
  const rem = totalCents - base * n;
  return Array.from({ length: n }, (_, i) => base + (i < rem ? 1 : 0));
}

export function addMonthsISO(dateISO: string, months: number): string {
  const [y, m, d] = dateISO.split('-').map(Number);
  const dt = new Date(Date.UTC(y!, m! - 1, d!));
  dt.setUTCMonth(dt.getUTCMonth() + months);
  const last = new Date(
    Date.UTC(dt.getUTCFullYear(), dt.getUTCMonth() + 1, 0),
  ).getUTCDate();
  const day = Math.min(d!, last);
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}
