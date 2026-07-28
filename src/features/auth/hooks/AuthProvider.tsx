import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { getSupabaseEnv, tryGetSupabase } from '@/data/supabase/client';
import { qk } from '@/data/query-keys';
import { AuthContext, type AuthContextValue } from '@/features/auth/hooks/auth-context';

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const configured = getSupabaseEnv().isConfigured;
  const [loading, setLoading] = useState(configured);
  const [session, setSession] = useState<AuthContextValue['session']>(null);

  useEffect(() => {
    if (!configured) {
      setLoading(false);
      return;
    }

    const supabase = tryGetSupabase();
    if (!supabase) {
      setLoading(false);
      return;
    }

    let mounted = true;

    void supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      setSession(data.session);
      setLoading(false);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
      void queryClient.invalidateQueries({ queryKey: qk.session });
      void queryClient.invalidateQueries({ queryKey: qk.household() });
    });

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, [configured, queryClient]);

  const signIn = useCallback(async (email: string, password: string) => {
    const supabase = tryGetSupabase();
    if (!supabase) throw new Error('Supabase não configurado');
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
  }, []);

  const signUp = useCallback(async (email: string, password: string) => {
    const supabase = tryGetSupabase();
    if (!supabase) throw new Error('Supabase não configurado');
    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error) throw error;
    return { needsEmailConfirm: !data.session };
  }, []);

  const signOut = useCallback(async () => {
    const supabase = tryGetSupabase();
    if (!supabase) return;
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
    queryClient.clear();
  }, [queryClient]);

  const value = useMemo<AuthContextValue>(
    () => ({
      configured,
      loading,
      session,
      user: session?.user ?? null,
      signIn,
      signUp,
      signOut,
    }),
    [configured, loading, session, signIn, signUp, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
