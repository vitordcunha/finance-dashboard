import { useMemo, useState } from 'react';
import { CalendarCheck, Wallet } from 'lucide-react';
import { MoneyText } from '@/components/money/MoneyText';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { Panel } from '@/components/ui/Panel';
import { Skeleton } from '@/components/ui/Skeleton';
import type { AccountKind } from '@/data/accounts';
import { CloseMonthSheet } from '@/features/balances/components/CloseMonthSheet';
import { UpdateBalanceSheet } from '@/features/balances/components/UpdateBalanceSheet';
import { useLatestBalances } from '@/features/balances/hooks/useBalances';
import { useAccounts } from '@/features/capture/hooks/useCaptureLookups';
import type { Account } from '@/data/supabase/types';
import type { AccountBalance } from '@/types/models';

const KIND_LABEL: Record<AccountKind, string> = {
  checking: 'Corrente',
  credit: 'Cartão',
  cash: 'Dinheiro',
  savings: 'Poupança',
};

export function BalancesSection() {
  const { data: accounts = [], isLoading: loadingAccounts } = useAccounts();
  const {
    data: latest = [],
    isLoading: loadingBalances,
    isError,
    refetch,
  } = useLatestBalances();

  const [editing, setEditing] = useState<Account | null>(null);
  const [closeOpen, setCloseOpen] = useState(false);

  const byAccount = useMemo(() => {
    const map = new Map<string, AccountBalance>();
    for (const b of latest) map.set(b.accountId, b);
    return map;
  }, [latest]);

  const isLoading = loadingAccounts || loadingBalances;

  return (
    <section className="space-y-3" aria-labelledby="settings-balances">
      <div className="flex items-center justify-between gap-2">
        <h2
          id="settings-balances"
          className="text-xs font-medium uppercase tracking-wide text-text-muted"
        >
          Saldos reais
        </h2>
        <Button
          size="sm"
          variant="secondary"
          onClick={() => setCloseOpen(true)}
        >
          <CalendarCheck className="size-3.5" aria-hidden />
          Fechar mês
        </Button>
      </div>

      <p className="text-xs leading-relaxed text-text-muted">
        Âncora para o Futuro. Corrente/poupança = quanto tem. Cartão = quanto
        deve (dívida), não o limite.
      </p>

      {isLoading ? <Skeleton className="h-24 w-full rounded-xl" /> : null}

      {isError ? (
        <EmptyState
          icon={Wallet}
          title="Não deu para carregar saldos"
          description="Tente de novo em instantes."
          action={
            <Button variant="secondary" size="sm" onClick={() => void refetch()}>
              Tentar de novo
            </Button>
          }
        />
      ) : null}

      {!isLoading && !isError && accounts.length === 0 ? (
        <EmptyState
          icon={Wallet}
          title="Nenhuma conta"
          description="Crie uma conta corrente acima para informar o saldo."
        />
      ) : null}

      {!isLoading && !isError && accounts.length > 0 ? (
        <Panel className="divide-y divide-border overflow-hidden p-0">
          {accounts.map((account) => {
            const bal = byAccount.get(account.id);
            const isCredit = account.kind === 'credit';
            return (
              <div
                key={account.id}
                className="flex items-center gap-3 px-4 py-3"
              >
                <span
                  className="size-3 shrink-0 rounded-full"
                  style={{ backgroundColor: account.color }}
                  aria-hidden
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-text">
                    {account.name}
                  </p>
                  <p className="text-xs text-text-muted">
                    {KIND_LABEL[account.kind]}
                    {bal
                      ? ` · em ${bal.asOfDate}`
                      : ' · sem saldo informado'}
                  </p>
                </div>
                <div className="text-right">
                  {bal ? (
                    <>
                      <MoneyText
                        cents={bal.balanceCents}
                        signed={isCredit}
                        className="text-sm"
                        tone={
                          isCredit || bal.balanceCents < 0
                            ? 'danger'
                            : 'default'
                        }
                      />
                      {isCredit ? (
                        <span className="mt-0.5 block text-[10px] uppercase tracking-wide text-text-muted">
                          dívida
                        </span>
                      ) : null}
                    </>
                  ) : (
                    <span className="text-xs text-text-muted">—</span>
                  )}
                </div>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => setEditing(account)}
                >
                  {bal ? 'Atualizar' : 'Informar'}
                </Button>
              </div>
            );
          })}
        </Panel>
      ) : null}

      {editing ? (
        <UpdateBalanceSheet
          open
          onClose={() => setEditing(null)}
          account={editing}
          latest={byAccount.get(editing.id) ?? null}
        />
      ) : null}

      <CloseMonthSheet open={closeOpen} onClose={() => setCloseOpen(false)} />
    </section>
  );
}
