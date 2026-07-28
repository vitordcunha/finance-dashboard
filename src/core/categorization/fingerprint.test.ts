import { describe, expect, it } from 'vitest';
import {
  countPendingSameFingerprint,
  fingerprint,
  fingerprintLabel,
  pendingLinesSameFingerprint,
} from './fingerprint';

describe('fingerprint', () => {
  it('normaliza case, acentos e pontuação e remove prefixo IFD', () => {
    expect(fingerprint('IFD*IFOOD CLUB         Osasco        BRA')).toBe(
      'ifood club',
    );
  });

  it('remove cidade/país e números soltos', () => {
    expect(fingerprint('CARREFOUR PPA 106      PORTO ALEGRE  BRA')).toBe(
      'carrefour ppa',
    );
  });

  it('iguala variantes de pontuação do mesmo merchant', () => {
    const a = fingerprint('N.T. DELL OSBEL-MINIM  PORTO ALEGRE  BRA');
    const b = fingerprint('N T DELL OSBEL MINIM PORTO ALEGRE BRA');
    expect(a).toBe(b);
    expect(a).toBe('dell osbel minim');
  });

  it('ignora ruído de pagamento', () => {
    expect(fingerprint('PAG*IFOOD *RESTAURANTE')).toBe('ifood restaurante');
  });

  it('retorna vazio para descrição só de ruído', () => {
    expect(fingerprint('BRA 123')).toBe('');
    expect(fingerprint('')).toBe('');
  });

  it('fingerprintLabel capitaliza tokens', () => {
    expect(fingerprintLabel('IFD*IFOOD CLUB Osasco BRA')).toBe('Ifood Club');
  });
});

describe('countPendingSameFingerprint', () => {
  const lines = [
    {
      id: '1',
      descriptionRaw: 'IFOOD CLUB Osasco BRA',
      status: 'unmatched',
    },
    {
      id: '2',
      descriptionRaw: 'IFD*IFOOD CLUB Osasco BRA',
      status: 'unmatched',
    },
    {
      id: '3',
      descriptionRaw: 'IFOOD CLUB Osasco BRA',
      status: 'created',
    },
    {
      id: '4',
      descriptionRaw: 'CARREFOUR PPA PORTO ALEGRE BRA',
      status: 'unmatched',
    },
  ];

  it('conta só unmatched com mesmo fingerprint, excluindo a linha atual', () => {
    expect(
      countPendingSameFingerprint(lines, 'IFOOD CLUB Osasco BRA', '1'),
    ).toBe(1);
  });

  it('pendingLinesSameFingerprint devolve as irmãs', () => {
    const siblings = pendingLinesSameFingerprint(
      lines,
      'IFOOD CLUB Osasco BRA',
      '1',
    );
    expect(siblings.map((l) => l.id)).toEqual(['2']);
  });
});
