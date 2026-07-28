import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { CalendarRange, LogOut, MoreHorizontal, Wallet } from 'lucide-react';
import { cn } from '@/lib/cn';
import { useAuth } from '@/features/auth/hooks/useAuth';
import { useHousehold } from '@/features/auth/hooks/useHousehold';
import { Button } from '@/components/ui/Button';
import { APP_NAME } from '@/lib/constants';

/**
 * Dois destinos.
 *
 * Painel, Mês, Futuro, Plano e Linha do tempo eram recortes do mesmo dado com
 * cálculos diferentes. Viraram um mês por vez em `/`. O botão de lançamento
 * mora na própria página, que é quem sabe qual mês está aberto.
 */
const nav: {
  to: string;
  label: string;
  icon: typeof Wallet;
  end?: boolean;
  activePrefix?: string;
}[] = [
  { to: '/', label: 'Mês a mês', icon: CalendarRange, end: true },
  { to: '/more', label: 'Mais', icon: MoreHorizontal, activePrefix: '/more' },
];

function navIsActive(
  pathname: string,
  isActive: boolean,
  activePrefix?: string,
): boolean {
  if (activePrefix) return pathname.startsWith(activePrefix);
  return isActive;
}

export function AppLayout() {
  const { user, signOut } = useAuth();
  const { household } = useHousehold();
  const { pathname } = useLocation();

  return (
    <div className="min-h-dvh bg-bg text-text">
      <div className="flex min-h-dvh">
        <aside className="hidden w-60 shrink-0 flex-col border-r border-border bg-surface md:flex">
          <div className="flex items-center gap-2.5 px-5 py-5">
            <span
              className="flex size-7 items-center justify-center rounded-md bg-accent-muted text-accent"
              aria-hidden
            >
              <span className="size-2.5 rounded-sm bg-accent" />
            </span>
            <div className="min-w-0">
              <p className="truncate font-display text-sm font-medium tracking-tight">
                {APP_NAME}
              </p>
              <p className="truncate text-xs text-text-muted">
                {household?.name ?? 'Sua casa'}
              </p>
            </div>
          </div>

          <nav className="flex flex-1 flex-col gap-0.5 px-3 pt-1" aria-label="Principal">
            {nav.map(({ to, label, icon: Icon, end, activePrefix }) => (
              <NavLink
                key={label}
                to={to}
                end={end}
                className={({ isActive }) =>
                  cn(
                    'group relative flex min-h-9 items-center gap-2.5 rounded-md px-3 text-sm transition-colors',
                    navIsActive(pathname, isActive, activePrefix)
                      ? 'bg-accent-muted text-accent'
                      : 'text-text-muted hover:bg-surface-hover hover:text-text',
                  )
                }
              >
                {({ isActive }) => {
                  const active = navIsActive(pathname, isActive, activePrefix);
                  return (
                    <>
                      {active ? (
                        <span
                          className="absolute left-0 top-1.5 bottom-1.5 w-0.5 rounded-full bg-accent"
                          aria-hidden
                        />
                      ) : null}
                      <Icon className="size-4 shrink-0" strokeWidth={1.75} aria-hidden />
                      <span className="font-medium">{label}</span>
                    </>
                  );
                }}
              </NavLink>
            ))}
          </nav>

          <div className="mt-auto space-y-2 border-t border-border p-3">
            <p className="truncate px-2 font-mono text-[11px] text-text-muted">
              {user?.email}
            </p>
            <Button
              variant="ghost"
              className="h-9 w-full justify-start gap-2 rounded-md px-2 text-sm"
              onClick={() => void signOut()}
            >
              <LogOut className="size-4" aria-hidden />
              Sair
            </Button>
          </div>
        </aside>

        <div className="relative flex min-w-0 flex-1 flex-col">
          <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-6 pb-28 md:px-8 md:py-8 md:pb-8">
            <Outlet />
          </main>

          <nav
            className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-surface/95 backdrop-blur-md md:hidden"
            style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
            aria-label="Navegação principal"
          >
            <div className="mx-auto grid max-w-lg grid-cols-2 px-1 pb-1 pt-1">
              {nav.map(({ to, label, icon: Icon, end, activePrefix }) => (
                <MobileNavItem
                  key={label}
                  to={to}
                  label={label}
                  icon={Icon}
                  end={end}
                  activePrefix={activePrefix}
                />
              ))}
            </div>
          </nav>
        </div>
      </div>
    </div>
  );
}

function MobileNavItem({
  to,
  label,
  icon: Icon,
  end,
  activePrefix,
}: {
  to: string;
  label: string;
  icon: typeof Wallet;
  end?: boolean;
  activePrefix?: string;
}) {
  const { pathname } = useLocation();
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        cn(
          'flex min-h-12 flex-col items-center justify-center gap-0.5 rounded-md text-[10px] font-medium',
          navIsActive(pathname, isActive, activePrefix)
            ? 'text-accent'
            : 'text-text-muted',
        )
      }
    >
      <Icon className="size-5" strokeWidth={1.75} aria-hidden />
      <span>{label}</span>
    </NavLink>
  );
}
