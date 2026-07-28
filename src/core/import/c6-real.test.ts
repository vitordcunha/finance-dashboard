import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseOfx } from './parse-ofx';

describe('parseOfx — C6 real file', () => {
  it('parseia extrato C6 com tags fechadas e timezone', () => {
    const raw = readFileSync(
      resolve(process.cwd(), '01KYDHR74WF28MQJT8X30HQCME.ofx'),
      'utf8',
    );
    const result = parseOfx(raw);
    expect(result.lines.length).toBeGreaterThan(10);
    expect(result.lines[0]).toMatchObject({
      postedOn: '2026-06-28',
      amountCents: 5000,
      kind: 'income',
      externalId: '01KYDHR7XNVJ1FQP5GF3DEAM4Q',
    });
    expect(result.lines[1]).toMatchObject({
      postedOn: '2026-06-28',
      amountCents: 4923,
      kind: 'expense',
    });
  });
});
