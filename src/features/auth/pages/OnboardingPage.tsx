import { useState, type FormEvent } from 'react';
import { Navigate } from 'react-router-dom';
import { LogOut } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Panel } from '@/components/ui/Panel';
import { PageSpinner } from '@/components/feedback/PageSpinner';
import { useAuth } from '@/features/auth/hooks/useAuth';
import { useHousehold } from '@/features/auth/hooks/useHousehold';

export function OnboardingPage() {
  const { user, loading: authLoading, signOut } = useAuth();
  const { household, loading, create, join } = useHousehold();
  const [tab, setTab] = useState<'create' | 'join'>('create');
  const [name, setName] = useState('Nossa casa');
  const [code, setCode] = useState('casa2026');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  if (authLoading || loading) return <PageSpinner />;
  if (!user) return <Navigate to="/login" replace />;
  if (household) return <Navigate to="/" replace />;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      if (tab === 'create') await create(name.trim() || 'Nossa casa');
      else await join(code.trim());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível continuar');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-dvh items-center justify-center bg-bg px-4">
      <Panel className="w-full max-w-md p-6 md:p-8">
        <p className="font-mono text-[11px] uppercase tracking-[0.12em] text-text-muted">
          Onboarding
        </p>
        <h1 className="mt-2 font-display text-2xl font-medium tracking-tight">
          Sua casa
        </h1>
        <p className="mt-2 text-sm text-text-muted">
          Crie a casa do casal ou entre com o código de convite (seed demo:{' '}
          <span className="font-mono text-accent">casa2026</span>).
        </p>

        <div className="mt-5 flex gap-2 rounded-lg border border-border bg-bg p-1">
          <Button
            variant={tab === 'create' ? 'primary' : 'ghost'}
            className="h-8 flex-1 rounded-md"
            onClick={() => setTab('create')}
          >
            Criar casa
          </Button>
          <Button
            variant={tab === 'join' ? 'primary' : 'ghost'}
            className="h-8 flex-1 rounded-md"
            onClick={() => setTab('join')}
          >
            Tenho código
          </Button>
        </div>

        <form className="mt-6 space-y-4" onSubmit={onSubmit}>
          {tab === 'create' ? (
            <Input
              label="Nome da casa"
              name="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          ) : (
            <Input
              label="Código de convite"
              name="code"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              autoCapitalize="off"
            />
          )}

          {error ? <p className="text-sm text-danger">{error}</p> : null}

          <Button type="submit" className="w-full" disabled={submitting}>
            {submitting ? 'Aguarde…' : tab === 'create' ? 'Criar' : 'Entrar na casa'}
          </Button>
        </form>

        <Button
          type="button"
          variant="ghost"
          className="mt-4 w-full gap-2 text-text-muted"
          disabled={signingOut || submitting}
          onClick={() => {
            setSigningOut(true);
            void signOut().finally(() => setSigningOut(false));
          }}
        >
          <LogOut className="size-4" aria-hidden />
          {signingOut ? 'Saindo…' : 'Sair'}
        </Button>
      </Panel>
    </div>
  );
}
