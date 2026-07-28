/**
 * Digest do assistente Telegram — espelho de src/core/assistant/.
 * Manter alinhado com os testes Vitest em src/core/assistant/assistant.test.ts.
 */
import { formatBRL } from './money.ts';

// ── month summary ────────────────────────────────────────────────────────────

export type MonthSummary = {
  ym: string;
  hasCash: boolean;
  cashTodayCents: number;
  actualIncomeCents: number;
  actualExpenseCents: number;
  plannedExpenseRemainingCents: number;
  minimumCents: number;
  freeToSpendCents: number | null;
  daysLeft: number;
  safeDailyCents: number | null;
};

function daysInMonth(ym: string): number {
  const [y, m] = ym.split('-').map(Number);
  return new Date(y!, m!, 0).getDate();
}

export function daysLeftInMonth(ym: string, today: string): number {
  if (!today.startsWith(ym)) {
    return today < `${ym}-01` ? daysInMonth(ym) : 0;
  }
  const day = Number(today.slice(8, 10));
  return Math.max(0, daysInMonth(ym) - day + 1);
}

export function computeMonthSummary(input: {
  ym: string;
  today: string;
  minimumCents: number;
  cashTodayCents: number;
  cashSource: 'anchor' | 'none';
  actualIncomeCents: number;
  actualExpenseCents: number;
  plannedExpenseRemainingCents: number;
}): MonthSummary {
  const daysLeft = daysLeftInMonth(input.ym, input.today);
  const hasCash = input.cashSource === 'anchor';
  const freeToSpendCents = hasCash
    ? input.cashTodayCents -
      input.plannedExpenseRemainingCents -
      input.minimumCents
    : null;
  const safeDailyCents =
    freeToSpendCents != null && daysLeft > 0
      ? Math.floor(freeToSpendCents / daysLeft)
      : null;

  return {
    ym: input.ym,
    hasCash,
    cashTodayCents: input.cashTodayCents,
    actualIncomeCents: input.actualIncomeCents,
    actualExpenseCents: input.actualExpenseCents,
    plannedExpenseRemainingCents: input.plannedExpenseRemainingCents,
    minimumCents: input.minimumCents,
    freeToSpendCents,
    daysLeft,
    safeDailyCents,
  };
}

export function aggregateMonthFlows(input: {
  today: string;
  items: ReadonlyArray<{
    kind: 'income' | 'expense' | 'transfer';
    amountCents: number;
    status: 'actual' | 'planned';
    date: string;
  }>;
}): {
  actualIncomeCents: number;
  actualExpenseCents: number;
  plannedExpenseRemainingCents: number;
} {
  let actualIncomeCents = 0;
  let actualExpenseCents = 0;
  let plannedExpenseRemainingCents = 0;

  for (const item of input.items) {
    if (item.kind === 'transfer') continue;
    if (item.status === 'actual') {
      if (item.kind === 'income') actualIncomeCents += item.amountCents;
      else actualExpenseCents += item.amountCents;
      continue;
    }
    if (item.kind === 'expense' && item.date >= input.today) {
      plannedExpenseRemainingCents += item.amountCents;
    }
  }

  return {
    actualIncomeCents,
    actualExpenseCents,
    plannedExpenseRemainingCents,
  };
}

// ── cash balance (espelho de core/cashflow/balance-at) ────────────────────────

export type DatedCashTx = {
  date: string;
  kind: 'income' | 'expense' | 'transfer';
  amountCents: number;
  accountId?: string | null;
  transferAccountId?: string | null;
};

export type AccountAnchor = {
  accountId: string;
  balanceCents: number;
  asOfDate: string;
};

function accountDelta(tx: DatedCashTx, accountId: string): number {
  let delta = 0;
  if (tx.accountId === accountId) {
    if (tx.kind === 'income') delta += tx.amountCents;
    else delta -= tx.amountCents;
  }
  if (tx.kind === 'transfer' && tx.transferAccountId === accountId) {
    delta += tx.amountCents;
  }
  return delta;
}

function deltaBetween(
  transactions: ReadonlyArray<DatedCashTx>,
  anchor: AccountAnchor,
  date: string,
): number {
  if (date === anchor.asOfDate) return 0;
  const forward = date > anchor.asOfDate;
  const from = forward ? anchor.asOfDate : date;
  const to = forward ? date : anchor.asOfDate;
  let delta = 0;
  for (const tx of transactions) {
    if (tx.date <= from || tx.date > to) continue;
    delta += accountDelta(tx, anchor.accountId);
  }
  return forward ? delta : -delta;
}

export function cashBalanceAt(input: {
  anchors: ReadonlyArray<AccountAnchor>;
  transactions: ReadonlyArray<DatedCashTx>;
  date: string;
  cashAccountIds?: ReadonlySet<string> | null;
}): {
  cents: number;
  source: 'anchor' | 'none';
  anchoredAccountIds: string[];
  anchorAsOfDate: string | null;
} {
  const usable = input.cashAccountIds
    ? input.anchors.filter((a) => input.cashAccountIds!.has(a.accountId))
    : [...input.anchors];

  if (usable.length === 0) {
    return {
      cents: 0,
      source: 'none',
      anchoredAccountIds: [],
      anchorAsOfDate: null,
    };
  }

  let total = 0;
  let latestAnchorDate: string | null = null;
  for (const anchor of usable) {
    total += anchor.balanceCents + deltaBetween(input.transactions, anchor, input.date);
    if (latestAnchorDate == null || anchor.asOfDate > latestAnchorDate) {
      latestAnchorDate = anchor.asOfDate;
    }
  }

  return {
    cents: total,
    source: 'anchor',
    anchoredAccountIds: usable.map((a) => a.accountId),
    anchorAsOfDate: latestAnchorDate,
  };
}

export function accountBalanceAt(
  anchor: AccountAnchor,
  transactions: ReadonlyArray<DatedCashTx>,
  date: string,
): number {
  return anchor.balanceCents + deltaBetween(transactions, anchor, date);
}

// ── contribution (espelho mínimo) ────────────────────────────────────────────

const BPS_TOTAL = 10_000;

export type ContributionMode = 'income_share' | 'equal_50' | 'custom';

function allocateByWeights(
  personIds: string[],
  weights: number[],
  total: number,
): Record<string, number> {
  if (personIds.length === 0) return {};
  if (personIds.length === 1) return { [personIds[0]!]: total };

  const weightSum = weights.reduce((a, b) => a + b, 0);
  if (weightSum <= 0) {
    const base = Math.floor(total / personIds.length);
    const out: Record<string, number> = {};
    let used = 0;
    for (let i = 0; i < personIds.length; i++) {
      const v = i === personIds.length - 1 ? total - used : base;
      out[personIds[i]!] = v;
      used += v;
    }
    return out;
  }

  const floors: number[] = [];
  const frac: { i: number; rem: number }[] = [];
  let allocated = 0;
  for (let i = 0; i < personIds.length; i++) {
    const exact = (total * weights[i]!) / weightSum;
    const floor = Math.floor(exact);
    floors.push(floor);
    allocated += floor;
    frac.push({ i, rem: exact - floor });
  }
  let left = total - allocated;
  frac.sort((a, b) => b.rem - a.rem || a.i - b.i);
  for (const { i } of frac) {
    if (left <= 0) break;
    floors[i]! += 1;
    left -= 1;
  }
  const out: Record<string, number> = {};
  for (let i = 0; i < personIds.length; i++) {
    out[personIds[i]!] = floors[i]!;
  }
  return out;
}

function computeShareBps(input: {
  mode: ContributionMode;
  personIds: string[];
  incomesByPerson: Record<string, number>;
  customBps?: Record<string, number> | null;
}): Record<string, number> {
  const { mode, personIds, incomesByPerson, customBps } = input;
  if (personIds.length === 0) return {};

  if (mode === 'equal_50') {
    return allocateByWeights(
      personIds,
      personIds.map(() => 1),
      BPS_TOTAL,
    );
  }

  if (mode === 'custom' && customBps) {
    let sum = 0;
    let ok = true;
    for (const id of personIds) {
      const v = customBps[id];
      if (v === undefined || !Number.isInteger(v) || v < 0) {
        ok = false;
        break;
      }
      sum += v;
    }
    if (ok && sum === BPS_TOTAL) {
      const shares: Record<string, number> = {};
      for (const id of personIds) shares[id] = customBps[id]!;
      return shares;
    }
  }

  const weights = personIds.map((id) => Math.max(0, incomesByPerson[id] ?? 0));
  if (weights.reduce((a, b) => a + b, 0) <= 0) {
    return allocateByWeights(
      personIds,
      personIds.map(() => 1),
      BPS_TOTAL,
    );
  }
  return allocateByWeights(personIds, weights, BPS_TOTAL);
}

export type CotaPersonView = {
  personId: string;
  shareBps: number;
  quotaCents: number;
  personalExpenseCents: number;
  paidCasaCents: number;
  fairnessCents: number;
  spendableRemainingCents: number;
  incomeCents: number;
};

export function buildCotaView(input: {
  mode: ContributionMode;
  personIds: string[];
  mePersonId: string;
  customBps?: Record<string, number> | null;
  /** Renda por pessoa (já resolvida). */
  incomesByPerson: Record<string, number>;
  expenses: {
    personId: string | null;
    amountCents: number;
    accountId: string | null;
  }[];
  accountOwnerById: Record<string, string | null | undefined>;
}): {
  casaExpenseCents: number;
  person: CotaPersonView | null;
} {
  const shares = computeShareBps({
    mode: input.mode,
    personIds: input.personIds,
    incomesByPerson: input.incomesByPerson,
    customBps: input.customBps,
  });

  const casaExpenseCents = input.expenses
    .filter((e) => e.personId === null)
    .reduce((s, e) => s + e.amountCents, 0);

  const quotas = allocateByWeights(
    input.personIds,
    input.personIds.map((id) => shares[id] ?? 0),
    casaExpenseCents,
  );

  const personId = input.mePersonId;
  if (!input.personIds.includes(personId)) {
    return { casaExpenseCents, person: null };
  }

  const personalExpenseCents = input.expenses
    .filter((e) => e.personId === personId)
    .reduce((s, e) => s + e.amountCents, 0);

  let paidCasaCents = 0;
  for (const e of input.expenses) {
    if (e.personId !== null || !e.accountId) continue;
    if (input.accountOwnerById[e.accountId] === personId) {
      paidCasaCents += e.amountCents;
    }
  }

  const quotaCents = quotas[personId] ?? 0;
  const incomeCents = input.incomesByPerson[personId] ?? 0;
  const fairnessCents = paidCasaCents - quotaCents;
  const spendableRemainingCents =
    incomeCents - quotaCents - personalExpenseCents;

  return {
    casaExpenseCents,
    person: {
      personId,
      shareBps: shares[personId] ?? 0,
      quotaCents,
      personalExpenseCents,
      paidCasaCents,
      fairnessCents,
      spendableRemainingCents,
      incomeCents,
    },
  };
}

// ── payment coverage ─────────────────────────────────────────────────────────

export type PaymentCoverage = 'unpaid' | 'partial' | 'paid';

export function paymentCoverage(
  statementTotalCents: number | null | undefined,
  paidSumCents: number,
): PaymentCoverage {
  if (statementTotalCents == null || statementTotalCents <= 0) {
    return paidSumCents > 0 ? 'partial' : 'unpaid';
  }
  if (paidSumCents <= 0) return 'unpaid';
  if (paidSumCents >= statementTotalCents) return 'paid';
  return 'partial';
}

// ── formatters ───────────────────────────────────────────────────────────────

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
  return Number.isInteger(pct)
    ? `${pct}%`
    : `${pct.toFixed(1).replace('.', ',')}%`;
}

function formatDay(iso: string): string {
  const d = Number(iso.slice(8, 10));
  const m = Number(iso.slice(5, 7));
  return `${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}`;
}

export function formatSaldoDigest(input: {
  totalCents: number;
  source: 'anchor' | 'none';
  anchorAsOfDate: string | null;
  accounts: { name: string; cents: number }[];
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
  person: CotaPersonView | null;
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
    `Pessoal: ${formatBRL(person.personalExpenseCents)} · sobra Eu: ${formatBRL(person.spendableRemainingCents)}`,
  ].join('\n');
}

export type InvoiceReminderItem = {
  accountId: string;
  accountName: string;
  statementMonth: string;
  dueDate: string;
  totalCents: number | null;
  coverage: PaymentCoverage;
  daysUntilDue: number;
};

export function selectInvoiceReminders(
  items: ReadonlyArray<InvoiceReminderItem>,
  opts?: { offsets?: number[] },
): InvoiceReminderItem[] {
  const offsets = new Set(opts?.offsets ?? [3, 0, -1]);
  return items.filter(
    (i) => i.coverage !== 'paid' && offsets.has(i.daysUntilDue),
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

/** Dia de vencimento no mês (clamp no último dia). */
export function dueDateInMonth(ym: string, dueDay: number): string {
  const dim = daysInMonth(ym);
  const day = Math.min(Math.max(1, dueDay), dim);
  return `${ym}-${String(day).padStart(2, '0')}`;
}

/** Diferença em dias civis (a − b), datas yyyy-MM-dd. */
export function diffDays(a: string, b: string): number {
  const ms =
    Date.parse(`${a}T12:00:00Z`) - Date.parse(`${b}T12:00:00Z`);
  return Math.round(ms / 86_400_000);
}

export function todayISOSaoPaulo(now = new Date()): string {
  // en-CA → yyyy-MM-dd
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

export function currentYmSaoPaulo(now = new Date()): string {
  return todayISOSaoPaulo(now).slice(0, 7);
}

/** Expansão mínima de série só para o mês corrente. */
export function expandMonthOccurrences(input: {
  ym: string;
  rows: ReadonlyArray<{
    id: string;
    date: string;
    kind: 'income' | 'expense' | 'transfer';
    amountCents: number;
    status: string;
    recurrence: string;
    recurrenceEnd: string | null;
    seriesId: string | null;
  }>;
}): Array<{
  kind: 'income' | 'expense' | 'transfer';
  amountCents: number;
  status: 'actual' | 'planned';
  date: string;
}> {
  const { ym, rows } = input;
  const claimed = new Map<string, Set<string>>();
  for (const row of rows) {
    if (!row.seriesId) continue;
    const set = claimed.get(row.seriesId) ?? new Set<string>();
    set.add(row.date.slice(0, 7));
    claimed.set(row.seriesId, set);
  }

  const out: Array<{
    kind: 'income' | 'expense' | 'transfer';
    amountCents: number;
    status: 'actual' | 'planned';
    date: string;
  }> = [];

  for (const row of rows) {
    if (row.status === 'skipped') continue;
    if (row.recurrence !== 'none') continue;
    if (row.date.slice(0, 7) !== ym) continue;
    out.push({
      kind: row.kind,
      amountCents: row.amountCents,
      status: row.status === 'planned' ? 'planned' : 'actual',
      date: row.date,
    });
  }

  for (const template of rows) {
    if (template.recurrence !== 'monthly') continue;
    const startYm = template.date.slice(0, 7);
    if (ym < startYm) continue;
    if (template.recurrenceEnd && ym > template.recurrenceEnd.slice(0, 7)) {
      continue;
    }
    const seriesClaimed = claimed.get(template.id);
    if (seriesClaimed?.has(ym)) continue;

    const day = Number(template.date.slice(8, 10));
    const date = dueDateInMonth(ym, day);
    if (template.recurrenceEnd && date > template.recurrenceEnd) continue;

    out.push({
      kind: template.kind,
      amountCents: template.amountCents,
      status: 'planned',
      date,
    });
  }

  return out;
}
