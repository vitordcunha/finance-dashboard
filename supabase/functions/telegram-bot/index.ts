import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.75.0';
import { fingerprint } from './fingerprint.ts';
import { formatBRL, parseAmount } from './money.ts';
import { bytesToBase64, enrichWithGpt, extractWithGpt, transcribeAudio } from './openai.ts';
import {
  mergeCheapWithLlm,
  shouldAutoConfirmEnriched,
} from './enrich.ts';
import {
  cheapParseMessage,
  competenceMonth,
  extractCaptionHints,
  isoDateOffset,
  parseBatchLines,
  resolveAccountHint,
  resolveCategoryHint,
  resolvePersonHint,
  todayISO,
  type CaptureDraft,
  type ResolvedDraft,
} from './parse.ts';
import { addMonthsISO, splitInstallmentCents } from './installments.ts';
import {
  replyCota,
  replyMes,
  replySaldo,
  runInvoiceDigest,
} from './queries.ts';
import {
  accountsKeyboard,
  categoriesKeyboard,
  confirmKeyboard,
  createTelegram,
  dateKeyboard,
  emptyKeyboard,
  htmlParse,
  reuseKeyboard,
  type TelegramMessage,
  type TelegramUpdate,
  type Tg,
} from './telegram.ts';
import { escapeHtml } from './assistant.ts';

const DRAFT_TTL_MS = 30 * 60_000;
const CONTEXT_CACHE_TTL_MS = 90_000;
const AMOUNT_WAIT_TTL_MS = 5 * 60_000;
/** Limite prático p/ Edge + base64 OpenAI (Telegram permite até ~20MB). */
const MAX_PDF_BYTES = 8 * 1024 * 1024;

/** Aceita Bearer igual à env, ou JWT legacy com role=service_role (pg_cron/Vault). */
function isServiceRoleBearer(
  authorization: string,
  serviceKey: string | undefined,
): boolean {
  if (!authorization.startsWith('Bearer ')) return false;
  const token = authorization.slice(7).trim();
  if (!token) return false;
  if (serviceKey && token === serviceKey) return true;
  try {
    const payloadPart = token.split('.')[1];
    if (!payloadPart) return false;
    const json = atob(payloadPart.replace(/-/g, '+').replace(/_/g, '/'));
    const payload = JSON.parse(json) as { role?: string; ref?: string };
    return payload.role === 'service_role';
  } catch {
    return false;
  }
}

type LinkRow = {
  id: string;
  household_id: string;
  user_id: string;
  person_id: string | null;
  telegram_user_id: number;
  telegram_chat_id: number;
  default_account_id: string | null;
  revoked_at: string | null;
};

type HouseholdContext = Awaited<ReturnType<typeof fetchContext>>;

const contextCache = new Map<
  string,
  { at: number; value: HouseholdContext }
>();

/** Após /ultimo: aguarda valor para a descrição escolhida. */
type AmountWait = {
  description: string;
  kind: 'expense' | 'income';
  expires: number;
};
const amountWaits = new Map<number, AmountWait>();
/** Labels do último /ultimo por usuário (índice do botão reuse:N). */
const reuseLabels = new Map<number, { labels: string[]; expires: number }>();

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const action = url.searchParams.get('action');

  if (req.method === 'GET' && action === 'setup-webhook') {
    const secret = Deno.env.get('TELEGRAM_WEBHOOK_SECRET');
    const header = req.headers.get('x-telegram-bot-api-secret-token');
    if (!secret || header !== secret) {
      return new Response('Unauthorized', { status: 401 });
    }
    const botToken = Deno.env.get('TELEGRAM_BOT_TOKEN');
    if (!botToken) {
      return new Response('Missing TELEGRAM_BOT_TOKEN', { status: 500 });
    }
    const webhookUrl =
      `${Deno.env.get('SUPABASE_URL')}/functions/v1/telegram-bot`;
    const setRes = await fetch(
      `https://api.telegram.org/bot${botToken}/setWebhook`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: webhookUrl,
          secret_token: secret,
          allowed_updates: ['message', 'callback_query'],
          drop_pending_updates: true,
        }),
      },
    );
    const setJson = await setRes.json();
    const meRes = await fetch(`https://api.telegram.org/bot${botToken}/getMe`);
    const meJson = await meRes.json();
    return new Response(
      JSON.stringify({
        webhook: setJson,
        bot: meJson.result ?? meJson,
        webhookUrl,
      }),
      { headers: { 'Content-Type': 'application/json' } },
    );
  }

  // Digest / lembrete de fatura (cron). Aceita GET ou POST.
  if (action === 'digest') {
    const secret = Deno.env.get('TELEGRAM_WEBHOOK_SECRET');
    const header = req.headers.get('x-telegram-bot-api-secret-token');
    const auth = req.headers.get('authorization') ?? '';
    const botToken = Deno.env.get('TELEGRAM_BOT_TOKEN');
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const okSecret = Boolean(secret && header === secret);
    const okService = isServiceRoleBearer(auth, serviceKey);
    if (!okSecret && !okService) {
      return new Response('Unauthorized', { status: 401 });
    }
    if (!botToken || !supabaseUrl || !serviceKey) {
      return new Response('Misconfigured', { status: 500 });
    }
    const tg = createTelegram(botToken);
    const sb = createClient(supabaseUrl, serviceKey);
    try {
      const result = await runInvoiceDigest(sb, (chatId, text) =>
        tg.sendMessage(chatId, text, htmlParse),
      );
      return new Response(JSON.stringify({ ok: true, ...result }), {
        headers: { 'Content-Type': 'application/json' },
      });
    } catch (err) {
      console.error('digest error', err);
      return new Response(JSON.stringify({ ok: false, error: String(err) }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }
  }

  if (req.method === 'GET') {
    return new Response('telegram-bot ok', { status: 200 });
  }
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  const secret = Deno.env.get('TELEGRAM_WEBHOOK_SECRET');
  if (secret) {
    const header = req.headers.get('x-telegram-bot-api-secret-token');
    if (header !== secret) {
      return new Response('Unauthorized', { status: 401 });
    }
  }

  const botToken = Deno.env.get('TELEGRAM_BOT_TOKEN');
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!botToken || !supabaseUrl || !serviceKey) {
    console.error('Missing TELEGRAM_BOT_TOKEN / SUPABASE_URL / SERVICE_ROLE');
    return new Response('Misconfigured', { status: 500 });
  }

  const tg = createTelegram(botToken);
  const sb = createClient(supabaseUrl, serviceKey);

  let update: TelegramUpdate;
  try {
    update = (await req.json()) as TelegramUpdate;
  } catch {
    return new Response('Bad JSON', { status: 400 });
  }

  try {
    if (update.callback_query) {
      await handleCallback(sb, tg, update);
    } else if (update.message) {
      await handleMessage(sb, tg, update.message);
    }
  } catch (err) {
    console.error('handler error', err);
    const chatId =
      update.message?.chat.id ?? update.callback_query?.message?.chat.id;
    if (chatId) {
      await tg.sendMessage(
        chatId,
        'Não consegui processar. Tente de novo ou /ajuda.',
      ).catch(() => undefined);
    }
  }

  return new Response(JSON.stringify({ ok: true }), {
    headers: { 'Content-Type': 'application/json' },
  });
});

async function handleMessage(
  sb: SupabaseClient,
  tg: Tg,
  message: TelegramMessage,
) {
  const fromId = message.from?.id;
  if (fromId == null) return;
  const chatId = message.chat.id;
  // Telegram pode enviar /saida@bot_username
  const text = (message.text ?? message.caption ?? '')
    .trim()
    .replace(/^\/([A-Za-z_]+)@[^\s]+/, '/$1');

  if (text.startsWith('/start')) {
    await handleStart(sb, tg, message, text);
    return;
  }

  const link = await getActiveLink(sb, fromId);
  if (!link) {
    await tg.sendMessage(
      chatId,
      'Telegram ainda não vinculado.\nNo app: Configurações → Telegram → gerar código, depois envie:\n/start SEUCODIGO',
    );
    return;
  }

  if (text === '/ajuda' || text === '/help') {
    await tg.sendMessage(
      chatId,
      [
        'Captura rápida:',
        '• 35,90 café — grava na hora',
        '• várias linhas = vários lançamentos',
        '• texto livre, áudio, foto ou PDF → Conta/Cat/Data + Confirmar',
        '• transferir 500 nubank inter · 1200 notebook 10x',
        '• foto/PDF + caption: eu nubank',
        '• /ultimo — repetir descrição recente',
        '• /desfazer · /cancelar',
        '',
        'Consulta:',
        '• /mes — folga e resumo do mês',
        '• /saldo — caixa hoje por conta',
        '• /cota — sua cota Casa e fairness',
      ].join('\n'),
    );
    return;
  }

  if (text === '/mes' || text === '/mês') {
    await tg.sendMessage(chatId, await replyMes(sb, link), htmlParse);
    return;
  }

  if (text === '/saldo') {
    await tg.sendMessage(chatId, await replySaldo(sb, link), htmlParse);
    return;
  }

  if (text === '/cota') {
    await tg.sendMessage(chatId, await replyCota(sb, link), htmlParse);
    return;
  }

  if (text === '/cancelar') {
    amountWaits.delete(fromId);
    const pending = await getPendingDraft(sb, fromId);
    await expirePendingDrafts(sb, fromId);
    if (pending?.payload.telegramMessageId) {
      await tg
        .editMessageText(
          chatId,
          pending.payload.telegramMessageId,
          'Rascunho cancelado.',
          { reply_markup: emptyKeyboard },
        )
        .catch(() => undefined);
    } else {
      await tg.sendMessage(chatId, 'Rascunho cancelado.');
    }
    return;
  }

  if (text === '/desfazer') {
    await handleUndo(sb, tg, link, chatId);
    return;
  }

  if (text === '/ultimo' || text === '/últimos' || text === '/ultimos') {
    await handleUltimo(sb, tg, link, chatId, fromId);
    return;
  }

  // Reply na preview → correção de campo
  if (message.reply_to_message && text) {
    const pending = await getPendingDraftByMessage(
      sb,
      fromId,
      message.reply_to_message.message_id,
    );
    if (pending) {
      await patchDraftFromReply(sb, tg, link, pending, text, chatId);
      return;
    }
  }

  const pending = await getPendingDraft(sb, fromId);
  if (pending && /^\s*(R\$\s*)?\d+[.,]?\d*\s*$/i.test(text)) {
    await patchDraftAmount(sb, tg, link, pending, text, chatId);
    return;
  }

  // /ultimo → tocou descrição → agora manda só o valor
  const wait = amountWaits.get(fromId);
  if (wait && wait.expires > Date.now() && /^\s*(R\$\s*)?\d+[.,]?\d*\s*$/i.test(text)) {
    amountWaits.delete(fromId);
    const raw = `${text.trim()} ${wait.description}`;
    let draft: CaptureDraft = {
      kind: wait.kind,
      amountRaw: text.trim(),
      description: wait.description,
      confidence: 0.95,
      warnings: [],
    };
    draft = await enrichCheapDraft(sb, tg, link, chatId, raw, draft);
    if (shouldAutoConfirmEnriched(draft)) {
      await autoSaveDraft(sb, tg, link, draft, chatId);
    } else {
      await presentDraft(sb, tg, link, draft, chatId);
    }
    return;
  }
  if (wait && wait.expires <= Date.now()) amountWaits.delete(fromId);

  const hasPhoto = Boolean(message.photo?.length);
  const hasImageDoc =
    message.document?.mime_type?.startsWith('image/') === true;
  const hasPdf = isPdfDocument(message);
  const hasVoice = Boolean(message.voice || message.audio);

  if (hasVoice) {
    await handleVoice(sb, tg, link, message);
    return;
  }

  if (hasPhoto || hasImageDoc || hasPdf) {
    await handleMedia(sb, tg, link, message, text);
    return;
  }

  if (!text) {
    await tg.sendMessage(
      chatId,
      'Envie valor + descrição, áudio, foto ou PDF.',
    );
    return;
  }

  // Batch: várias linhas — enrich + auto-grava as ok; preview da primeira pendente
  const batch = parseBatchLines(text);
  if (batch.length >= 2) {
    const lines = text.split(/\n+/).map((l) => l.trim()).filter(Boolean);
    if (batch.length === lines.length) {
      amountWaits.delete(fromId);
      const enriched = await enrichDrafts(sb, tg, link, chatId, lines, batch);
      if (enriched) {
        const needConfirm = enriched.filter((d) => !shouldAutoConfirmEnriched(d));
        const autoOk = enriched.filter((d) => shouldAutoConfirmEnriched(d));
        const results: string[] = [];
        for (const d of autoOk) {
          const label = await autoSaveDraftSilent(sb, link, d);
          if (label) results.push(label);
        }
        if (needConfirm.length === 0 && results.length > 0) {
          await tg.sendMessage(
            chatId,
            `Salvos ${results.length}:\n${results.map((r) => `• ${r}`).join('\n')}\n(/desfazer remove o último)`,
            htmlParse,
          );
          return;
        }
        if (needConfirm.length > 0) {
          if (results.length > 0) {
            await tg.sendMessage(
              chatId,
              `${results.length} salvos. Revise ${needConfirm.length}:`,
            );
          }
          await presentDraft(sb, tg, link, needConfirm[0]!, chatId);
          return;
        }
      }
    }
  }

  await processTextCapture(sb, tg, link, chatId, fromId, text);
}

/** Cheap-parse → enrich LLM → auto ou preview. */
async function processTextCapture(
  sb: SupabaseClient,
  tg: Tg,
  link: LinkRow,
  chatId: number,
  fromId: number,
  text: string,
) {
  amountWaits.delete(fromId);
  let draft = cheapParseMessage(text);

  if (draft) {
    draft = await enrichCheapDraft(sb, tg, link, chatId, text, draft);
    if (shouldAutoConfirmEnriched(draft)) {
      await autoSaveDraft(sb, tg, link, draft, chatId);
      return;
    }
    await presentDraft(sb, tg, link, draft, chatId);
    return;
  }

  const openaiKey = Deno.env.get('OPENAI_API_KEY');
  if (!openaiKey) {
    await tg.sendMessage(
      chatId,
      'Não entendi. Use: 35,90 café\n(Ou configure OPENAI_API_KEY para texto livre.)',
    );
    return;
  }
  await tg.sendChatAction(chatId, 'typing');
  const ctx = await loadContext(sb, link.household_id);
  draft = await extractWithGpt({
    apiKey: openaiKey,
    text,
    context: ctx.labels,
  });
  await presentDraft(sb, tg, link, draft, chatId);
}

async function enrichCheapDraft(
  sb: SupabaseClient,
  tg: Tg,
  link: LinkRow,
  chatId: number,
  text: string,
  cheap: CaptureDraft,
): Promise<CaptureDraft> {
  const openaiKey = Deno.env.get('OPENAI_API_KEY');
  if (!openaiKey) return cheap;

  try {
    await tg.sendChatAction(chatId, 'typing');
    const ctx = await loadContext(sb, link.household_id);
    const llm = await enrichWithGpt({
      apiKey: openaiKey,
      text,
      locked: {
        amountRaw: cheap.amountRaw,
        kind: cheap.kind,
        description: cheap.description,
      },
      context: ctx.labels,
    });
    return mergeCheapWithLlm(cheap, llm);
  } catch (err) {
    console.error('enrich failed', err);
    return cheap;
  }
}

async function enrichDrafts(
  sb: SupabaseClient,
  tg: Tg,
  link: LinkRow,
  chatId: number,
  lines: string[],
  batch: CaptureDraft[],
): Promise<CaptureDraft[] | null> {
  const openaiKey = Deno.env.get('OPENAI_API_KEY');
  if (!openaiKey) return batch;

  await tg.sendChatAction(chatId, 'typing');
  try {
    const ctx = await loadContext(sb, link.household_id);
    const out: CaptureDraft[] = [];
    for (let i = 0; i < batch.length; i++) {
      const cheap = batch[i]!;
      const line = lines[i]!;
      try {
        const llm = await enrichWithGpt({
          apiKey: openaiKey,
          text: line,
          locked: {
            amountRaw: cheap.amountRaw,
            kind: cheap.kind,
            description: cheap.description,
          },
          context: ctx.labels,
        });
        out.push(mergeCheapWithLlm(cheap, llm));
      } catch {
        out.push(cheap);
      }
    }
    return out;
  } catch (err) {
    console.error('batch enrich failed', err);
    return batch;
  }
}

async function handleMedia(
  sb: SupabaseClient,
  tg: Tg,
  link: LinkRow,
  message: TelegramMessage,
  caption: string,
) {
  const openaiKey = Deno.env.get('OPENAI_API_KEY');
  if (!openaiKey) {
    await tg.sendMessage(
      message.chat.id,
      'Arquivo recebido, mas OPENAI_API_KEY não está configurada na function.',
    );
    return;
  }

  const isPdf = isPdfDocument(message);
  const fileId =
    message.photo?.sort((a, b) => b.width * b.height - a.width * a.height)[0]
      ?.file_id ?? message.document?.file_id;
  if (!fileId) return;

  const ctx = await loadContext(sb, link.household_id);
  const hints = extractCaptionHints(caption, ctx.accounts, ctx.people);
  const gptText =
    hints.rest ||
    (isPdf
      ? 'Extraia o lançamento deste PDF de cupom/nota fiscal.'
      : 'Extraia o lançamento deste cupom/nota fiscal.');

  let draft;
  if (isPdf) {
    await tg.sendChatAction(message.chat.id, 'upload_document');
    const bytes = await tg.downloadFile(fileId);
    if (bytes.byteLength > MAX_PDF_BYTES) {
      await tg.sendMessage(
        message.chat.id,
        'PDF grande demais (máx. 8 MB). Envie foto do cupom ou um PDF menor.',
      );
      return;
    }
    if (bytes.byteLength === 0) {
      await tg.sendMessage(message.chat.id, 'Não consegui baixar o PDF. Tente de novo.');
      return;
    }
    draft = await extractWithGpt({
      apiKey: openaiKey,
      text: gptText,
      pdfBase64: bytesToBase64(bytes),
      pdfFilename: message.document?.file_name ?? 'cupom.pdf',
      context: ctx.labels,
    });
  } else {
    await tg.sendChatAction(message.chat.id, 'upload_photo');
    const fileUrl = await tg.getFileUrl(fileId);
    draft = await extractWithGpt({
      apiKey: openaiKey,
      text: gptText,
      imageUrl: fileUrl,
      context: ctx.labels,
    });
  }

  if (hints.personHint) draft.personHint = hints.personHint;
  if (hints.accountHint) draft.accountHint = hints.accountHint;
  await presentDraft(sb, tg, link, draft, message.chat.id, {
    mediaFileId: fileId,
    mediaKind: isPdf ? 'pdf' : message.photo?.length ? 'photo' : 'image',
  });
}

async function handleVoice(
  sb: SupabaseClient,
  tg: Tg,
  link: LinkRow,
  message: TelegramMessage,
) {
  const openaiKey = Deno.env.get('OPENAI_API_KEY');
  const chatId = message.chat.id;
  if (!openaiKey) {
    await tg.sendMessage(
      chatId,
      'Áudio recebido, mas OPENAI_API_KEY não está configurada.',
    );
    return;
  }

  const fileId = message.voice?.file_id ?? message.audio?.file_id;
  if (!fileId) return;

  await tg.sendChatAction(chatId, 'upload_voice');
  const bytes = await tg.downloadFile(fileId);
  if (bytes.byteLength === 0) {
    await tg.sendMessage(chatId, 'Não consegui baixar o áudio.');
    return;
  }
  if (bytes.byteLength > 25 * 1024 * 1024) {
    await tg.sendMessage(chatId, 'Áudio grande demais (máx. 25 MB).');
    return;
  }

  const filename = message.audio?.file_name
    ?? (message.voice ? 'voice.ogg' : 'audio.m4a');
  const mime =
    message.voice?.mime_type ??
    message.audio?.mime_type ??
    'audio/ogg';

  let transcript: string;
  try {
    transcript = await transcribeAudio({
      apiKey: openaiKey,
      bytes,
      filename,
      mimeType: mime,
    });
  } catch (err) {
    console.error(err);
    await tg.sendMessage(chatId, 'Não consegui transcrever o áudio. Tente de novo.');
    return;
  }

  if (!transcript) {
    await tg.sendMessage(chatId, 'Não entendi o áudio. Tente falar de novo.');
    return;
  }

  await tg.sendMessage(chatId, `Ouvi: «${transcript.slice(0, 120)}»`);
  await processTextCapture(sb, tg, link, chatId, message.from!.id, transcript);
}

function isPdfDocument(message: TelegramMessage): boolean {
  const doc = message.document;
  if (!doc) return false;
  const mime = (doc.mime_type ?? '').toLowerCase();
  if (
    mime === 'application/pdf' ||
    mime === 'application/x-pdf' ||
    mime === 'application/acrobat'
  ) {
    return true;
  }
  return (doc.file_name ?? '').toLowerCase().endsWith('.pdf');
}

async function handleStart(
  sb: SupabaseClient,
  tg: Tg,
  message: TelegramMessage,
  text: string,
) {
  const fromId = message.from?.id;
  if (fromId == null) return;
  const chatId = message.chat.id;
  const parts = text.split(/\s+/);
  const code = parts[1]?.trim().toUpperCase();

  if (!code) {
    const existing = await getActiveLink(sb, fromId);
    if (existing) {
      await tg.sendMessage(chatId, 'Já vinculado. Use /ajuda para lançar.');
    } else {
      await tg.sendMessage(
        chatId,
        'Gere um código em Configurações → Telegram no app e envie:\n/start CODIGO',
      );
    }
    return;
  }

  const { data: row, error } = await sb
    .from('telegram_link_codes')
    .select('*')
    .eq('code', code)
    .is('used_at', null)
    .gt('expires_at', new Date().toISOString())
    .maybeSingle();

  if (error || !row) {
    await tg.sendMessage(chatId, 'Código inválido ou expirado. Gere outro no app.');
    return;
  }

  const { data: existingByUser } = await sb
    .from('telegram_links')
    .select('id')
    .eq('user_id', row.user_id)
    .maybeSingle();

  if (existingByUser) {
    const { error: upErr } = await sb
      .from('telegram_links')
      .update({
        household_id: row.household_id,
        person_id: row.person_id,
        telegram_user_id: fromId,
        telegram_chat_id: chatId,
        revoked_at: null,
        linked_at: new Date().toISOString(),
      })
      .eq('id', existingByUser.id);
    if (upErr) {
      console.error(upErr);
      await tg.sendMessage(chatId, 'Falha ao vincular. Tente outro código.');
      return;
    }
  } else {
    const { error: insErr } = await sb.from('telegram_links').insert({
      household_id: row.household_id,
      user_id: row.user_id,
      person_id: row.person_id,
      telegram_user_id: fromId,
      telegram_chat_id: chatId,
    });
    if (insErr) {
      console.error(insErr);
      await tg.sendMessage(chatId, 'Falha ao vincular. Tente outro código.');
      return;
    }
  }

  await sb
    .from('telegram_links')
    .update({ revoked_at: new Date().toISOString() })
    .eq('telegram_user_id', fromId)
    .neq('user_id', row.user_id)
    .is('revoked_at', null);

  await sb
    .from('telegram_link_codes')
    .update({ used_at: new Date().toISOString() })
    .eq('id', row.id);

  await tg.sendMessage(
    chatId,
    'Vinculado! Pode lançar: 35,90 café\nou áudio / foto / PDF do cupom.',
  );
}

async function handleCallback(
  sb: SupabaseClient,
  tg: Tg,
  update: TelegramUpdate,
) {
  const cq = update.callback_query!;
  const data = cq.data ?? '';
  const chatId = cq.message?.chat.id;
  const messageId = cq.message?.message_id;
  const fromId = cq.from.id;
  if (chatId == null) return;

  const link = await getActiveLink(sb, fromId);
  if (!link) {
    await tg.answerCallback(cq.id, 'Não vinculado');
    return;
  }

  if (data.startsWith('ok:')) {
    const draftId = data.slice(3);
    await tg.answerCallback(cq.id, 'Gravando…');
    await confirmDraft(sb, tg, link, draftId, chatId, messageId);
    return;
  }
  if (data.startsWith('no:')) {
    const draftId = data.slice(3);
    await sb
      .from('capture_drafts')
      .update({ status: 'cancelled', updated_at: new Date().toISOString() })
      .eq('id', draftId)
      .eq('telegram_user_id', fromId);
    await tg.answerCallback(cq.id, 'Cancelado');
    if (messageId != null) {
      await tg
        .editMessageText(chatId, messageId, 'Rascunho cancelado.', {
          reply_markup: emptyKeyboard,
        })
        .catch(() => tg.sendMessage(chatId, 'Rascunho cancelado.'));
    } else {
      await tg.sendMessage(chatId, 'Rascunho cancelado.');
    }
    return;
  }
  if (data.startsWith('who:')) {
    const [, who, draftId] = data.split(':');
    await tg.answerCallback(cq.id);
    await patchDraftWho(sb, tg, link, draftId!, who!, chatId, messageId);
    return;
  }
  if (data.startsWith('reuse:')) {
    const idx = Number(data.slice(6));
    await tg.answerCallback(cq.id);
    await handleReusePick(tg, fromId, chatId, idx);
    return;
  }
  if (data.startsWith('items:')) {
    const draftId = data.slice(6);
    await tg.answerCallback(cq.id);
    await toggleLineItems(sb, tg, link, draftId, chatId, messageId);
    return;
  }
  if (data.startsWith('menu:') || data.startsWith('set:') || data.startsWith('back:')) {
    await tg.answerCallback(cq.id);
    await handleDraftMenu(sb, tg, link, data, chatId, messageId);
  }
}

async function presentDraft(
  sb: SupabaseClient,
  tg: Tg,
  link: LinkRow,
  draft: CaptureDraft,
  chatId: number,
  media?: { mediaFileId: string; mediaKind: 'photo' | 'pdf' | 'image' },
) {
  const ctx = await loadContext(sb, link.household_id);
  const resolved = await resolveDraft(sb, link, draft, ctx);
  if (media) {
    resolved.mediaFileId = media.mediaFileId;
    resolved.mediaKind = media.mediaKind;
  }
  if (resolved.amountCents <= 0 || !resolved.description) {
    await tg.sendMessage(
      chatId,
      'Não consegui extrair valor/descrição. Tente de novo ou use 35,90 café.',
    );
    return;
  }

  if (
    resolved.kind === 'transfer' &&
    (!resolved.accountId || !resolved.transferAccountId)
  ) {
    resolved.warnings = [
      ...resolved.warnings,
      'Escolha origem (Conta) e Destino',
    ];
  }

  await expirePendingDrafts(sb, link.telegram_user_id);

  const { data: row, error } = await sb
    .from('capture_drafts')
    .insert({
      telegram_user_id: link.telegram_user_id,
      household_id: link.household_id,
      user_id: link.user_id,
      payload: resolved,
      status: 'pending',
      expires_at: new Date(Date.now() + DRAFT_TTL_MS).toISOString(),
    })
    .select('id')
    .single();

  if (error || !row) {
    console.error(error);
    await tg.sendMessage(chatId, 'Erro ao salvar rascunho.');
    return;
  }

  const body = formatPreview(resolved, ctx, link, { askConfirm: true });
  const msg = await tg.sendMessage(chatId, body, {
    reply_markup: confirmKeyboard(row.id, keyboardOpts(resolved)),
    ...htmlParse,
  });

  const withMsg: ResolvedDraft = {
    ...resolved,
    telegramMessageId: msg.message_id,
  };
  await sb
    .from('capture_drafts')
    .update({ payload: withMsg, updated_at: new Date().toISOString() })
    .eq('id', row.id);
}

function keyboardOpts(resolved: ResolvedDraft) {
  return {
    showItems: Boolean(resolved.lineItems && resolved.lineItems.length >= 2),
    itemCount: resolved.lineItems?.length ?? 0,
    showDest: resolved.kind === 'transfer',
  };
}

async function autoSaveDraft(
  sb: SupabaseClient,
  tg: Tg,
  link: LinkRow,
  draft: CaptureDraft,
  chatId: number,
) {
  const label = await autoSaveDraftSilent(sb, link, draft);
  if (!label) {
    await tg.sendMessage(
      chatId,
      'Não consegui extrair valor/descrição. Tente de novo.',
    );
    return;
  }
  await tg.sendMessage(
    chatId,
    `Salvo: ${label}\n(/desfazer se errou)`,
    htmlParse,
  );
}

/** Grava sem enviar mensagem. Retorna rótulo "R$ X · desc" ou null. */
async function autoSaveDraftSilent(
  sb: SupabaseClient,
  link: LinkRow,
  draft: CaptureDraft,
): Promise<string | null> {
  const ctx = await loadContext(sb, link.household_id);
  const resolved = await resolveDraft(sb, link, draft, ctx);
  if (resolved.amountCents <= 0 || !resolved.description) {
    return null;
  }

  await expirePendingDrafts(sb, link.telegram_user_id);
  const txId = await insertTransaction(sb, link, resolved);
  if (!txId) return null;

  await sb.from('capture_drafts').insert({
    telegram_user_id: link.telegram_user_id,
    household_id: link.household_id,
    user_id: link.user_id,
    payload: resolved,
    status: 'confirmed',
    last_transaction_id: txId,
    expires_at: new Date(Date.now() + DRAFT_TTL_MS).toISOString(),
  });

  return `<b>${formatBRL(resolved.amountCents)}</b> · ${escapeHtml(resolved.description)}`;
}

async function resolveDraft(
  sb: SupabaseClient,
  link: LinkRow,
  draft: CaptureDraft,
  ctx?: HouseholdContext,
): Promise<ResolvedDraft> {
  const context = ctx ?? (await loadContext(sb, link.household_id));
  let amountCents = 0;
  try {
    amountCents = parseAmount(draft.amountRaw);
  } catch {
    amountCents = 0;
  }

  const mePerson =
    context.people.find((p) => p.user_id === link.user_id)?.id ??
    link.person_id;

  let categoryId = resolveCategoryHint(
    draft.categoryHint,
    context.categories,
    draft.kind,
  );

  if (!categoryId && draft.description) {
    const fp = fingerprint(draft.description);
    if (fp) {
      const rule = context.rules.find((r) => r.fingerprint === fp);
      if (rule) categoryId = rule.category_id;
    }
  }

  const fallbackAccount =
    link.default_account_id ??
    context.accounts.find((a) => a.kind !== 'credit')?.id ??
    context.accounts[0]?.id ??
    null;

  return {
    ...draft,
    amountCents,
    accountId: resolveAccountHint(
      draft.accountHint,
      context.accounts,
      draft.kind === 'transfer' ? null : fallbackAccount,
    ),
    transferAccountId: resolveAccountHint(
      draft.transferAccountHint,
      context.accounts,
      null,
    ),
    personId: resolvePersonHint(
      draft.personHint,
      context.people,
      mePerson,
      link.person_id,
    ),
    categoryId: draft.kind === 'transfer' ? null : categoryId,
  };
}

function formatPreview(
  resolved: ResolvedDraft,
  ctx: HouseholdContext,
  link: LinkRow,
  opts: { askConfirm?: boolean },
): string {
  const kindLabel =
    resolved.kind === 'income'
      ? 'Entrada'
      : resolved.kind === 'transfer'
        ? 'Transferência'
        : 'Saída';

  const mePersonId =
    ctx.people.find((p) => p.user_id === link.user_id)?.id ?? link.person_id;
  let who = 'Casa';
  if (resolved.personId != null) {
    if (resolved.personId === mePersonId) {
      who = 'Eu';
    } else {
      const p = ctx.people.find((x) => x.id === resolved.personId);
      who = p?.short_name || p?.name || 'Eu';
    }
  }

  const account = resolved.accountId
    ? ctx.accounts.find((a) => a.id === resolved.accountId)?.name
    : null;
  const dest = resolved.transferAccountId
    ? ctx.accounts.find((a) => a.id === resolved.transferAccountId)?.name
    : null;
  const category = resolved.categoryId
    ? ctx.categories.find((c) => c.id === resolved.categoryId)?.name
    : null;
  const date = resolved.date && /^\d{4}-\d{2}-\d{2}$/.test(resolved.date)
    ? resolved.date.split('-').reverse().join('/')
    : null;

  const metaParts =
    resolved.kind === 'transfer'
      ? [
          account && dest
            ? `${escapeHtml(account)} → ${escapeHtml(dest)}`
            : account
              ? escapeHtml(account)
              : 'origem?',
          date,
        ]
      : [escapeHtml(who), account && escapeHtml(account), category && escapeHtml(category), date];
  const meta = metaParts.filter(Boolean).join(' · ');

  let extra = '';
  if (resolved.installments && resolved.installments >= 2) {
    const parts = splitInstallmentCents(
      resolved.amountCents,
      resolved.installments,
    );
    const each = parts[0] ?? 0;
    extra += `\n${resolved.installments}× de ${formatBRL(each)} (total ${formatBRL(resolved.amountCents)})`;
  }
  if (resolved.useLineItems && resolved.lineItems && resolved.lineItems.length >= 2) {
    const lines = resolved.lineItems
      .slice(0, 8)
      .map((it) => `• ${escapeHtml(it.description)} ${escapeHtml(it.amountRaw)}`)
      .join('\n');
    extra += `\n${resolved.lineItems.length} itens:\n${lines}`;
    if (resolved.lineItems.length > 8) extra += '\n…';
  } else if (resolved.lineItems && resolved.lineItems.length >= 2) {
    extra += `\n(${resolved.lineItems.length} itens disponíveis — toque em Itens)`;
  }

  const warn =
    resolved.warnings.length > 0
      ? `\n⚠ ${escapeHtml(resolved.warnings.join('; '))}`
      : '';
  const conf =
    resolved.confidence < 0.75 ? '\n(confiança baixa — revise o valor)' : '';
  const ask = opts.askConfirm ? '\n\nConfirmar?' : '';

  return `<b>${kindLabel} ${formatBRL(resolved.amountCents)}</b>\n${escapeHtml(resolved.description)}\n${meta}${extra}${warn}${conf}${ask}`;
}

async function insertTransaction(
  sb: SupabaseClient,
  link: LinkRow,
  payload: ResolvedDraft,
  extra?: {
    amountCents?: number;
    date?: string;
    description?: string;
    installmentNo?: number;
    installmentTotal?: number;
    installmentGroup?: string;
    status?: 'actual' | 'planned';
  },
): Promise<string | null> {
  if (
    payload.kind === 'transfer' &&
    (!payload.accountId ||
      !payload.transferAccountId ||
      payload.accountId === payload.transferAccountId)
  ) {
    return null;
  }

  const date =
    extra?.date && /^\d{4}-\d{2}-\d{2}$/.test(extra.date)
      ? extra.date
      : payload.date && /^\d{4}-\d{2}-\d{2}$/.test(payload.date)
        ? payload.date
        : todayISO();

  let account: { kind: string; closing_day: number | null } | null = null;
  if (payload.accountId) {
    const { data } = await sb
      .from('accounts')
      .select('kind, closing_day')
      .eq('id', payload.accountId)
      .maybeSingle();
    account = data;
  }

  const amountCents = extra?.amountCents ?? payload.amountCents;
  const kind = payload.kind;

  const { data: tx, error } = await sb
    .from('transactions')
    .insert({
      household_id: link.household_id,
      date,
      competence_month: competenceMonth(date, account),
      kind,
      description: extra?.description ?? payload.description,
      amount_cents: amountCents,
      category_id: kind === 'transfer' ? null : payload.categoryId,
      person_id: payload.personId,
      account_id: payload.accountId,
      transfer_account_id: kind === 'transfer' ? payload.transferAccountId : null,
      installment_no: extra?.installmentNo ?? null,
      installment_total: extra?.installmentTotal ?? null,
      installment_group: extra?.installmentGroup ?? null,
      status: extra?.status ?? 'actual',
      notes: payload.notes ?? null,
      source: 'telegram',
      created_by: link.user_id,
    })
    .select('id')
    .single();

  if (error || !tx) {
    console.error(error);
    return null;
  }
  return tx.id as string;
}

async function confirmDraft(
  sb: SupabaseClient,
  tg: Tg,
  link: LinkRow,
  draftId: string,
  chatId: number,
  messageId?: number,
) {
  const { data: draftRow } = await sb
    .from('capture_drafts')
    .select('*')
    .eq('id', draftId)
    .eq('telegram_user_id', link.telegram_user_id)
    .eq('status', 'pending')
    .maybeSingle();

  if (!draftRow) {
    await tg.sendMessage(chatId, 'Rascunho expirado ou já usado.');
    return;
  }

  const payload = draftRow.payload as ResolvedDraft;

  if (
    payload.kind === 'transfer' &&
    (!payload.accountId ||
      !payload.transferAccountId ||
      payload.accountId === payload.transferAccountId)
  ) {
    await tg.sendMessage(
      chatId,
      'Transferência precisa de Conta (origem) e Destino diferentes.',
    );
    return;
  }

  let done: string;
  let lastTxId: string | null = null;
  let installmentGroup: string | undefined;

  if (
    payload.useLineItems &&
    payload.lineItems &&
    payload.lineItems.length >= 2
  ) {
    const labels: string[] = [];
    for (const item of payload.lineItems) {
      let cents = 0;
      try {
        cents = parseAmount(item.amountRaw);
      } catch {
        cents = 0;
      }
      if (cents <= 0) continue;
      const itemPayload: ResolvedDraft = {
        ...payload,
        kind: 'expense',
        description: item.description,
        amountRaw: item.amountRaw,
        amountCents: cents,
        installments: undefined,
        lineItems: null,
        useLineItems: false,
      };
      const id = await insertTransaction(sb, link, itemPayload);
      if (id) {
        lastTxId = id;
        labels.push(`<b>${formatBRL(cents)}</b> · ${escapeHtml(item.description)}`);
      }
    }
    if (!lastTxId) {
      await tg.sendMessage(chatId, 'Erro ao gravar itens.');
      return;
    }
    done = `✓ Salvos ${labels.length} itens\n(/desfazer remove o último)`;
  } else if (payload.installments && payload.installments >= 2) {
    const parts = splitInstallmentCents(
      payload.amountCents,
      payload.installments,
    );
    if (parts.length < 2) {
      await tg.sendMessage(chatId, 'Parcelas inválidas.');
      return;
    }
    installmentGroup = crypto.randomUUID();
    const baseDate =
      payload.date && /^\d{4}-\d{2}-\d{2}$/.test(payload.date)
        ? payload.date
        : todayISO();
    for (let i = 0; i < parts.length; i++) {
      const id = await insertTransaction(sb, link, payload, {
        amountCents: parts[i],
        date: addMonthsISO(baseDate, i),
        description: `${payload.description} (${i + 1}/${parts.length})`,
        installmentNo: i + 1,
        installmentTotal: parts.length,
        installmentGroup,
        status: i === 0 ? 'actual' : 'planned',
      });
      if (id) lastTxId = id;
    }
    if (!lastTxId) {
      await tg.sendMessage(chatId, 'Erro ao gravar parcelas.');
      return;
    }
    done =
      `✓ Salvo ${parts.length}× · ${escapeHtml(payload.description)}\n(/desfazer remove o grupo)`;
  } else {
    lastTxId = await insertTransaction(sb, link, payload);
    if (!lastTxId) {
      await tg.sendMessage(chatId, 'Erro ao gravar lançamento.');
      return;
    }
    done =
      `✓ Salvo: <b>${formatBRL(payload.amountCents)}</b> · ${escapeHtml(payload.description)}\n(/desfazer se errou)`;
  }

  await sb
    .from('capture_drafts')
    .update({
      status: 'confirmed',
      last_transaction_id: lastTxId,
      payload: {
        ...payload,
        installmentGroup,
      },
      updated_at: new Date().toISOString(),
    })
    .eq('id', draftId);

  const mid = messageId ?? payload.telegramMessageId;
  if (mid != null) {
    await tg
      .editMessageText(chatId, mid, done, {
        reply_markup: emptyKeyboard,
        ...htmlParse,
      })
      .catch(() => tg.sendMessage(chatId, done, htmlParse));
  } else {
    await tg.sendMessage(chatId, done, htmlParse);
  }
}

async function handleUndo(
  sb: SupabaseClient,
  tg: Tg,
  link: LinkRow,
  chatId: number,
) {
  const { data: draft } = await sb
    .from('capture_drafts')
    .select('*')
    .eq('telegram_user_id', link.telegram_user_id)
    .eq('status', 'confirmed')
    .not('last_transaction_id', 'is', null)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!draft?.last_transaction_id) {
    await tg.sendMessage(chatId, 'Nada para desfazer.');
    return;
  }

  const payload = draft.payload as ResolvedDraft;
  const group = payload.installmentGroup;

  let error = null;
  if (group) {
    const res = await sb
      .from('transactions')
      .delete()
      .eq('household_id', link.household_id)
      .eq('installment_group', group);
    error = res.error;
  } else {
    const res = await sb
      .from('transactions')
      .delete()
      .eq('id', draft.last_transaction_id)
      .eq('household_id', link.household_id);
    error = res.error;
  }

  if (error) {
    await tg.sendMessage(chatId, 'Não deu para desfazer (já removido?).');
    return;
  }

  await sb
    .from('capture_drafts')
    .update({
      last_transaction_id: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', draft.id);

  await tg.sendMessage(
    chatId,
    group ? 'Parcelas desfeitas.' : 'Lançamento desfeito.',
  );
}

async function refreshPreview(
  sb: SupabaseClient,
  tg: Tg,
  link: LinkRow,
  draftId: string,
  payload: ResolvedDraft,
  chatId: number,
  messageId?: number,
) {
  const ctx = await loadContext(sb, link.household_id);
  const mid = messageId ?? payload.telegramMessageId;
  const body = formatPreview(payload, ctx, link, { askConfirm: true });
  const markup = confirmKeyboard(draftId, keyboardOpts(payload));

  if (mid != null) {
    try {
      await tg.editMessageText(chatId, mid, body, {
        reply_markup: markup,
        ...htmlParse,
      });
      return;
    } catch {
      // fallback: nova mensagem
    }
  }

  const msg = await tg.sendMessage(chatId, body, {
    reply_markup: markup,
    ...htmlParse,
  });
  payload.telegramMessageId = msg.message_id;
  await sb
    .from('capture_drafts')
    .update({ payload, updated_at: new Date().toISOString() })
    .eq('id', draftId);
}

async function patchDraftAmount(
  sb: SupabaseClient,
  tg: Tg,
  link: LinkRow,
  pending: { id: string; payload: ResolvedDraft },
  text: string,
  chatId: number,
) {
  let cents = 0;
  try {
    cents = parseAmount(text);
  } catch {
    cents = 0;
  }
  if (cents <= 0) {
    await tg.sendMessage(chatId, 'Valor inválido.');
    return;
  }
  const payload: ResolvedDraft = {
    ...pending.payload,
    amountRaw: text.trim(),
    amountCents: cents,
    confidence: 1,
    warnings: [],
  };
  await sb
    .from('capture_drafts')
    .update({ payload, updated_at: new Date().toISOString() })
    .eq('id', pending.id);

  await refreshPreview(sb, tg, link, pending.id, payload, chatId);
}

async function patchDraftWho(
  sb: SupabaseClient,
  tg: Tg,
  link: LinkRow,
  draftId: string,
  who: string,
  chatId: number,
  messageId?: number,
) {
  const { data: draftRow } = await sb
    .from('capture_drafts')
    .select('*')
    .eq('id', draftId)
    .eq('status', 'pending')
    .maybeSingle();
  if (!draftRow) {
    await tg.sendMessage(chatId, 'Rascunho não encontrado.');
    return;
  }
  const payload = draftRow.payload as ResolvedDraft;
  const ctx = await loadContext(sb, link.household_id);
  const mePerson =
    ctx.people.find((p) => p.user_id === link.user_id)?.id ?? link.person_id;
  payload.personHint = who;
  payload.personId = resolvePersonHint(who, ctx.people, mePerson, link.person_id);
  if (messageId != null) payload.telegramMessageId = messageId;

  await sb
    .from('capture_drafts')
    .update({ payload, updated_at: new Date().toISOString() })
    .eq('id', draftId);

  await refreshPreview(sb, tg, link, draftId, payload, chatId, messageId);
}

async function patchDraftFromReply(
  sb: SupabaseClient,
  tg: Tg,
  link: LinkRow,
  pending: { id: string; payload: ResolvedDraft },
  text: string,
  chatId: number,
) {
  const trimmed = text.trim();
  const payload = { ...pending.payload };

  if (/^\s*(R\$\s*)?\d+[.,]?\d*\s*$/i.test(trimmed)) {
    await patchDraftAmount(sb, tg, link, pending, trimmed, chatId);
    return;
  }

  const whoOnly = trimmed.toLowerCase();
  if (whoOnly === 'casa' || whoOnly === 'eu') {
    await patchDraftWho(
      sb,
      tg,
      link,
      pending.id,
      whoOnly,
      chatId,
      payload.telegramMessageId,
    );
    return;
  }

  // Descrição (ou re-parse completo se parecer estruturado)
  const reparsed = cheapParseMessage(trimmed);
  if (reparsed && reparsed.description) {
    let cents = payload.amountCents;
    try {
      cents = parseAmount(reparsed.amountRaw);
    } catch {
      /* keep */
    }
    Object.assign(payload, {
      kind: reparsed.kind,
      amountRaw: reparsed.amountRaw,
      amountCents: cents > 0 ? cents : payload.amountCents,
      description: reparsed.description,
      date: reparsed.date ?? payload.date,
      personHint: reparsed.personHint ?? payload.personHint,
      confidence: 1,
      warnings: [],
    });
    if (reparsed.personHint) {
      const ctx = await loadContext(sb, link.household_id);
      const mePerson =
        ctx.people.find((p) => p.user_id === link.user_id)?.id ?? link.person_id;
      payload.personId = resolvePersonHint(
        reparsed.personHint,
        ctx.people,
        mePerson,
        link.person_id,
      );
    }
  } else {
    payload.description = trimmed.slice(0, 200);
    payload.confidence = 1;
  }

  await sb
    .from('capture_drafts')
    .update({ payload, updated_at: new Date().toISOString() })
    .eq('id', pending.id);

  await refreshPreview(
    sb,
    tg,
    link,
    pending.id,
    payload,
    chatId,
    payload.telegramMessageId,
  );
}

async function handleUltimo(
  sb: SupabaseClient,
  tg: Tg,
  link: LinkRow,
  chatId: number,
  fromId: number,
) {
  const { data } = await sb
    .from('transactions')
    .select('description, kind')
    .eq('household_id', link.household_id)
    .eq('source', 'telegram')
    .eq('created_by', link.user_id)
    .order('created_at', { ascending: false })
    .limit(40);

  const seen = new Set<string>();
  const labels: string[] = [];
  for (const row of data ?? []) {
    const desc = String(row.description ?? '').trim();
    if (!desc) continue;
    const key = desc.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    labels.push(desc);
    if (labels.length >= 6) break;
  }

  if (labels.length === 0) {
    await tg.sendMessage(
      chatId,
      'Nenhum lançamento recente pelo bot. Lance algo e use /ultimo depois.',
    );
    return;
  }

  reuseLabels.set(fromId, {
    labels,
    expires: Date.now() + AMOUNT_WAIT_TTL_MS,
  });

  await tg.sendMessage(
    chatId,
    'Últimos — toque na descrição e envie só o valor:',
    { reply_markup: reuseKeyboard(labels) },
  );
}

async function handleReusePick(
  tg: Tg,
  fromId: number,
  chatId: number,
  idx: number,
) {
  const pack = reuseLabels.get(fromId);
  if (!pack || pack.expires < Date.now()) {
    reuseLabels.delete(fromId);
    await tg.sendMessage(chatId, 'Lista expirada. Envie /ultimo de novo.');
    return;
  }
  const description = pack.labels[idx];
  if (!description) {
    await tg.sendMessage(chatId, 'Opção inválida.');
    return;
  }
  amountWaits.set(fromId, {
    description,
    kind: 'expense',
    expires: Date.now() + AMOUNT_WAIT_TTL_MS,
  });
  await tg.sendMessage(
    chatId,
    `Quanto foi em «${description}»?\nEnvie só o valor (ex. 35,90).`,
  );
}

async function handleDraftMenu(
  sb: SupabaseClient,
  tg: Tg,
  link: LinkRow,
  data: string,
  chatId: number,
  messageId?: number,
) {
  const parts = data.split(':');
  const kind = parts[0]; // menu | set | back
  const ctx = await loadContext(sb, link.household_id);

  if (kind === 'back') {
    const draftId = parts[1]!;
    const row = await getDraftRow(sb, draftId, link.telegram_user_id);
    if (!row) {
      await tg.sendMessage(chatId, 'Rascunho não encontrado.');
      return;
    }
    await refreshPreview(
      sb,
      tg,
      link,
      draftId,
      row.payload,
      chatId,
      messageId ?? row.payload.telegramMessageId,
    );
    return;
  }

  if (kind === 'menu') {
    const sub = parts[1]!; // a | c | d | t
    const draftId = parts[2]!;
    const row = await getDraftRow(sb, draftId, link.telegram_user_id);
    if (!row || messageId == null) return;
    const body = formatPreview(row.payload, ctx, link, { askConfirm: true });
    let markup;
    if (sub === 'a') {
      markup = accountsKeyboard(draftId, ctx.accounts, 'from');
    } else if (sub === 't') {
      markup = accountsKeyboard(draftId, ctx.accounts, 'to');
    } else if (sub === 'c') {
      const pool = ctx.categories.filter(
        (c) => c.kind === (row.payload.kind === 'income' ? 'income' : 'expense'),
      );
      markup = categoriesKeyboard(draftId, pool);
    } else {
      markup = dateKeyboard(draftId);
    }
    await tg
      .editMessageText(chatId, messageId, body, {
        reply_markup: markup,
        ...htmlParse,
      })
      .catch(() => undefined);
    return;
  }

  if (kind === 'set') {
    const sub = parts[1]!; // a | c | d | t
    const draftId = parts[2]!;
    const value = parts[3]!;
    const row = await getDraftRow(sb, draftId, link.telegram_user_id);
    if (!row) {
      await tg.sendMessage(chatId, 'Rascunho não encontrado.');
      return;
    }
    const payload = { ...row.payload };
    if (messageId != null) payload.telegramMessageId = messageId;

    if (sub === 'a') {
      const idx = Number(value);
      const acc = ctx.accounts[idx];
      if (acc) {
        payload.accountId = acc.id;
        payload.accountHint = acc.name;
        payload.warnings = payload.warnings.filter(
          (w) => !w.includes('origem') && !w.includes('Destino'),
        );
      }
    } else if (sub === 't') {
      const idx = Number(value);
      const acc = ctx.accounts[idx];
      if (acc) {
        payload.transferAccountId = acc.id;
        payload.transferAccountHint = acc.name;
        payload.kind = 'transfer';
        payload.categoryId = null;
        payload.warnings = payload.warnings.filter(
          (w) => !w.includes('origem') && !w.includes('Destino'),
        );
      }
    } else if (sub === 'c') {
      const pool = ctx.categories.filter(
        (c) => c.kind === (payload.kind === 'income' ? 'income' : 'expense'),
      );
      const idx = Number(value);
      const cat = pool[idx];
      if (cat) {
        payload.categoryId = cat.id;
        payload.categoryHint = cat.name;
        await learnCategorizationRule(sb, link, payload.description, cat.id, payload.personId);
      }
    } else if (sub === 'd') {
      const offset = Number(value); // 0 hoje, 1 ontem, 2 anteontem
      if (offset >= 0 && offset <= 2) {
        payload.date = isoDateOffset(-offset);
      }
    }

    await sb
      .from('capture_drafts')
      .update({ payload, updated_at: new Date().toISOString() })
      .eq('id', draftId);

    await refreshPreview(sb, tg, link, draftId, payload, chatId, messageId);
  }
}

async function toggleLineItems(
  sb: SupabaseClient,
  tg: Tg,
  link: LinkRow,
  draftId: string,
  chatId: number,
  messageId?: number,
) {
  const row = await getDraftRow(sb, draftId, link.telegram_user_id);
  if (!row) {
    await tg.sendMessage(chatId, 'Rascunho não encontrado.');
    return;
  }
  if (!row.payload.lineItems || row.payload.lineItems.length < 2) {
    await tg.sendMessage(chatId, 'Este cupom não tem itens detalhados.');
    return;
  }
  const payload = {
    ...row.payload,
    useLineItems: !row.payload.useLineItems,
  };
  if (messageId != null) payload.telegramMessageId = messageId;
  await sb
    .from('capture_drafts')
    .update({ payload, updated_at: new Date().toISOString() })
    .eq('id', draftId);
  await refreshPreview(sb, tg, link, draftId, payload, chatId, messageId);
}

async function getDraftRow(
  sb: SupabaseClient,
  draftId: string,
  telegramUserId: number,
): Promise<{ id: string; payload: ResolvedDraft } | null> {
  const { data } = await sb
    .from('capture_drafts')
    .select('id, payload')
    .eq('id', draftId)
    .eq('telegram_user_id', telegramUserId)
    .eq('status', 'pending')
    .maybeSingle();
  if (!data) return null;
  return { id: data.id, payload: data.payload as ResolvedDraft };
}

async function learnCategorizationRule(
  sb: SupabaseClient,
  link: LinkRow,
  description: string,
  categoryId: string,
  personId: string | null,
) {
  const fp = fingerprint(description);
  if (!fp) return;

  const { data: existing } = await sb
    .from('categorization_rules')
    .select('id')
    .eq('household_id', link.household_id)
    .eq('fingerprint', fp)
    .maybeSingle();

  const now = new Date().toISOString();
  if (existing) {
    await sb
      .from('categorization_rules')
      .update({
        category_id: categoryId,
        match_example: description.slice(0, 200),
        person_id: personId,
        enabled: true,
        updated_at: now,
      })
      .eq('id', existing.id);
  } else {
    await sb.from('categorization_rules').insert({
      household_id: link.household_id,
      fingerprint: fp,
      match_example: description.slice(0, 200),
      category_id: categoryId,
      person_id: personId,
      enabled: true,
      hits: 0,
      updated_at: now,
    });
  }

  contextCache.delete(link.household_id);
}

async function getActiveLink(
  sb: SupabaseClient,
  telegramUserId: number,
): Promise<LinkRow | null> {
  const { data } = await sb
    .from('telegram_links')
    .select('*')
    .eq('telegram_user_id', telegramUserId)
    .is('revoked_at', null)
    .maybeSingle();
  return data as LinkRow | null;
}

async function getPendingDraft(
  sb: SupabaseClient,
  telegramUserId: number,
): Promise<{ id: string; payload: ResolvedDraft } | null> {
  const { data } = await sb
    .from('capture_drafts')
    .select('id, payload')
    .eq('telegram_user_id', telegramUserId)
    .eq('status', 'pending')
    .gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data) return null;
  return { id: data.id, payload: data.payload as ResolvedDraft };
}

async function getPendingDraftByMessage(
  sb: SupabaseClient,
  telegramUserId: number,
  messageId: number,
): Promise<{ id: string; payload: ResolvedDraft } | null> {
  const pending = await getPendingDraft(sb, telegramUserId);
  if (!pending) return null;
  if (pending.payload.telegramMessageId === messageId) return pending;
  return null;
}

async function expirePendingDrafts(sb: SupabaseClient, telegramUserId: number) {
  await sb
    .from('capture_drafts')
    .update({ status: 'expired', updated_at: new Date().toISOString() })
    .eq('telegram_user_id', telegramUserId)
    .eq('status', 'pending');
}

async function loadContext(sb: SupabaseClient, householdId: string) {
  const cached = contextCache.get(householdId);
  if (cached && Date.now() - cached.at < CONTEXT_CACHE_TTL_MS) {
    return cached.value;
  }
  const value = await fetchContext(sb, householdId);
  contextCache.set(householdId, { at: Date.now(), value });
  return value;
}

async function fetchContext(sb: SupabaseClient, householdId: string) {
  const [accounts, people, categories, rules] = await Promise.all([
    sb
      .from('accounts')
      .select('id, name, kind, closing_day')
      .eq('household_id', householdId)
      .eq('archived', false)
      .order('sort'),
    sb
      .from('people')
      .select('id, name, short_name, user_id')
      .eq('household_id', householdId)
      .order('sort'),
    sb
      .from('categories')
      .select('id, name, kind')
      .eq('household_id', householdId)
      .order('sort'),
    sb
      .from('categorization_rules')
      .select('fingerprint, category_id')
      .eq('household_id', householdId)
      .eq('enabled', true),
  ]);

  const acc = accounts.data ?? [];
  const peo = people.data ?? [];
  const cat = categories.data ?? [];
  const rul = rules.data ?? [];

  return {
    accounts: acc,
    people: peo,
    categories: cat,
    rules: rul,
    labels: {
      accounts: acc.map((a) => a.name),
      people: peo.map((p) => p.short_name || p.name),
      categories: cat.map((c) => c.name),
    },
  };
}


