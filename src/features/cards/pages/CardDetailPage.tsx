import { useState } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { ArrowLeft, ChevronLeft, ChevronRight, CreditCard, FileUp } from 'lucide-react';
import { MoneyText } from '@/components/money/MoneyText';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { PageHeader } from '@/components/ui/PageHeader';
import { Panel } from '@/components/ui/Panel';
import { Skeleton } from '@/components/ui/Skeleton';
import {
  addMonths,
  currentYearMonth,
  formatMonth,
  isYearMonth,
} from '@/core/month';
import { CardLimitHero } from '@/features/cards/components/CardLimitHero';
import { CloseInvoiceWizard } from '@/features/cards/components/CloseInvoiceWizard';
import { InvoiceGapBanner } from '@/features/cards/components/InvoiceGapBanner';
import { InvoicePurchasesList } from '@/features/cards/components/InvoicePurchasesList';
import { PaymentStatusBadge } from '@/features/cards/components/PaymentStatusBadge';
import {
  useCardAccount,
  useCardInvoice,
  useCardLimit,
} from '@/features/cards/hooks/useCards';
import { cn } from '@/lib/cn';

function InvoiceMonthSwitcher({
  accountId,
  ym,
}: {
  accountId: string;
  ym: string;
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <Link
        to={`/cards/${accountId}/${addMonths(ym, -1)}`}
        aria-label="Fatura anterior"
        className={cn(
          'flex size-11 items-center justify-center rounded-md text-text-muted',
          'hover:bg-surface-hover hover:text-text',
        )}
      >
        <ChevronLeft className="size-5" aria-hidden />
      </Link>
      <p className="font-display text-base font-medium tracking-tight capitalize">
        {formatMonth(ym, 'MMMM yyyy')}
      </p>
      <Link
        to={`/cards/${accountId}/${addMonths(ym, 1)}`}
        aria-label="Próxima fatura"
        className={cn(
          'flex size-11 items-center justify-center rounded-md text-text-muted',
          'hover:bg-surface-hover hover:text-text',
        )}
      >
        <ChevronRight className="size-5" aria-hidden />
      </Link>
    </div>
  );
}

export function CardDetailPage() {
  const { accountId, ym: ymParam } = useParams<{
    accountId: string;
    ym?: string;
  }>();
  const ym = ymParam && isYearMonth(ymParam) ? ymParam : currentYearMonth();
  const [wizardOpen, setWizardOpen] = useState(false);

  const {
    data: account,
    isLoading: accountLoading,
    isError: accountError,
  } = useCardAccount(accountId);
  const { data: limit, isLoading: limitLoading } = useCardLimit(account ?? null);
  const {
    data: invoice,
    isLoading: invoiceLoading,
    isError: invoiceError,
    refetch,
  } = useCardInvoice(accountId, ym);

  if (!accountId) {
    return <Navigate to="/cards" replace />;
  }

  if (ymParam && !isYearMonth(ymParam)) {
    return <Navigate to={`/cards/${accountId}/${currentYearMonth()}`} replace />;
  }

  if (!ymParam) {
    return <Navigate to={`/cards/${accountId}/${currentYearMonth()}`} replace />;
  }

  if (accountError || (!accountLoading && !account)) {
    return (
      <div className="mx-auto max-w-2xl space-y-6 animate-fade-in">
        <EmptyState
          icon={CreditCard}
          title="Cartão não encontrado"
          description="Ele pode ter sido arquivado ou o link está inválido."
          action={
            <Link
              to="/cards"
              className="inline-flex min-h-10 items-center justify-center rounded-full border border-border bg-surface-elevated px-4 text-sm font-medium text-text hover:border-border-strong hover:bg-surface-hover"
            >
              Voltar aos cartões
            </Link>
          }
        />
      </div>
    );
  }

  const loading = accountLoading || invoiceLoading;

  return (
    <div className="mx-auto max-w-2xl space-y-6 animate-fade-in">
      <div>
        <Link
          to="/cards"
          className="mb-3 inline-flex items-center gap-1.5 text-sm text-text-muted hover:text-text"
        >
          <ArrowLeft className="size-4" aria-hidden />
          Cartões
        </Link>
        <PageHeader
          eyebrow="Fatura"
          title={accountLoading ? '…' : (account?.name ?? 'Cartão')}
          description="Compras · total do banco · pagamento vinculado"
          action={
            <div className="flex flex-wrap items-center gap-2">
              <Link
                to={`/import?accountId=${accountId}`}
                className={cn(
                  'inline-flex min-h-10 items-center justify-center gap-2 rounded-full px-4 text-sm font-medium',
                  'border border-border bg-surface-elevated text-text',
                  'hover:border-border-strong hover:bg-surface-hover',
                )}
              >
                <FileUp className="size-3.5" aria-hidden />
                Importar
              </Link>
              <Button onClick={() => setWizardOpen(true)} disabled={!account}>
                Fechar fatura
              </Button>
            </div>
          }
        />
      </div>

      <InvoiceMonthSwitcher accountId={accountId} ym={ym} />

      {account && !limitLoading && limit ? (
        <CardLimitHero
          limitCents={limit.limitCents}
          usedCents={limit.usedCents}
          availableCents={limit.availableCents}
          closingDay={account.closing_day}
          dueDay={account.due_day}
        />
      ) : (
        <Skeleton className="h-40 w-full rounded-xl" />
      )}

      {loading ? (
        <Skeleton className="h-24 w-full rounded-xl" />
      ) : invoiceError ? (
        <EmptyState
          title="Não deu para carregar a fatura"
          description="Tente de novo em instantes."
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
      ) : (
        <>
          <Panel className="space-y-4 p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="font-mono text-[11px] uppercase tracking-[0.12em] text-text-muted">
                Resumo da fatura
              </p>
              <PaymentStatusBadge
                coverage={invoice!.coverage}
                statementStatus={invoice!.statement?.status}
              />
            </div>

            <dl className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-3">
              <div>
                <dt className="text-text-muted">Total do banco</dt>
                <dd className="mt-0.5 font-medium">
                  {invoice!.statement?.totalCents != null ? (
                    <MoneyText cents={invoice!.statement.totalCents} />
                  ) : (
                    <span className="text-text-muted">Ainda não informado</span>
                  )}
                </dd>
              </div>
              <div>
                <dt className="text-text-muted">Compras</dt>
                <dd className="mt-0.5 font-medium">
                  <MoneyText cents={invoice!.purchasesSumCents} />
                </dd>
              </div>
              <div>
                <dt className="text-text-muted">Pago (vinculado)</dt>
                <dd className="mt-0.5 font-medium">
                  <MoneyText cents={invoice!.paidSumCents} />
                </dd>
              </div>
            </dl>

            {invoice!.gapCents != null ? (
              <InvoiceGapBanner gapCents={invoice!.gapCents} />
            ) : (
              <p className="text-sm text-text-muted">
                Informe o total do banco no wizard para ver o gap.
              </p>
            )}
          </Panel>

          <InvoicePurchasesList purchases={invoice!.purchases} ym={ym} />
        </>
      )}

      {account ? (
        <CloseInvoiceWizard
          open={wizardOpen}
          onClose={() => setWizardOpen(false)}
          accountId={accountId}
          month={ym}
          purchasesSumCents={invoice?.purchasesSumCents ?? 0}
          initialTotalCents={invoice?.statement?.totalCents}
        />
      ) : null}
    </div>
  );
}
