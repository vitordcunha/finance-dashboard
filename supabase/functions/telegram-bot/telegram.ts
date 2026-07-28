const TELEGRAM_API = 'https://api.telegram.org';

export type TelegramUpdate = {
  update_id: number;
  message?: TelegramMessage;
  callback_query?: {
    id: string;
    from: { id: number; first_name?: string };
    message?: TelegramMessage;
    data?: string;
  };
};

export type TelegramMessage = {
  message_id: number;
  date: number;
  chat: { id: number; type: string };
  from?: { id: number; first_name?: string; username?: string };
  text?: string;
  caption?: string;
  photo?: { file_id: string; width: number; height: number }[];
  document?: { file_id: string; mime_type?: string; file_name?: string };
  voice?: {
    file_id: string;
    duration: number;
    mime_type?: string;
    file_unique_id?: string;
  };
  audio?: {
    file_id: string;
    duration?: number;
    mime_type?: string;
    file_name?: string;
  };
  reply_to_message?: TelegramMessage;
};

export function createTelegram(token: string) {
  const base = `${TELEGRAM_API}/bot${token}`;

  async function api<T>(method: string, body: Record<string, unknown>): Promise<T> {
    const res = await fetch(`${base}/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const json = (await res.json()) as { ok: boolean; result: T; description?: string };
    if (!json.ok) {
      throw new Error(json.description ?? `Telegram ${method} failed`);
    }
    return json.result;
  }

  return {
    sendMessage(
      chatId: number,
      text: string,
      extra?: {
        reply_markup?: unknown;
        parse_mode?: 'HTML' | 'Markdown';
      },
    ) {
      return api<{ message_id: number }>('sendMessage', {
        chat_id: chatId,
        text,
        ...extra,
      });
    },

    editMessageText(
      chatId: number,
      messageId: number,
      text: string,
      extra?: {
        reply_markup?: unknown;
        parse_mode?: 'HTML' | 'Markdown';
      },
    ) {
      return api<{ message_id: number }>('editMessageText', {
        chat_id: chatId,
        message_id: messageId,
        text,
        ...extra,
      });
    },

    sendChatAction(
      chatId: number,
      action:
        | 'typing'
        | 'upload_photo'
        | 'upload_document'
        | 'record_voice'
        | 'upload_voice' = 'typing',
    ) {
      return api('sendChatAction', {
        chat_id: chatId,
        action,
      }).catch(() => undefined);
    },

    answerCallback(callbackQueryId: string, text?: string) {
      return api('answerCallbackQuery', {
        callback_query_id: callbackQueryId,
        text,
      });
    },

    async getFileUrl(fileId: string): Promise<string> {
      const file = await api<{ file_path: string }>('getFile', { file_id: fileId });
      return `${TELEGRAM_API}/file/bot${token}/${file.file_path}`;
    },

    async downloadFile(fileId: string): Promise<Uint8Array> {
      const url = await this.getFileUrl(fileId);
      const res = await fetch(url);
      if (!res.ok) {
        throw new Error(`Falha ao baixar arquivo do Telegram (${res.status})`);
      }
      return new Uint8Array(await res.arrayBuffer());
    },
  };
}

export type Tg = ReturnType<typeof createTelegram>;

/** callback_data ≤ 64 bytes: índices em vez de UUIDs de conta/categoria. */
export function confirmKeyboard(
  draftId: string,
  opts?: { showItems?: boolean; itemCount?: number; showDest?: boolean },
) {
  const rows: { text: string; callback_data: string }[][] = [
    [
      { text: 'Confirmar', callback_data: `ok:${draftId}` },
      { text: 'Cancelar', callback_data: `no:${draftId}` },
    ],
    [
      { text: 'Casa', callback_data: `who:casa:${draftId}` },
      { text: 'Eu', callback_data: `who:eu:${draftId}` },
    ],
    [
      { text: 'Conta', callback_data: `menu:a:${draftId}` },
      { text: 'Categoria', callback_data: `menu:c:${draftId}` },
      { text: 'Data', callback_data: `menu:d:${draftId}` },
    ],
  ];
  if (opts?.showDest) {
    rows.push([{ text: 'Destino', callback_data: `menu:t:${draftId}` }]);
  }
  if (opts?.showItems && (opts.itemCount ?? 0) >= 2) {
    rows.push([
      {
        text: `Itens (${opts.itemCount})`,
        callback_data: `items:${draftId}`,
      },
    ]);
  }
  return { inline_keyboard: rows };
}

export function accountsKeyboard(
  draftId: string,
  accounts: { name: string }[],
  mode: 'from' | 'to' = 'from',
) {
  const prefix = mode === 'to' ? 'set:t' : 'set:a';
  const rows = chunkButtons(
    accounts.slice(0, 8).map((a, i) => ({
      text: trunc(a.name, 28),
      callback_data: `${prefix}:${draftId}:${i}`,
    })),
    2,
  );
  rows.push([{ text: '« Voltar', callback_data: `back:${draftId}` }]);
  return { inline_keyboard: rows };
}

export function categoriesKeyboard(
  draftId: string,
  categories: { name: string }[],
) {
  const rows = chunkButtons(
    categories.slice(0, 10).map((c, i) => ({
      text: trunc(c.name, 28),
      callback_data: `set:c:${draftId}:${i}`,
    })),
    2,
  );
  rows.push([{ text: '« Voltar', callback_data: `back:${draftId}` }]);
  return { inline_keyboard: rows };
}

export function dateKeyboard(draftId: string) {
  return {
    inline_keyboard: [
      [
        { text: 'Hoje', callback_data: `set:d:${draftId}:0` },
        { text: 'Ontem', callback_data: `set:d:${draftId}:1` },
      ],
      [
        { text: 'Anteontem', callback_data: `set:d:${draftId}:2` },
        { text: '« Voltar', callback_data: `back:${draftId}` },
      ],
    ],
  };
}

export function reuseKeyboard(labels: string[]) {
  const rows = chunkButtons(
    labels.slice(0, 6).map((label, i) => ({
      text: trunc(label, 28),
      callback_data: `reuse:${i}`,
    })),
    2,
  );
  return { inline_keyboard: rows };
}

export const emptyKeyboard = { inline_keyboard: [] as { text: string; callback_data: string }[][] };

/** Extra padrão para mensagens com tags HTML dos digests/preview. */
export const htmlParse = { parse_mode: 'HTML' as const };

function trunc(s: string, n: number): string {
  const t = s.trim();
  return t.length <= n ? t : `${t.slice(0, n - 1)}…`;
}

function chunkButtons<T>(items: T[], size: number): T[][] {
  const rows: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    rows.push(items.slice(i, i + size));
  }
  return rows;
}
