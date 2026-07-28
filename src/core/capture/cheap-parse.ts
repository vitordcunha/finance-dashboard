/**
 * Parse barato: `/saida 35,90 café`, `35 café`, `café 35,90`,
 * `gastei 40 uber`, `ontem 50 farmácia`, `1200 notebook 10x`,
 * `transferir 500 nubank inter`.
 */
import { parse } from '@/core/money';
import type { CaptureDraft } from '@/core/capture/draft';
import { captureDraftSchema } from '@/core/capture/draft';

const AMOUNT =
  String.raw`(R\$\s*)?(\d{1,3}(?:\.\d{3})*(?:,\d{1,2})?|\d+(?:[.,]\d{1,2})?)`;

const VERB_INCOME = /^(recebi|ganhei|entrou)\s+/i;
const VERB_EXPENSE = /^(gastei|paguei|comprei|saiu)\s+/i;

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

  try {
    const cents = parse(parsed.amountRaw);
    if (cents <= 0) return null;
  } catch {
    return null;
  }

  return captureDraftSchema.parse({
    kind,
    amountRaw: parsed.amountRaw,
    description: parsed.description.slice(0, 200),
    date,
    personHint,
    installments,
    confidence: 0.95,
    warnings: [],
  });
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

  try {
    if (parse(amountRaw) <= 0) return null;
  } catch {
    return null;
  }

  return captureDraftSchema.parse({
    kind: 'transfer',
    amountRaw,
    description: `Transferência ${from} → ${to}`.slice(0, 200),
    date,
    accountHint: from,
    transferAccountHint: to,
    confidence: 0.95,
    warnings: [],
  });
}

/** Extrai `10x` / `em 10x` / `10 vezes` do final. */
export function extractInstallments(text: string): {
  installments: number | undefined;
  rest: string;
} {
  const m = text.match(
    /\s+(?:em\s+)?(\d{1,2})\s*(?:x|×|vezes)\s*$/i,
  );
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

/** Extrai `hoje` / `ontem` / `anteontem` / `dia N` do texto. */
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

function isoDateOffset(dayOffset: number, tzOffsetMinutes = -180): string {
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
