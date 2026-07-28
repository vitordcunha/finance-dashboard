/**
 * Consultas read-only do assistente (/mes, /saldo, /cota) + digest de fatura.
 */
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.75.0';
import {
  accountBalanceAt,
  aggregateMonthFlows,
  buildCotaView,
  cashBalanceAt,
  computeMonthSummary,
  currentYmSaoPaulo,
  diffDays,
  dueDateInMonth,
  expandMonthOccurrences,
  formatCotaDigest,
  formatInvoiceDigest,
  formatMesDigest,
  formatSaldoDigest,
  paymentCoverage,
  reminderKind,
  selectInvoiceReminders,
  todayISOSaoPaulo,
  type ContributionMode,
  type DatedCashTx,
  type InvoiceReminderItem,
} from './assistant.ts';

type LinkLike = {
  household_id: string;
  user_id: string;
  person_id: string | null;
};

const CASH_KINDS = new Set(['checking', 'cash', 'savings']);

async function loadSetting(
  sb: SupabaseClient,
  householdId: string,
  key: string,
): Promise<unknown> {
  const { data } = await sb
    .from('settings')
    .select('value')
    .eq('household_id', householdId)
    .eq('key', key)
    .maybeSingle();
  return data?.value ?? null;
}

function parseContributionMode(raw: unknown): ContributionMode {
  const mode =
    typeof raw === 'string'
      ? raw
      : raw && typeof raw === 'object' && 'mode' in raw
        ? String((raw as { mode: unknown }).mode)
        : null;
  if (mode === 'equal_50' || mode === 'custom' || mode === 'income_share') {
    return mode;
  }
  return 'income_share';
}

function parseMinimumCents(raw: unknown): number {
  if (typeof raw === 'number' && Number.isInteger(raw)) return raw;
  if (
    raw &&
    typeof raw === 'object' &&
    typeof (raw as { cents?: unknown }).cents === 'number'
  ) {
    return (raw as { cents: number }).cents;
  }
  return 0;
}

function parseCustomBps(raw: unknown): Record<string, number> | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof v === 'number' && Number.isInteger(v)) out[k] = v;
  }
  return Object.keys(out).length > 0 ? out : null;
}

async function resolveMePersonId(
  sb: SupabaseClient,
  link: LinkLike,
): Promise<{ personId: string | null; name: string }> {
  const { data: people } = await sb
    .from('people')
    .select('id, name, short_name, user_id')
    .eq('household_id', link.household_id)
    .order('sort');

  const list = people ?? [];
  const me =
    list.find((p) => p.user_id === link.user_id) ??
    list.find((p) => p.id === link.person_id) ??
    null;
  return {
    personId: me?.id ?? null,
    name: me?.short_name || me?.name || 'Você',
  };
}

export async function replySaldo(
  sb: SupabaseClient,
  link: LinkLike,
): Promise<string> {
  const today = todayISOSaoPaulo();
  const { data: accounts } = await sb
    .from('accounts')
    .select('id, name, kind')
    .eq('household_id', link.household_id)
    .eq('archived', false)
    .order('sort');

  const cashAccounts = (accounts ?? []).filter((a) => CASH_KINDS.has(a.kind));
  const cashIds = new Set(cashAccounts.map((a) => a.id));
  if (cashIds.size === 0) {
    return formatSaldoDigest({
      totalCents: 0,
      source: 'none',
      anchorAsOfDate: null,
      accounts: [],
    });
  }

  const { data: balances } = await sb
    .from('account_balances')
    .select('account_id, balance_cents, as_of_date')
    .eq('household_id', link.household_id)
    .in('account_id', [...cashIds])
    .order('as_of_date', { ascending: false });

  const latestByAccount = new Map<
    string,
    { accountId: string; balanceCents: number; asOfDate: string }
  >();
  for (const row of balances ?? []) {
    if (latestByAccount.has(row.account_id)) continue;
    latestByAccount.set(row.account_id, {
      accountId: row.account_id,
      balanceCents: row.balance_cents,
      asOfDate: row.as_of_date,
    });
  }

  const anchors = [...latestByAccount.values()];
  if (anchors.length === 0) {
    return formatSaldoDigest({
      totalCents: 0,
      source: 'none',
      anchorAsOfDate: null,
      accounts: [],
    });
  }

  const minAnchor = anchors.reduce((a, b) =>
    a.asOfDate < b.asOfDate ? a : b,
  ).asOfDate;

  const { data: txs } = await sb
    .from('transactions')
    .select(
      'date, kind, amount_cents, account_id, transfer_account_id, status',
    )
    .eq('household_id', link.household_id)
    .eq('status', 'actual')
    .gt('date', minAnchor)
    .lte('date', today);

  const dated: DatedCashTx[] = (txs ?? []).map((t) => ({
    date: t.date,
    kind: t.kind as DatedCashTx['kind'],
    amountCents: t.amount_cents,
    accountId: t.account_id,
    transferAccountId: t.transfer_account_id,
  }));

  const total = cashBalanceAt({
    anchors,
    transactions: dated,
    date: today,
    cashAccountIds: cashIds,
  });

  const nameById = new Map(cashAccounts.map((a) => [a.id, a.name]));
  const lines = anchors
    .map((a) => ({
      name: nameById.get(a.accountId) ?? 'Conta',
      cents: accountBalanceAt(a, dated, today),
    }))
    .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));

  return formatSaldoDigest({
    totalCents: total.cents,
    source: total.source,
    anchorAsOfDate: total.anchorAsOfDate,
    accounts: lines,
  });
}

export async function replyMes(
  sb: SupabaseClient,
  link: LinkLike,
): Promise<string> {
  const today = todayISOSaoPaulo();
  const ym = currentYmSaoPaulo();
  const monthStart = `${ym}-01`;

  const monthEnd = dueDateInMonth(ym, 31);
  const [minRaw, accountsRes, rowsRes, balancesRes] = await Promise.all([
    loadSetting(sb, link.household_id, 'minimum_balance_cents'),
    sb
      .from('accounts')
      .select('id, kind')
      .eq('household_id', link.household_id)
      .eq('archived', false),
    sb
      .from('transactions')
      .select(
        'id, date, kind, amount_cents, status, recurrence, recurrence_end, series_id, account_id, transfer_account_id',
      )
      .eq('household_id', link.household_id)
      .or(
        `and(date.gte.${monthStart},date.lte.${monthEnd}),recurrence.eq.monthly`,
      ),
    sb
      .from('account_balances')
      .select('account_id, balance_cents, as_of_date')
      .eq('household_id', link.household_id)
      .order('as_of_date', { ascending: false }),
  ]);

  const minimumCents = parseMinimumCents(minRaw);
  const cashIds = new Set(
    (accountsRes.data ?? [])
      .filter((a) => CASH_KINDS.has(a.kind))
      .map((a) => a.id),
  );

  const latestByAccount = new Map<
    string,
    { accountId: string; balanceCents: number; asOfDate: string }
  >();
  for (const row of balancesRes.data ?? []) {
    if (!cashIds.has(row.account_id)) continue;
    if (latestByAccount.has(row.account_id)) continue;
    latestByAccount.set(row.account_id, {
      accountId: row.account_id,
      balanceCents: row.balance_cents,
      asOfDate: row.as_of_date,
    });
  }
  const anchors = [...latestByAccount.values()];

  let cashTodayCents = 0;
  let cashSource: 'anchor' | 'none' = 'none';
  if (anchors.length > 0) {
    const minAnchor = anchors.reduce((a, b) =>
      a.asOfDate < b.asOfDate ? a : b,
    ).asOfDate;
    const { data: cashTxs } = await sb
      .from('transactions')
      .select(
        'date, kind, amount_cents, account_id, transfer_account_id',
      )
      .eq('household_id', link.household_id)
      .eq('status', 'actual')
      .gt('date', minAnchor)
      .lte('date', today);

    const bal = cashBalanceAt({
      anchors,
      transactions: (cashTxs ?? []).map((t) => ({
        date: t.date,
        kind: t.kind as DatedCashTx['kind'],
        amountCents: t.amount_cents,
        accountId: t.account_id,
        transferAccountId: t.transfer_account_id,
      })),
      date: today,
      cashAccountIds: cashIds,
    });
    cashTodayCents = bal.cents;
    cashSource = bal.source;
  }

  const occurrences = expandMonthOccurrences({
    ym,
    rows: (rowsRes.data ?? []).map((r) => ({
      id: r.id,
      date: r.date,
      kind: r.kind as 'income' | 'expense' | 'transfer',
      amountCents: r.amount_cents,
      status: r.status,
      recurrence: r.recurrence ?? 'none',
      recurrenceEnd: r.recurrence_end,
      seriesId: r.series_id,
    })),
  });

  const flows = aggregateMonthFlows({ today, items: occurrences });
  const summary = computeMonthSummary({
    ym,
    today,
    minimumCents,
    cashTodayCents,
    cashSource,
    ...flows,
  });

  return formatMesDigest(summary);
}

export async function replyCota(
  sb: SupabaseClient,
  link: LinkLike,
): Promise<string> {
  const ym = currentYmSaoPaulo();
  const monthStart = `${ym}-01`;
  const { personId, name } = await resolveMePersonId(sb, link);
  if (!personId) {
    return formatCotaDigest({
      person: null,
      personName: name,
      casaExpenseCents: 0,
    });
  }

  const monthEnd = dueDateInMonth(ym, 31);
  const [modeRaw, customRaw, peopleRes, accountsRes, txsRes] =
    await Promise.all([
      loadSetting(sb, link.household_id, 'contribution_mode'),
      loadSetting(sb, link.household_id, 'contribution_custom_bps'),
      sb
        .from('people')
        .select('id')
        .eq('household_id', link.household_id)
        .order('sort'),
      sb
        .from('accounts')
        .select('id, person_id')
        .eq('household_id', link.household_id)
        .eq('archived', false),
      sb
        .from('transactions')
        .select(
          'id, kind, amount_cents, person_id, account_id, status, date, recurrence, recurrence_end, series_id',
        )
        .eq('household_id', link.household_id)
        .or(
          `and(date.gte.${monthStart},date.lte.${monthEnd}),recurrence.eq.monthly`,
        ),
    ]);

  const personIds = (peopleRes.data ?? []).map((p) => p.id);
  const accountOwnerById: Record<string, string | null | undefined> = {};
  for (const a of accountsRes.data ?? []) {
    accountOwnerById[a.id] = a.person_id;
  }

  const incomesByPerson: Record<string, number> = {};
  for (const id of personIds) incomesByPerson[id] = 0;

  const expenses: {
    personId: string | null;
    amountCents: number;
    accountId: string | null;
  }[] = [];

  // Actual do mês.
  for (const r of txsRes.data ?? []) {
    if (r.status !== 'actual' || r.date.slice(0, 7) !== ym) continue;
    if (r.kind === 'income' && r.person_id) {
      incomesByPerson[r.person_id] =
        (incomesByPerson[r.person_id] ?? 0) + r.amount_cents;
    }
    if (r.kind === 'expense') {
      expenses.push({
        personId: r.person_id,
        amountCents: r.amount_cents,
        accountId: r.account_id,
      });
    }
  }

  // Sem renda realizada → planned / série mensal como base do share.
  const totalIncome = Object.values(incomesByPerson).reduce((a, b) => a + b, 0);
  if (totalIncome <= 0) {
    const claimedIncomeMonths = new Set<string>();
    for (const r of txsRes.data ?? []) {
      if (r.series_id && r.kind === 'income') {
        claimedIncomeMonths.add(`${r.series_id}:${r.date.slice(0, 7)}`);
      }
    }
    for (const r of txsRes.data ?? []) {
      if (r.kind !== 'income' || !r.person_id || r.status === 'skipped') {
        continue;
      }
      if (r.status === 'planned' && r.date.slice(0, 7) === ym) {
        incomesByPerson[r.person_id] =
          (incomesByPerson[r.person_id] ?? 0) + r.amount_cents;
        continue;
      }
      if (r.recurrence === 'monthly') {
        const start = r.date.slice(0, 7);
        const end = r.recurrence_end?.slice(0, 7) ?? null;
        if (ym < start || (end && ym > end)) continue;
        if (claimedIncomeMonths.has(`${r.id}:${ym}`)) continue;
        incomesByPerson[r.person_id] =
          (incomesByPerson[r.person_id] ?? 0) + r.amount_cents;
      }
    }
  }

  const view = buildCotaView({
    mode: parseContributionMode(modeRaw),
    personIds,
    mePersonId: personId,
    customBps: parseCustomBps(customRaw),
    incomesByPerson,
    expenses,
    accountOwnerById,
  });

  return formatCotaDigest({
    person: view.person,
    personName: name,
    casaExpenseCents: view.casaExpenseCents,
  });
}

export async function runInvoiceDigest(
  sb: SupabaseClient,
  send: (chatId: number, text: string) => Promise<unknown>,
): Promise<{ households: number; messages: number; skipped: number }> {
  const today = todayISOSaoPaulo();
  const ym = currentYmSaoPaulo();

  const { data: links } = await sb
    .from('telegram_links')
    .select('household_id, telegram_chat_id')
    .is('revoked_at', null);

  if (!links?.length) {
    return { households: 0, messages: 0, skipped: 0 };
  }

  const byHousehold = new Map<string, number[]>();
  for (const link of links) {
    const chats = byHousehold.get(link.household_id) ?? [];
    if (!chats.includes(link.telegram_chat_id)) {
      chats.push(link.telegram_chat_id);
    }
    byHousehold.set(link.household_id, chats);
  }

  let messages = 0;
  let skipped = 0;

  for (const [householdId, chatIds] of byHousehold) {
    const reminders = await loadHouseholdInvoiceReminders(
      sb,
      householdId,
      ym,
      today,
    );
    if (reminders.length === 0) continue;

    // Idempotência: filtrar os já enviados hoje
    const pending: InvoiceReminderItem[] = [];
    for (const item of reminders) {
      const kind = reminderKind(item.daysUntilDue);
      const { data: existing } = await sb
        .from('telegram_digest_log')
        .select('id')
        .eq('household_id', householdId)
        .eq('account_id', item.accountId)
        .eq('statement_month', item.statementMonth)
        .eq('kind', kind)
        .eq('sent_on', today)
        .maybeSingle();
      if (existing) {
        skipped += 1;
        continue;
      }
      pending.push(item);
    }

    if (pending.length === 0) continue;

    const text = formatInvoiceDigest(pending);
    // Um chat por household (o primeiro) — anti-spam
    const chatId = chatIds[0]!;
    await send(chatId, text);
    messages += 1;

    for (const item of pending) {
      const kind = reminderKind(item.daysUntilDue);
      await sb.from('telegram_digest_log').upsert(
        {
          household_id: householdId,
          account_id: item.accountId,
          statement_month: item.statementMonth,
          kind,
          sent_on: today,
        },
        {
          onConflict:
            'household_id,account_id,statement_month,kind,sent_on',
          ignoreDuplicates: true,
        },
      );
    }
  }

  return {
    households: byHousehold.size,
    messages,
    skipped,
  };
}

async function loadHouseholdInvoiceReminders(
  sb: SupabaseClient,
  householdId: string,
  ym: string,
  today: string,
): Promise<InvoiceReminderItem[]> {
  const { data: accounts } = await sb
    .from('accounts')
    .select('id, name, kind, due_day')
    .eq('household_id', householdId)
    .eq('archived', false)
    .eq('kind', 'credit');

  if (!accounts?.length) return [];

  const accountIds = accounts.map((a) => a.id);
  const { data: statements } = await sb
    .from('statements')
    .select('account_id, month, total_cents, due_date')
    .in('account_id', accountIds)
    .eq('month', ym);

  const { data: payments } = await sb
    .from('statement_payments')
    .select('statement_account_id, statement_month, amount_cents')
    .in('statement_account_id', accountIds)
    .eq('statement_month', ym);

  const paidByKey = new Map<string, number>();
  for (const p of payments ?? []) {
    const key = `${p.statement_account_id}:${p.statement_month}`;
    paidByKey.set(key, (paidByKey.get(key) ?? 0) + p.amount_cents);
  }

  const stmtByAccount = new Map(
    (statements ?? []).map((s) => [s.account_id, s]),
  );

  const items: InvoiceReminderItem[] = [];
  for (const acc of accounts) {
    const stmt = stmtByAccount.get(acc.id);
    const dueDate =
      stmt?.due_date ??
      (acc.due_day != null ? dueDateInMonth(ym, acc.due_day) : null);
    if (!dueDate) continue;

    const paid = paidByKey.get(`${acc.id}:${ym}`) ?? 0;
    const total = stmt?.total_cents ?? null;
    const coverage = paymentCoverage(total, paid);
    const daysUntilDue = diffDays(dueDate, today);

    items.push({
      accountId: acc.id,
      accountName: acc.name,
      statementMonth: ym,
      dueDate,
      totalCents: total,
      coverage,
      daysUntilDue,
    });
  }

  return selectInvoiceReminders(items);
}
