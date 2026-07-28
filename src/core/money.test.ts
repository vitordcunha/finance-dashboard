import { describe, expect, it } from 'vitest';
import {
  add,
  asCents,
  formatBRL,
  fromInput,
  parse,
  parseDigits,
  sub,
  toCents,
} from './money';

describe('money', () => {
  it('asCents rejeita float', () => {
    expect(() => asCents(19.9)).toThrow();
  });

  it('add / sub operam em inteiros', () => {
    expect(add(1990, 10)).toBe(2000);
    expect(sub(2000, 10)).toBe(1990);
    expect(sub(100, 250)).toBe(-150);
  });

  it('formatBRL formata pt-BR', () => {
    expect(formatBRL(1990)).toBe('R$\u00a019,90');
    expect(formatBRL(0)).toBe('R$\u00a00,00');
    expect(formatBRL(-500)).toBe('-R$\u00a05,00');
  });

  it('toCents arredonda reais', () => {
    expect(toCents(19.9)).toBe(1990);
    expect(toCents(19.905)).toBe(1991);
  });

  it('parse interpreta pt-BR e aliases', () => {
    expect(parse('19,90')).toBe(1990);
    expect(parse('R$ 19,90')).toBe(1990);
    expect(parse('1.234,56')).toBe(123456);
    expect(parse('19.90')).toBe(1990);
    expect(parse('')).toBe(0);
    expect(fromInput('10')).toBe(1000);
  });

  it('parseDigits lê teclado numérico', () => {
    expect(parseDigits('1990')).toBe(1990);
    expect(parseDigits('')).toBe(0);
    expect(parseDigits('12a34')).toBe(1234);
  });
});
