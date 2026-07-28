import { getSupabase } from '@/data/supabase/client';
import type { Tables } from '@/data/supabase/types';

export type TelegramLink = Tables<'telegram_links'>;
export type TelegramLinkCode = Tables<'telegram_link_codes'>;

export async function getMyTelegramLink(): Promise<TelegramLink | null> {
  const { data, error } = await getSupabase()
    .from('telegram_links')
    .select('*')
    .is('revoked_at', null)
    .maybeSingle();

  if (error) throw error;
  return data;
}

export async function createTelegramLinkCode(
  personId?: string | null,
  ttlMinutes = 15,
): Promise<TelegramLinkCode> {
  const { data, error } = await getSupabase().rpc('create_telegram_link_code', {
    p_person_id: personId ?? null,
    p_ttl_minutes: ttlMinutes,
  });

  if (error) throw error;
  return data;
}

export async function revokeTelegramLink(linkId: string): Promise<void> {
  const { error } = await getSupabase()
    .from('telegram_links')
    .update({ revoked_at: new Date().toISOString() })
    .eq('id', linkId);

  if (error) throw error;
}

export async function updateTelegramLinkDefaults(input: {
  linkId: string;
  personId?: string | null;
  defaultAccountId?: string | null;
}): Promise<TelegramLink> {
  const patch: {
    person_id?: string | null;
    default_account_id?: string | null;
  } = {};
  if (input.personId !== undefined) patch.person_id = input.personId;
  if (input.defaultAccountId !== undefined) {
    patch.default_account_id = input.defaultAccountId;
  }

  const { data, error } = await getSupabase()
    .from('telegram_links')
    .update(patch)
    .eq('id', input.linkId)
    .select('*')
    .single();

  if (error) throw error;
  return data;
}

/** Username do bot (sem @), via env pública. */
export function getTelegramBotUsername(): string | null {
  const raw = import.meta.env.VITE_TELEGRAM_BOT_USERNAME as string | undefined;
  if (!raw?.trim()) return null;
  return raw.trim().replace(/^@/, '');
}
