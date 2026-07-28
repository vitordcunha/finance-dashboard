import { Link } from 'react-router-dom';
import {
  ChevronRight,
  CreditCard,
  Download,
  LogOut,
  Settings2,
  Target,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { PageHeader } from '@/components/ui/PageHeader';
import { useAuth } from '@/features/auth/hooks/useAuth';

/**
 * Tudo que não é o mês.
 *
 * Existe porque a navegação anterior escondia rotas sem nenhum link de entrada:
 * Cartões, Metas e Import só eram alcançáveis digitando a URL.
 */
const LINKS: {
  to: string;
  label: string;
  hint: string;
  icon: typeof CreditCard;
}[] = [
  {
    to: '/import',
    label: 'Importar extrato',
    hint: 'Traz os lançamentos reais do banco',
    icon: Download,
  },
  {
    to: '/settings',
    label: 'Contas, categorias e saldo real',
    hint: 'O saldo real é de onde a linha do tempo parte',
    icon: Settings2,
  },
  {
    to: '/cards',
    label: 'Cartões',
    hint: 'Fatura, limite e competência',
    icon: CreditCard,
  },
  {
    to: '/goals',
    label: 'Metas',
    hint: 'Objetivos de poupança',
    icon: Target,
  },
];

export function MorePage() {
  const { user, signOut } = useAuth();

  return (
    <div className="mx-auto max-w-2xl space-y-5 animate-fade-in">
      <PageHeader eyebrow="Mais" title="Ajustes e detalhes" />

      <nav className="overflow-hidden rounded-xl border border-border bg-surface">
        <ul>
          {LINKS.map(({ to, label, hint, icon: Icon }) => (
            <li key={to} className="border-b border-border last:border-b-0">
              <Link
                to={to}
                className="flex items-center gap-3 px-4 py-3.5 hover:bg-surface-hover"
              >
                <Icon
                  className="size-4 shrink-0 text-text-muted"
                  strokeWidth={1.75}
                  aria-hidden
                />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium text-text">
                    {label}
                  </span>
                  <span className="block text-xs text-text-muted">{hint}</span>
                </span>
                <ChevronRight
                  className="size-4 shrink-0 text-text-muted"
                  aria-hidden
                />
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      {/* No desktop a sidebar já mostra conta e saída — repetir aqui é ruído. */}
      <div className="space-y-2 rounded-xl border border-border bg-surface p-4 md:hidden">
        <p className="font-mono text-[11px] text-text-muted">{user?.email}</p>
        <Button
          variant="ghost"
          className="h-9 w-full justify-start gap-2 px-2 text-sm"
          onClick={() => void signOut()}
        >
          <LogOut className="size-4" aria-hidden />
          Sair
        </Button>
      </div>
    </div>
  );
}
