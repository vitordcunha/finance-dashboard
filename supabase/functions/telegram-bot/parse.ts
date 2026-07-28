const AMOUNT =
  String.raw`(R\$\s*)?(\d{1,3}(?:\.\d{3})*(?:,\d{1,2})?|\d+(?:[.,]\d{1,2})?)`;

const VERB_INCOME = /^(recebi|ganhei|entrou)\s+/i;
const VERB_EXPENSE = /^(gastei|paguei|comprei|saiu)\s+/i;

export type LineItem = {
  description: string;
  amountRaw: string;
};

export type CaptureDraft = {
  kind: 'expense' | 'income' | 'transfer';
  amountRaw: string;
  description: string;
  date?: string;
  personHint?: string | null;
  accountHint?: string | null;
  transferAccountHint?: string | null;
  categoryHint?: string | null;
  notes?: string | null;
  installments?: number;
  lineItems?: LineItem[] | null;
  confidence: number;
  warnings: string[];
};

export type ResolvedDraft = CaptureDraft & {
  amountCents: number;
  accountId: string | null;
  personId: string | null;
  categoryId: string | null;
  transferAccountId: string | null;
  telegramMessageId?: number;
  /** file_id Telegram para reextrair itens. */
  mediaFileId?: string;
  mediaKind?: 'photo' | 'pdf' | 'image';
  /** Usuário pediu gravar pelos itens do cupom. */
  useLineItems?: boolean;
  /** Grupo de parcelas após confirmar. */
  installmentGroup?: string;
};

/** Parse barato — espelho de src/core/capture/cheap-parse.ts */
export function cheapParseMessage(raw: string): CaptureDraft | null {
  const text = raw.trim().replace(/\s+/g, ' ');
  if (!text) return null;

  const transfer = parseTransfer(text);
  if (transfer) return transfer;

  const { date, rest: withoutDate } = extractDate(text);
  let kind: CaptureDraft['kind'] = 'expense';
  let rest = withoutDate;
  let personHint: string | null = null;

  const cmd = rest.match(
    /^\/?(saida|saída|gasto|despesa|entrada|receita|income|expense)\s+(.+)$/i,
  );
  if (cmd) {
    const verb = cmd[1]!.toLowerCase().normalize('NFD').replace(/\p{M}/gu, '');
    if (verb === 'entrada' || verb === 'receita' || verb === 'income') {
      kind = 'income';
    }
    rest = cmd[2]!;
  } else {
    const whoCmd = rest.match(/^\/?(casa|eu)\s+(.+)$/i);
    if (whoCmd) {
      personHint = whoCmd[1]!.toLowerCase();
      rest = whoCmd[2]!;
    }
  }

  if (personHint == null) {
    const who = rest.match(/^(casa|eu)\s+(.+)$/i);
    if (who) {
      personHint = who[1]!.toLowerCase();
      rest = who[2]!;
    }
  }

  if (VERB_INCOME.test(rest)) {
    kind = 'income';
    rest = rest.replace(VERB_INCOME, '');
  } else if (VERB_EXPENSE.test(rest)) {
    kind = 'expense';
    rest = rest.replace(VERB_EXPENSE, '');
  }

  const { installments, rest: withoutInst } = extractInstallments(rest);
  const parsed = parseAmountDescription(withoutInst);
  if (!parsed) return null;

  return {
    kind,
    amountRaw: parsed.amountRaw,
    description: parsed.description.slice(0, 200),
    date,
    personHint,
    installments,
    confidence: 0.95,
    warnings: [],
  };
}

function parseTransfer(text: string): CaptureDraft | null {
  const { date, rest: withoutDate } = extractDate(text);
  const m = withoutDate.match(
    new RegExp(
      `^\\/?(transferir|transf|transferencia|transferência)\\s+${AMOUNT}\\s+(.+)$`,
      'i',
    ),
  );
  if (!m) return null;

  const amountRaw = m[3]!;
  let rest = m[4]!.trim();
  let from: string | null = null;
  let to: string | null = null;

  const arrow = rest.match(/^(.+?)\s+(?:->|→|pra|para|pro)\s+(.+)$/i);
  if (arrow) {
    from = arrow[1]!.trim();
    to = arrow[2]!.trim();
  } else {
    const parts = rest.split(/\s+/);
    if (parts.length >= 2) {
      from = parts[0]!;
      to = parts.slice(1).join(' ');
    }
  }
  if (!from || !to) return null;

  return {
    kind: 'transfer',
    amountRaw,
    description: `Transferência ${from} → ${to}`.slice(0, 200),
    date,
    accountHint: from,
    transferAccountHint: to,
    confidence: 0.95,
    warnings: [],
  };
}

export function extractInstallments(text: string): {
  installments: number | undefined;
  rest: string;
} {
  const m = text.match(/\s+(?:em\s+)?(\d{1,2})\s*(?:x|×|vezes)\s*$/i);
  if (!m) return { installments: undefined, rest: text };
  const n = Number(m[1]);
  if (n < 2 || n > 48) return { installments: undefined, rest: text };
  return {
    installments: n,
    rest: text.slice(0, m.index).trim(),
  };
}

function parseAmountDescription(
  rest: string,
): { amountRaw: string; description: string } | null {
  const amountFirst = rest.match(new RegExp(`^${AMOUNT}\\s+(.+)$`, 'i'));
  if (amountFirst) {
    const amountRaw = amountFirst[2]!;
    const description = amountFirst[3]!.trim();
    if (description) return { amountRaw, description };
  }

  const amountLast = rest.match(new RegExp(`^(.+?)\\s+${AMOUNT}$`, 'i'));
  if (amountLast) {
    const description = amountLast[1]!.trim();
    const amountRaw = amountLast[3]!;
    if (description && !/^\d/.test(description)) {
      return { amountRaw, description };
    }
  }

  return null;
}

export function extractDate(text: string): {
  date: string | undefined;
  rest: string;
} {
  let rest = text;
  let date: string | undefined;

  const rel = rest.match(/\b(hoje|ontem|anteontem)\b/i);
  if (rel) {
    const word = rel[1]!.toLowerCase();
    const offset = word === 'hoje' ? 0 : word === 'ontem' ? -1 : -2;
    date = isoDateOffset(offset);
    rest = rest.replace(rel[0], ' ').replace(/\s+/g, ' ').trim();
  } else {
    const dayOnly = rest.match(/\bdia\s+(\d{1,2})\b/i);
    if (dayOnly) {
      const day = Number(dayOnly[1]);
      if (day >= 1 && day <= 31) {
        date = isoDateWithDay(day);
        rest = rest.replace(dayOnly[0], ' ').replace(/\s+/g, ' ').trim();
      }
    }
  }

  return { date, rest };
}

export function isoDateOffset(dayOffset: number, tzOffsetMinutes = -180): string {
  const d = new Date(Date.now() + tzOffsetMinutes * 60_000);
  d.setUTCDate(d.getUTCDate() + dayOffset);
  return d.toISOString().slice(0, 10);
}

function isoDateWithDay(day: number, tzOffsetMinutes = -180): string {
  const d = new Date(Date.now() + tzOffsetMinutes * 60_000);
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth();
  const last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  const safeDay = Math.min(day, last);
  return `${y}-${String(m + 1).padStart(2, '0')}-${String(safeDay).padStart(2, '0')}`;
}

function norm(s: string): string {
  return s
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .trim();
}

export function resolvePersonHint(
  hint: string | null | undefined,
  people: { id: string; name: string; short_name: string }[],
  mePersonId: string | null,
  linkDefaultPersonId: string | null,
): string | null {
  if (hint == null || hint === '') return linkDefaultPersonId;
  const h = norm(hint);
  if (h === 'casa' || h === 'house' || h === 'lar') return null;
  if (h === 'eu' || h === 'me' || h === 'mim') return mePersonId ?? linkDefaultPersonId;

  for (const p of people) {
    if (norm(p.short_name) === h || norm(p.name) === h) return p.id;
  }
  for (const p of people) {
    if (norm(p.name).includes(h) || norm(p.short_name).includes(h)) return p.id;
  }
  return linkDefaultPersonId;
}

export function resolveAccountHint(
  hint: string | null | undefined,
  accounts: { id: string; name: string }[],
  fallbackId: string | null,
): string | null {
  if (!hint) return fallbackId;
  const h = norm(hint);
  for (const a of accounts) {
    if (norm(a.name) === h) return a.id;
  }
  for (const a of accounts) {
    if (norm(a.name).includes(h) || h.includes(norm(a.name))) return a.id;
  }
  return fallbackId;
}

export function resolveCategoryHint(
  hint: string | null | undefined,
  categories: { id: string; name: string; kind: string }[],
  kind: CaptureDraft['kind'],
): string | null {
  if (!hint || kind === 'transfer') return null;
  const h = norm(hint);
  const pool = categories.filter((c) => c.kind === kind);
  for (const c of pool) {
    if (norm(c.name) === h) return c.id;
  }
  for (const c of pool) {
    if (norm(c.name).includes(h) || h.includes(norm(c.name))) return c.id;
  }
  return null;
}

export function todayISO(tzOffsetMinutes = -180): string {
  const d = new Date(Date.now() + tzOffsetMinutes * 60_000);
  return d.toISOString().slice(0, 10);
}

export function competenceMonth(
  date: string,
  account: { kind: string; closing_day: number | null } | null,
): string {
  const ym = date.slice(0, 7);
  if (!account || account.kind !== 'credit' || account.closing_day == null) {
    return ym;
  }
  const day = Number(date.slice(8, 10));
  if (day <= account.closing_day) return ym;
  const [y, m] = ym.split('-').map(Number);
  const next = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`;
  return next;
}

/** Hints em caption de foto: `eu nubank` → person + account. */
export function extractCaptionHints(
  caption: string,
  accounts: { name: string }[],
  people: { name: string; short_name: string }[],
): {
  personHint: string | null;
  accountHint: string | null;
  rest: string;
} {
  let rest = caption.trim().replace(/\s+/g, ' ');
  let personHint: string | null = null;
  let accountHint: string | null = null;
  if (!rest) return { personHint, accountHint, rest: '' };

  const tokens = rest.split(' ');
  const kept: string[] = [];

  for (const tok of tokens) {
    const h = norm(tok);
    if (!personHint && (h === 'casa' || h === 'eu')) {
      personHint = h;
      continue;
    }
    if (!personHint) {
      const person = people.find(
        (p) => norm(p.short_name) === h || norm(p.name) === h,
      );
      if (person) {
        personHint = person.short_name || person.name;
        continue;
      }
    }
    if (!accountHint) {
      const acc = accounts.find(
        (a) =>
          norm(a.name) === h ||
          norm(a.name).includes(h) ||
          h.includes(norm(a.name)),
      );
      if (acc && h.length >= 2) {
        accountHint = acc.name;
        continue;
      }
    }
    kept.push(tok);
  }

  return { personHint, accountHint, rest: kept.join(' ').trim() };
}

/** Linhas de um batch (mín. 2). Retorna drafts parseáveis. */
export function parseBatchLines(text: string): CaptureDraft[] {
  const lines = text
    .split(/\n+/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length < 2) return [];

  const drafts: CaptureDraft[] = [];
  for (const line of lines) {
    const d = cheapParseMessage(line);
    if (d) drafts.push(d);
  }
  return drafts.length >= 2 ? drafts : [];
}
