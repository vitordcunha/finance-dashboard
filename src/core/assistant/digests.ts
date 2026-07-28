import { formatBRL } from '@/core/money';
import type { MonthSummary } from '@/core/assistant/month-summary';
import type { PersonContribution } from '@/core/contribution';
import type { PaymentCoverage } from '@/core/reconcile/invoice-gap';

/** Escape para Telegram parse_mode HTML. */
export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function monthLabel(ym: string): string {
  const [y, m] = ym.split('-').map(Number);
  const names = [
    'janeiro',
    'fevereiro',
    'março',
    'abril',
    'maio',
    'junho',
    'julho',
    'agosto',
    'setembro',
    'outubro',
    'novembro',
    'dezembro',
  ];
  return `${names[(m ?? 1) - 1]} ${y}`;
}

function pctFromBps(bps: number): string {
  const pct = bps / 100;
  return Number.isInteger(pct) ? `${pct}%` : `${pct.toFixed(1).replace('.', ',')}%`;
}

function formatDay(iso: string): string {
  const d = Number(iso.slice(8, 10));
  const m = Number(iso.slice(5, 7));
  return `${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}`;
}

export type SaldoAccountLine = {
  name: string;
  cents: number;
};

export function formatSaldoDigest(input: {
  totalCents: number;
  source: 'anchor' | 'none';
  anchorAsOfDate: string | null;
  accounts: SaldoAccountLine[];
}): string {
  if (input.source === 'none' || input.accounts.length === 0) {
    return [
      'Sem saldo informado.',
      'No app: Mais → Saldos — registre o saldo real das contas.',
    ].join('\n');
  }

  const lines = [
    `<b>Caixa hoje: ${formatBRL(input.totalCents)}</b>`,
    ...input.accounts.map(
      (a) => `• ${escapeHtml(a.name)} — ${formatBRL(a.cents)}`,
    ),
  ];
  if (input.anchorAsOfDate) {
    lines.push(`<i>Âncora em ${formatDay(input.anchorAsOfDate)}</i>`);
  }
  return lines.join('\n');
}

export function formatMesDigest(summary: MonthSummary): string {
  const title = `<b>${monthLabel(summary.ym)}</b>`;
  if (!summary.hasCash || summary.freeToSpendCents == null) {
    return [
      title,
      `Entradas: ${formatBRL(summary.actualIncomeCents)}`,
      `Saídas: ${formatBRL(summary.actualExpenseCents)}`,
      summary.plannedExpenseRemainingCents > 0
        ? `Ainda previsto: ${formatBRL(summary.plannedExpenseRemainingCents)}`
        : null,
      'Sem saldo de caixa — informe âncora no app para ver a folga.',
    ]
      .filter(Boolean)
      .join('\n');
  }

  const free = summary.freeToSpendCents;
  const freeLine =
    free < 0
      ? `Folga: <b>${formatBRL(free)}</b> (no aperto)`
      : `Folga: <b>${formatBRL(free)}</b>`;

  const lines = [
    title,
    freeLine,
    `Saídas no mês: ${formatBRL(summary.actualExpenseCents)} · entradas: ${formatBRL(summary.actualIncomeCents)}`,
  ];
  if (summary.plannedExpenseRemainingCents > 0) {
    lines.push(
      `Ainda previsto: ${formatBRL(summary.plannedExpenseRemainingCents)}`,
    );
  }
  if (summary.safeDailyCents != null && summary.daysLeft > 0) {
    lines.push(
      `Cabe ~${formatBRL(summary.safeDailyCents)}/dia (${summary.daysLeft} dias)`,
    );
  }
  if (summary.minimumCents > 0) {
    lines.push(`Colchão: ${formatBRL(summary.minimumCents)}`);
  }
  return lines.join('\n');
}

export function formatCotaDigest(input: {
  person: PersonContribution | null;
  personName: string;
  casaExpenseCents: number;
}): string {
  const { person, personName, casaExpenseCents } = input;
  if (!person) {
    return 'Não achei sua pessoa no household. Vincule de novo em Configurações → Telegram.';
  }

  const fairness =
    person.fairnessCents === 0
      ? 'Na cota'
      : person.fairnessCents > 0
        ? `${formatBRL(person.fairnessCents)} a mais que a cota`
        : `${formatBRL(Math.abs(person.fairnessCents))} a menos que a cota`;

  return [
    `<b>Cota de ${escapeHtml(personName)}: ${formatBRL(person.quotaCents)}</b> (${pctFromBps(person.shareBps)})`,
    `Gastos Casa no mês: ${formatBRL(casaExpenseCents)}`,
    `Você pagou de Casa: ${formatBRL(person.paidCasaCents)} → ${fairness}`,
    `Pessoal: ${formatBRL(person.personalExpenseCents)} · sobra Eu: ${formatBRL(person.spendable.remainingCents)}`,
  ].join('\n');
}

export type InvoiceReminderItem = {
  accountId: string;
  accountName: string;
  statementMonth: string;
  dueDate: string;
  totalCents: number | null;
  coverage: PaymentCoverage;
  /** Dias até o vencimento (negativo = atrasado). */
  daysUntilDue: number;
};

/** Lembretes em D−3, D0 e D+1 (atraso de ontem). */
export function selectInvoiceReminders(
  items: ReadonlyArray<InvoiceReminderItem>,
  opts?: { offsets?: number[] },
): InvoiceReminderItem[] {
  const offsets = new Set(opts?.offsets ?? [3, 0, -1]);
  return items.filter(
    (i) =>
      i.coverage !== 'paid' &&
      offsets.has(i.daysUntilDue),
  );
}

export function reminderKind(
  daysUntilDue: number,
): 'due_soon' | 'due_today' | 'overdue' {
  if (daysUntilDue < 0) return 'overdue';
  if (daysUntilDue === 0) return 'due_today';
  return 'due_soon';
}

export function formatInvoiceDigest(
  items: ReadonlyArray<InvoiceReminderItem>,
): string {
  if (items.length === 0) return '';

  const lines = ['<b>Lembrete de fatura:</b>'];
  for (const item of items) {
    const value =
      item.totalCents != null && item.totalCents > 0
        ? formatBRL(item.totalCents)
        : 'sem valor';
    const status =
      item.coverage === 'partial'
        ? 'parcial'
        : item.coverage === 'unpaid'
          ? 'em aberto'
          : 'paga';
    let when: string;
    if (item.daysUntilDue < 0) {
      when =
        item.daysUntilDue === -1
          ? 'venceu ontem'
          : `venceu há ${Math.abs(item.daysUntilDue)} dias`;
    } else if (item.daysUntilDue === 0) {
      when = 'vence hoje';
    } else {
      when = `vence em ${item.daysUntilDue} dias (${formatDay(item.dueDate)})`;
    }
    lines.push(
      `• ${escapeHtml(item.accountName)} · ${value} · ${when} · ${status}`,
    );
  }
  return lines.join('\n');
}
