import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/data/supabase/types';

export type AppSupabaseClient = SupabaseClient<Database>;

let client: AppSupabaseClient | null = null;

function readKey(): string {
  // Novo padrão Supabase (recomendado). Anon ainda funciona na aba Legacy.
  const publishable = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  const legacyAnon = import.meta.env.VITE_SUPABASE_ANON_KEY;
  const raw =
    (typeof publishable === 'string' && publishable) ||
    (typeof legacyAnon === 'string' && legacyAnon) ||
    '';
  return raw.trim();
}

function isPlaceholderKey(key: string) {
  return (
    !key ||
    key.includes('your_') ||
    key.includes('YOUR_') ||
    key === 'your_anon_key' ||
    key === 'your_publishable_key'
  );
}

export function getSupabaseEnv() {
  const url = typeof import.meta.env.VITE_SUPABASE_URL === 'string' ? import.meta.env.VITE_SUPABASE_URL : '';
  const key = readKey();
  return {
    url,
    /** Chave pública do client (publishable ou anon legacy) */
    key,
    /** @deprecated use `key` — mantido por compatibilidade */
    anonKey: key,
    isConfigured: Boolean(
      url &&
        !url.includes('YOUR_PROJECT') &&
        key &&
        !isPlaceholderKey(key),
    ),
  };
}

export function getSupabase(): AppSupabaseClient {
  if (client) return client;

  const { url, key, isConfigured } = getSupabaseEnv();
  if (!isConfigured) {
    throw new Error(
      'Supabase não configurado. Defina VITE_SUPABASE_URL e VITE_SUPABASE_PUBLISHABLE_KEY em .env',
    );
  }

  client = createClient<Database>(url, key, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  });
  return client;
}

/** Cliente opcional — não lança se env faltar (telas de setup). */
export function tryGetSupabase(): AppSupabaseClient | null {
  try {
    if (!getSupabaseEnv().isConfigured) return null;
    return getSupabase();
  } catch {
    return null;
  }
}
