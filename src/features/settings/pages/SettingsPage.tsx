import { Link } from 'react-router-dom';
import {
  ChevronRight,
  CreditCard,
  LogOut,
  Target,
  TrendingUp,
} from 'lucide-react';
import { useAuth } from '@/features/auth/hooks/useAuth';
import { useHousehold } from '@/features/auth/hooks/useHousehold';
import { BalancesSection } from '@/features/balances/components/BalancesSection';
import { AccountsSection } from '@/features/settings/components/AccountsSection';
import { CategoriesSection } from '@/features/settings/components/CategoriesSection';
import { ContributionModeSection } from '@/features/settings/components/ContributionModeSection';
import { PeopleSection } from '@/features/settings/components/PeopleSection';
import { TelegramSection } from '@/features/settings/components/TelegramSection';
import { Button } from '@/components/ui/Button';
import { PageHeader } from '@/components/ui/PageHeader';
import { Panel } from '@/components/ui/Panel';
import { cn } from '@/lib/cn';

const secondary = [
  { to: '/cards', label: 'Cartões', hint: 'Faturas e limite', icon: CreditCard },
  { to: '/future', label: 'Futuro', hint: 'Projeção e âncora', icon: TrendingUp },
  { to: '/goals', label: 'Metas', hint: 'Objetivos', icon: Target },
] as const;

export function SettingsPage() {
  const { user, signOut } = useAuth();
  const { household } = useHousehold();

  return (
    <div className="mx-auto max-w-2xl space-y-8 animate-fade-in">
      <PageHeader
        eyebrow="Mais"
        title="Configurações"
        description="Pessoas, contas, Telegram, saldos reais, categorias e cota da casa."
      />

      <Panel className="md:hidden">
        <ul className="divide-y divide-border">
          {secondary.map(({ to, label, hint, icon: Icon }) => (
            <li key={to}>
              <Link
                to={to}
                className={cn(
                  'flex min-h-14 items-center gap-3 px-4 py-3 text-text transition-colors',
                  'hover:bg-surface-hover',
                )}
              >
                <span className="flex size-9 items-center justify-center rounded-lg border border-border bg-accent-muted text-accent">
                  <Icon className="size-4" strokeWidth={1.75} aria-hidden />
                </span>
                <span className="flex-1">
                  <span className="block text-sm font-medium">{label}</span>
                  <span className="text-xs text-text-muted">{hint}</span>
                </span>
                <ChevronRight className="size-4 text-text-muted" aria-hidden />
              </Link>
            </li>
          ))}
        </ul>
      </Panel>

      <PeopleSection />
      <TelegramSection />
      <AccountsSection />
      <BalancesSection />
      <CategoriesSection />
      <ContributionModeSection />

      <Panel className="space-y-4 p-5">
        <div>
          <p className="font-mono text-[11px] uppercase tracking-[0.12em] text-text-muted">
            Casa
          </p>
          <p className="mt-2 text-sm text-text">
            {household?.name ?? '—'}
            {household?.invite_code ? (
              <>
                {' '}
                · convite{' '}
                <code className="rounded border border-border bg-bg px-1.5 py-0.5 font-mono text-xs text-accent">
                  {household.invite_code}
                </code>
              </>
            ) : null}
          </p>
          <p className="mt-1 font-mono text-xs text-text-muted">{user?.email}</p>
        </div>
        <Button
          variant="secondary"
          className="gap-2"
          onClick={() => void signOut()}
        >
          <LogOut className="size-4" aria-hidden />
          Sair
        </Button>
      </Panel>
    </div>
  );
}
