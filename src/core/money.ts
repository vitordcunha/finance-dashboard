/** Valores monetários sempre em centavos (integer). Nunca float como fonte da verdade. */

export type Cents = number & { readonly __brand: 'Cents' };

export function asCents(value: number): Cents {
  if (!Number.isInteger(value)) {
    throw new Error(`Cents deve ser inteiro, recebeu ${value}`);
  }
  return value as Cents;
}

export function add(a: number, b: number): Cents {
  return asCents(a + b);
}

export function sub(a: number, b: number): Cents {
  return asCents(a - b);
}

/**
 * Formata centavos como moeda pt-BR (ex.: 1990 → "R$ 19,90").
 * Divisão por 100 só na borda de display.
 */
export function formatBRL(cents: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(cents / 100);
}

/**
 * Converte reais (número) para centavos com arredondamento bancário simples.
 * Preferir `parse` / `fromInput` para texto de formulário.
 */
export function toCents(reais: number): Cents {
  if (!Number.isFinite(reais)) {
    throw new Error(`Reais inválido: ${reais}`);
  }
  return asCents(Math.round(reais * 100));
}

/**
 * Interpreta texto de valor em pt-BR.
 * Aceita "19,90", "1.234,56", "R$ 19,90", "19.90".
 */
export function parse(raw: string): Cents {
  const trimmed = raw.trim();
  if (!trimmed) {
    return asCents(0);
  }

  const cleaned = trimmed.replace(/[^\d,.-]/g, '');
  if (!cleaned || cleaned === '-' || cleaned === ',' || cleaned === '.') {
    return asCents(0);
  }

  let normalized: string;
  if (cleaned.includes(',')) {
    // pt-BR: pontos = milhar, vírgula = decimal
    normalized = cleaned.replace(/\./g, '').replace(',', '.');
  } else {
    normalized = cleaned;
  }

  const value = Number(normalized);
  if (!Number.isFinite(value)) {
    throw new Error(`Valor inválido: ${raw}`);
  }

  return asCents(Math.round(value * 100));
}

export const fromInput = parse;

/**
 * Digits-only do keypad (ex.: "1990" → 1990 centavos = R$ 19,90).
 */
export function parseDigits(digits: string): Cents {
  const only = digits.replace(/\D/g, '');
  if (!only) return asCents(0);
  return asCents(Number.parseInt(only, 10));
}
