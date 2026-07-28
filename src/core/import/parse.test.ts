import { describe, expect, it } from 'vitest';
import { parseOfx } from './parse-ofx';
import { parseCsv } from './parse-csv';
import {
  assignMatches,
  descriptionSimilarity,
  isHighConfidence,
  suggestMatch,
} from './match';
import type { MatchCandidate } from './types';

const SAMPLE_OFX = `
OFXHEADER:100
DATA:OFXSGML
<OFX>
<BANKMSGSRSV1>
<STMTTRNRS>
<STMTRS>
<BANKTRANLIST>
<STMTTRN>
<TRNTYPE>DEBIT
<DTPOSTED>20260715
<TRNAMT>-49.90
<FITID>ABC123
<MEMO>IFOOD *RESTAURANTE
</STMTTRN>
<STMTTRN>
<TRNTYPE>CREDIT
<DTPOSTED>20260710
<TRNAMT>1500.00
<FITID>PAY001
<NAME>SALARIO
</STMTTRN>
</BANKTRANLIST>
</STMTRS>
</STMTTRNRS>
</BANKMSGSRSV1>
</OFX>
`;

describe('parseOfx', () => {
  it('extrai débitos e créditos com FITID', () => {
    const result = parseOfx(SAMPLE_OFX);
    expect(result.lines).toHaveLength(2);
    expect(result.lines[0]).toMatchObject({
      postedOn: '2026-07-15',
      amountCents: 4990,
      kind: 'expense',
      externalId: 'ABC123',
    });
    expect(result.lines[1]).toMatchObject({
      postedOn: '2026-07-10',
      amountCents: 150_000,
      kind: 'income',
      externalId: 'PAY001',
    });
    expect(result.periodStart).toBe('2026-07-10');
    expect(result.periodEnd).toBe('2026-07-15');
  });
});

describe('parseCsv', () => {
  it('lê CSV pt-BR com ; e tipo', () => {
    const csv = `Data;Valor;Descrição;Tipo;Id
15/07/2026;49,90;IFOOD RESTAURANTE;D;x1
10/07/2026;1.500,00;SALARIO;C;x2
`;
    const result = parseCsv(csv);
    expect(result.lines).toHaveLength(2);
    expect(result.lines[0]).toMatchObject({
      postedOn: '2026-07-15',
      amountCents: 4990,
      kind: 'expense',
      externalId: 'x1',
    });
    expect(result.lines[1]).toMatchObject({
      postedOn: '2026-07-10',
      amountCents: 150_000,
      kind: 'income',
      externalId: 'x2',
    });
  });

  it('valor negativo força despesa', () => {
    const csv = `date,amount,description
2026-07-01,-19.90,Padaria
`;
    const result = parseCsv(csv);
    expect(result.lines[0]).toMatchObject({
      amountCents: 1990,
      kind: 'expense',
    });
  });
});

describe('suggestMatch', () => {
  const candidates: MatchCandidate[] = [
    {
      transactionId: 't1',
      date: '2026-07-15',
      amountCents: 4990,
      description: 'iFood Restaurante',
      accountId: 'acc',
    },
    {
      transactionId: 't2',
      date: '2026-07-20',
      amountCents: 4990,
      description: 'Outro',
      accountId: 'acc',
    },
  ];

  it('match óbvio: amount + data + fuzzy → alta confiança', () => {
    const s = suggestMatch(
      {
        postedOn: '2026-07-15',
        amountCents: 4990,
        description: 'IFOOD *RESTAURANTE',
        kind: 'expense',
      },
      candidates,
    );
    expect(s?.transactionId).toBe('t1');
    expect(s && isHighConfidence(s.confidence)).toBe(true);
  });

  it('rejeita fora da janela de ±2 dias', () => {
    const s = suggestMatch(
      {
        postedOn: '2026-07-10',
        amountCents: 4990,
        description: 'iFood',
        kind: 'expense',
      },
      candidates,
    );
    // t1 is 5 days away; t2 is 10 days — none in window from 07-10 for amount 4990 within ±2 of candidates... 
    // t1: Jul 15 vs Jul 10 = 5 days → reject
    // t2: Jul 20 vs Jul 10 = 10 days → reject
    expect(s).toBeNull();
  });

  it('rejeita amount diferente', () => {
    const s = suggestMatch(
      {
        postedOn: '2026-07-15',
        amountCents: 1000,
        description: 'IFOOD',
        kind: 'expense',
      },
      candidates,
    );
    expect(s).toBeNull();
  });
});

describe('assignMatches', () => {
  it('não atribui a mesma transaction a duas linhas', () => {
    const lines = [
      {
        postedOn: '2026-07-15',
        amountCents: 1000,
        description: 'Cafe',
        kind: 'expense' as const,
      },
      {
        postedOn: '2026-07-15',
        amountCents: 1000,
        description: 'Cafe',
        kind: 'expense' as const,
      },
    ];
    const candidates: MatchCandidate[] = [
      {
        transactionId: 'only',
        date: '2026-07-15',
        amountCents: 1000,
        description: 'Cafe',
        accountId: 'a',
      },
    ];
    const assigned = assignMatches(lines, candidates);
    const matched = assigned.filter(Boolean);
    expect(matched).toHaveLength(1);
    expect(matched[0]?.transactionId).toBe('only');
  });
});

describe('descriptionSimilarity', () => {
  it('tokens em comum', () => {
    expect(
      descriptionSimilarity('IFOOD RESTAURANTE SP', 'iFood Restaurante'),
    ).toBeGreaterThan(0.5);
  });
});
