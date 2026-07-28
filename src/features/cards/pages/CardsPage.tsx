import { Link } from 'react-router-dom';
import { ChevronRight, CreditCard } from 'lucide-react';
import { MoneyText } from '@/components/money/MoneyText';
import { EmptyState } from '@/components/ui/EmptyState';
import { PageHeader } from '@/components/ui/PageHeader';
import { Panel } from '@/components/ui/Panel';
import { Skeleton } from '@/components/ui/Skeleton';
import { currentYearMonth } from '@/core/month';
import {
  useCardLimit,
  useCreditCards,
} from '@/features/cards/hooks/useCards';
import type { Account } from '@/data/supabase/types';
import { cn } from '@/lib/cn';

function CardRow({ account }: { account: Account }) {
  const { data: limit, isLoading } = useCardLimit(account);
  const ym = limit?.ym ?? currentYearMonth();

  return (
    <li>
      <Link
        to={`/cards/${account.id}/${ym}`}
        className={cn(
          'flex min-h-16 items-center gap-3 px-4 py-3 transition-colors',
          'hover:bg-surface-hover',
        )}
      >
        <span
          className="flex size-10 shrink-0 items-center justify-center rounded-lg border border-border"
          style={{ backgroundColor: `${account.color}22`, color: account.color }}
        >
          <CreditCard className="size-4" strokeWidth={1.75} aria-hidden />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-medium text-text">
            {account.name}
          </span>
          {isLoading ? (
            <Skeleton className="mt-1 h-3 w-40" />
          ) : (
            <span className="mt-0.5 block text-xs text-text-muted">
              Disponível{' '}
              <MoneyText
                cents={limit?.availableCents ?? 0}
                className="text-xs"
                tone="muted"
              />
              {' · '}
              usado{' '}
              <MoneyText
                cents={limit?.usedCents ?? 0}
                className="text-xs"
                tone="muted"
              />
            </span>
          )}
        </span>
        <ChevronRight className="size-4 shrink-0 text-text-muted" aria-hidden />
      </Link>
    </li>
  );
}

export function CardsPage() {
  const { data: cards, isLoading, isError, refetch } = useCreditCards();

  return (
    <div className="mx-auto max-w-2xl space-y-6 animate-fade-in">
      <PageHeader
        eyebrow="Cartões"
        title="Faturas e limite"
        description="Gap entre o que o banco diz e o que está lançado — e pagamento sem double-count."
      />

      {isLoading ? (
        <Panel className="space-y-3 p-4">
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-14 w-full" />
        </Panel>
      ) : null}

      {isError ? (
        <EmptyState
          icon={CreditCard}
          title="Não deu para carregar os cartões"
          description="Confira a conexão e tente de novo."
          action={
            <button
              type="button"
              className="text-sm font-medium text-accent hover:underline"
              onClick={() => void refetch()}
            >
              Tentar de novo
            </button>
          }
        />
      ) : null}

      {!isLoading && !isError && (cards?.length ?? 0) === 0 ? (
        <EmptyState
          icon={CreditCard}
          title="Nenhum cartão por aqui"
          description="Cadastre uma conta do tipo crédito em Configurações para ver limite, fatura e gap."
        />
      ) : null}

      {!isLoading && !isError && (cards?.length ?? 0) > 0 ? (
        <Panel>
          <ul className="divide-y divide-border">
            {cards!.map((account) => (
              <CardRow key={account.id} account={account} />
            ))}
          </ul>
        </Panel>
      ) : null}
    </div>
  );
}
