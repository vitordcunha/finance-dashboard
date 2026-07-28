import { Link } from 'react-router-dom';
import { getSupabaseEnv } from '@/data/supabase/client';
import { Panel } from '@/components/ui/Panel';

export function SetupPage() {
  const env = getSupabaseEnv();

  return (
    <div className="flex min-h-dvh items-center justify-center bg-bg px-4">
      <Panel className="w-full max-w-lg p-6 md:p-8">
        <p className="font-mono text-[11px] uppercase tracking-[0.12em] text-text-muted">
          Setup
        </p>
        <h1 className="mt-2 font-display text-2xl font-medium tracking-tight">
          Configurar Supabase
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-text-muted">
          A Fase 1 precisa de um projeto Supabase. Copie as chaves para{' '}
          <code className="rounded border border-border bg-bg px-1 py-0.5 font-mono text-xs text-text">
            .env.local
          </code>{' '}
          e aplique as migrations. Guia:{' '}
          <code className="font-mono text-xs text-text">docs/SUPABASE-SETUP.md</code>.
        </p>

        <ul className="mt-5 space-y-2 text-sm text-text-muted">
          <li className="flex items-center gap-2">
            <span
              className={
                env.isConfigured
                  ? 'size-1.5 rounded-full bg-accent'
                  : 'size-1.5 rounded-full bg-danger'
              }
              aria-hidden
            />
            Status:{' '}
            <strong className={env.isConfigured ? 'text-income' : 'text-danger'}>
              {env.isConfigured ? 'configurado' : 'faltando variáveis'}
            </strong>
          </li>
          <li>
            Variáveis: <code className="font-mono text-xs">VITE_SUPABASE_URL</code> e{' '}
            <code className="font-mono text-xs">VITE_SUPABASE_PUBLISHABLE_KEY</code>
          </li>
          <li>
            Seed demo: código{' '}
            <code className="font-mono text-xs text-accent">casa2026</code>
          </li>
        </ul>

        {!env.isConfigured ? (
          <pre className="mt-6 overflow-x-auto rounded-lg border border-border bg-bg p-4 font-mono text-xs leading-relaxed text-text-muted">
            {`VITE_SUPABASE_URL=https://xxxx.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...`}
          </pre>
        ) : (
          <p className="mt-6 text-sm text-income">Ambiente ok — você pode entrar.</p>
        )}

        <Link
          to="/login"
          className="mt-6 inline-flex min-h-10 items-center justify-center rounded-full bg-accent px-4 text-sm font-medium text-accent-fg hover:bg-[#2bbd7e]"
        >
          Ir para login
        </Link>
      </Panel>
    </div>
  );
}
