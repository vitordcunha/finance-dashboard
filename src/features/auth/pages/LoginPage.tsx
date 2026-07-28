import { useState, type FormEvent } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Panel } from '@/components/ui/Panel';
import { useAuth } from '@/features/auth/hooks/useAuth';
import { getSupabaseEnv } from '@/data/supabase/client';
import { APP_NAME } from '@/lib/constants';

export function LoginPage() {
  const { configured, user, signIn, signUp, loading } = useAuth();
  const navigate = useNavigate();
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (!configured) {
    return <Navigate to="/setup" replace />;
  }

  if (!loading && user) {
    return <Navigate to="/" replace />;
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setInfo(null);
    setSubmitting(true);
    try {
      if (mode === 'signin') {
        await signIn(email.trim(), password);
        navigate('/', { replace: true });
      } else {
        const result = await signUp(email.trim(), password);
        if (result.needsEmailConfirm) {
          setInfo(
            'Conta criada. Confirme o e-mail (ou desative confirmação no Supabase Auth) e entre.',
          );
          setMode('signin');
        } else {
          navigate('/onboarding', { replace: true });
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha na autenticação');
    } finally {
      setSubmitting(false);
    }
  }

  const env = getSupabaseEnv();

  return (
    <div className="flex min-h-dvh items-center justify-center bg-bg px-4">
      <Panel className="w-full max-w-md p-6 md:p-8">
        <div className="mb-6 flex items-center gap-2.5">
          <span
            className="flex size-7 items-center justify-center rounded-md bg-accent-muted"
            aria-hidden
          >
            <span className="size-2.5 rounded-sm bg-accent" />
          </span>
          <p className="font-display text-sm font-medium tracking-tight text-accent">
            {APP_NAME}
          </p>
        </div>

        <h1 className="font-display text-2xl font-medium tracking-tight">
          {mode === 'signin' ? 'Entrar' : 'Criar conta'}
        </h1>
        <p className="mt-2 text-sm text-text-muted">
          App do casal — cada um com o próprio login, mesma casa.
        </p>

        <form className="mt-6 space-y-4" onSubmit={onSubmit}>
          <Input
            label="E-mail"
            name="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <Input
            label="Senha"
            name="password"
            type="password"
            autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
            required
            minLength={6}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />

          {error ? <p className="text-sm text-danger">{error}</p> : null}
          {info ? <p className="text-sm text-income">{info}</p> : null}

          <Button type="submit" className="w-full" disabled={submitting}>
            {submitting ? 'Aguarde…' : mode === 'signin' ? 'Entrar' : 'Criar conta'}
          </Button>
        </form>

        <div className="mt-5 flex items-center justify-between text-sm">
          <button
            type="button"
            className="text-accent hover:underline"
            onClick={() => {
              setMode((m) => (m === 'signin' ? 'signup' : 'signin'));
              setError(null);
              setInfo(null);
            }}
          >
            {mode === 'signin' ? 'Criar conta' : 'Já tenho conta'}
          </button>
          <Link to="/setup" className="text-text-muted hover:text-text">
            Setup
          </Link>
        </div>

        <p
          className="mt-6 truncate font-mono text-[11px] text-text-muted"
          title={env.url}
        >
          {env.url.replace(/^https?:\/\//, '')}
        </p>
      </Panel>
    </div>
  );
}
