import { describe, expect, it } from 'vitest';
import {
  aggregateMonthFlows,
  computeMonthSummary,
  daysLeftInMonth,
  escapeHtml,
  formatCotaDigest,
  formatInvoiceDigest,
  formatMesDigest,
  formatSaldoDigest,
  reminderKind,
  selectInvoiceReminders,
} from '@/core/assistant';
import type { PersonContribution } from '@/core/contribution';

describe('daysLeftInMonth', () => {
  it('conta hoje inclusive', () => {
    expect(daysLeftInMonth('2026-07', '2026-07-28')).toBe(4);
    expect(daysLeftInMonth('2026-07', '2026-07-01')).toBe(31);
    expect(daysLeftInMonth('2026-07', '2026-07-31')).toBe(1);
  });
});

describe('aggregateMonthFlows', () => {
  it('soma actual e planned restante', () => {
    const a = aggregateMonthFlows({
      ym: '2026-07',
      today: '2026-07-28',
      items: [
        { kind: 'income', amountCents: 500_000, status: 'actual', date: '2026-07-05' },
        { kind: 'expense', amountCents: 100_000, status: 'actual', date: '2026-07-10' },
        { kind: 'expense', amountCents: 50_000, status: 'planned', date: '2026-07-30' },
        { kind: 'expense', amountCents: 20_000, status: 'planned', date: '2026-07-20' },
        { kind: 'transfer', amountCents: 10_000, status: 'actual', date: '2026-07-15' },
      ],
    });
    expect(a.actualIncomeCents).toBe(500_000);
    expect(a.actualExpenseCents).toBe(100_000);
    expect(a.plannedExpenseRemainingCents).toBe(50_000);
  });
});

describe('computeMonthSummary', () => {
  it('folga = caixa − previsto − colchão', () => {
    const s = computeMonthSummary({
      ym: '2026-07',
      today: '2026-07-28',
      minimumCents: 100_000,
      cashTodayCents: 500_000,
      cashSource: 'anchor',
      actualIncomeCents: 800_000,
      actualExpenseCents: 200_000,
      plannedExpenseRemainingCents: 50_000,
    });
    expect(s.freeToSpendCents).toBe(350_000);
    expect(s.safeDailyCents).toBe(Math.floor(350_000 / 4));
  });

  it('sem âncora não inventa folga', () => {
    const s = computeMonthSummary({
      ym: '2026-07',
      today: '2026-07-28',
      minimumCents: 0,
      cashTodayCents: 0,
      cashSource: 'none',
      actualIncomeCents: 0,
      actualExpenseCents: 10_000,
      plannedExpenseRemainingCents: 0,
    });
    expect(s.freeToSpendCents).toBeNull();
    expect(s.hasCash).toBe(false);
  });
});

describe('escapeHtml', () => {
  it('escapa &, < e >', () => {
    expect(escapeHtml('a <b> & c')).toBe('a &lt;b&gt; &amp; c');
  });
});

describe('formatSaldoDigest', () => {
  it('pede âncora quando vazio', () => {
    expect(formatSaldoDigest({ totalCents: 0, source: 'none', anchorAsOfDate: null, accounts: [] }))
      .toMatch(/Sem saldo informado/);
  });

  it('lista contas com HTML', () => {
    const text = formatSaldoDigest({
      totalCents: 420_000,
      source: 'anchor',
      anchorAsOfDate: '2026-07-27',
      accounts: [
        { name: 'Nubank', cents: 300_000 },
        { name: 'A & B', cents: 120_000 },
      ],
    });
    expect(text).toContain('<b>Caixa hoje: R$');
    expect(text).toContain('Nubank');
    expect(text).toContain('A &amp; B');
    expect(text).toContain('<i>Âncora em 27/07</i>');
  });
});

describe('formatMesDigest', () => {
  it('mostra folga com âncora em HTML', () => {
    const text = formatMesDigest(
      computeMonthSummary({
        ym: '2026-07',
        today: '2026-07-28',
        minimumCents: 0,
        cashTodayCents: 200_000,
        cashSource: 'anchor',
        actualIncomeCents: 500_000,
        actualExpenseCents: 100_000,
        plannedExpenseRemainingCents: 40_000,
      }),
    );
    expect(text).toMatch(/<b>julho 2026<\/b>/i);
    expect(text).toMatch(/Folga: <b>/);
    expect(text).toMatch(/Cabe ~/);
  });
});

describe('formatCotaDigest', () => {
  it('resume cota e fairness', () => {
    const person: PersonContribution = {
      personId: 'p1',
      shareBps: 5000,
      incomeCents: 1_000_000,
      planIncomeCents: 1_000_000,
      actualIncomeCents: 1_000_000,
      quotaCents: 200_000,
      personalExpenseCents: 80_000,
      paidCasaCents: 250_000,
      fairnessCents: 50_000,
      effectiveBurdenCents: 280_000,
      spendable: {
        remainingCents: 720_000,
        incomeCents: 1_000_000,
        quotaCents: 200_000,
        personalExpenseCents: 80_000,
        goalContributionCents: 0,
        hasIncome: true,
        overBudget: false,
      },
    };
    const text = formatCotaDigest({
      person,
      personName: 'Vitor',
      casaExpenseCents: 400_000,
    });
    expect(text).toContain('<b>Cota de Vitor:');
    expect(text).toContain('50%');
    expect(text).toMatch(/a mais que a cota/);
  });
});

describe('invoice reminders', () => {
  const base = {
    accountId: 'a1',
    accountName: 'Nubank',
    statementMonth: '2026-07',
    dueDate: '2026-07-28',
    totalCents: 150_000,
    coverage: 'unpaid' as const,
  };

  it('seleciona D−3, D0 e D+1', () => {
    const selected = selectInvoiceReminders([
      { ...base, daysUntilDue: 3 },
      { ...base, accountId: 'a2', daysUntilDue: 0 },
      { ...base, accountId: 'a3', daysUntilDue: -1 },
      { ...base, accountId: 'a4', daysUntilDue: 5 },
      { ...base, accountId: 'a5', daysUntilDue: 0, coverage: 'paid' },
    ]);
    expect(selected.map((s) => s.accountId).sort()).toEqual(['a1', 'a2', 'a3']);
  });

  it('formata digest e kind', () => {
    expect(reminderKind(3)).toBe('due_soon');
    expect(reminderKind(0)).toBe('due_today');
    expect(reminderKind(-1)).toBe('overdue');
    const text = formatInvoiceDigest([
      { ...base, daysUntilDue: 0 },
      { ...base, accountId: 'a2', accountName: 'Inter', daysUntilDue: 3, dueDate: '2026-07-31' },
    ]);
    expect(text).toMatch(/<b>Lembrete de fatura:<\/b>/);
    expect(text).toMatch(/vence hoje/);
    expect(text).toMatch(/vence em 3 dias/);
  });
});
