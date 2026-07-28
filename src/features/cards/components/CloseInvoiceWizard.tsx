import { useEffect, useMemo, useState } from 'react';
import { format } from 'date-fns';
import { AmountKeypad } from '@/components/money/AmountKeypad';
import { MoneyText } from '@/components/money/MoneyText';
import { Button } from '@/components/ui/Button';
import { Sheet } from '@/components/ui/Sheet';
import { parseDigits } from '@/core/money';
import { invoiceGapCents } from '@/core/reconcile/invoice-gap';
import { useAccounts } from '@/features/capture/hooks/useCaptureLookups';
import {
  useCloseInvoice,
  useTransferCandidates,
} from '@/features/cards/hooks/useCards';
import { InvoiceGapBanner } from '@/features/cards/components/InvoiceGapBanner';
import { cn } from '@/lib/cn';
import type { Transaction } from '@/types/models';

type CloseInvoiceWizardProps = {
  open: boolean;
  onClose: () => void;
  accountId: string;
  month: string;
  purchasesSumCents: number;
  initialTotalCents?: number | null;
};

type Step = 1 | 2 | 3;
type PayMode = 'create' | 'link' | 'skip';

function todayIso() {
  return format(new Date(), 'yyyy-MM-dd');
}

function defaultDigits(
  initialTotalCents: number | null | undefined,
  purchasesSumCents: number,
): string {
  if (initialTotalCents != null && initialTotalCents > 0) {
    return String(initialTotalCents);
  }
  if (purchasesSumCents > 0) return String(purchasesSumCents);
  return '';
}

export function CloseInvoiceWizard({
  open,
  onClose,
  accountId,
  month,
  purchasesSumCents,
  initialTotalCents,
}: CloseInvoiceWizardProps) {
  const closeMutation = useCloseInvoice();
  const { data: accounts = [] } = useAccounts();
  const { data: candidates = [] } = useTransferCandidates(accountId);

  const checkingAccounts = useMemo(
    () => accounts.filter((a) => a.kind === 'checking' || a.kind === 'savings'),
    [accounts],
  );

  const [step, setStep] = useState<Step>(1);
  const [digits, setDigits] = useState('');
  const [payMode, setPayMode] = useState<PayMode>('create');
  const [fromAccountId, setFromAccountId] = useState<string | null>(null);
  const [payDigits, setPayDigits] = useState('');
  const [selectedTxId, setSelectedTxId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setStep(1);
    setDigits(defaultDigits(initialTotalCents, purchasesSumCents));
    setPayMode('create');
    setPayDigits('');
    setSelectedTxId(null);
    setError(null);
    setFromAccountId(
      (accounts.find((a) => a.kind === 'checking' || a.kind === 'savings')
        ?.id as string | undefined) ?? null,
    );
    // Só ao abrir o sheet — não resetar a cada mudança de lista de contas
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const totalCents = parseDigits(digits);
  const gap = invoiceGapCents(totalCents, purchasesSumCents);
  const payCents = parseDigits(payDigits);

  const selectedTx: Transaction | undefined = candidates.find(
    (t) => t.id === selectedTxId,
  );

  function resetAndClose() {
    setStep(1);
    setError(null);
    onClose();
  }

  function goNextFromTotal() {
    if (totalCents <= 0) {
      setError('Informe o total da fatura');
      return;
    }
    setError(null);
    setPayDigits(String(totalCents));
    if (!fromAccountId && checkingAccounts[0]) {
      setFromAccountId(checkingAccounts[0].id);
    }
    setStep(2);
  }

  function goNextFromGap() {
    setError(null);
    setStep(3);
  }

  async function finish() {
    setError(null);

    if (payMode === 'create') {
      if (!fromAccountId) {
        setError('Escolha a conta de onde saiu o pagamento');
        return;
      }
      if (payCents <= 0) {
        setError('Informe o valor do pagamento');
        return;
      }
    }
    if (payMode === 'link') {
      if (!selectedTx) {
        setError('Escolha um lançamento para vincular');
        return;
      }
    }

    try {
      await closeMutation.mutateAsync({
        accountId,
        month,
        totalCents,
        payment:
          payMode === 'skip'
            ? { mode: 'skip' }
            : payMode === 'create'
              ? {
                  mode: 'create',
                  amountCents: payCents,
                  fromAccountId: fromAccountId!,
                  date: todayIso(),
                }
              : {
                  mode: 'link',
                  transactionId: selectedTx!.id,
                  amountCents: selectedTx!.amountCents,
                },
      });
      resetAndClose();
    } catch {
      // toast already in mutation
    }
  }

  const title =
    step === 1
      ? 'Total da fatura'
      : step === 2
        ? 'Conferir gap'
        : 'Vincular pagamento';

  return (
    <Sheet
      open={open}
      onClose={resetAndClose}
      title={title}
      footer={
        <div className="flex gap-2">
          {step > 1 ? (
            <Button
              variant="secondary"
              className="flex-1"
              onClick={() => setStep((s) => (s === 3 ? 2 : 1))}
            >
              Voltar
            </Button>
          ) : (
            <Button variant="secondary" className="flex-1" onClick={resetAndClose}>
              Cancelar
            </Button>
          )}
          {step === 1 ? (
            <Button className="flex-1" onClick={goNextFromTotal}>
              Continuar
            </Button>
          ) : null}
          {step === 2 ? (
            <Button className="flex-1" onClick={goNextFromGap}>
              Continuar
            </Button>
          ) : null}
          {step === 3 ? (
            <Button
              className="flex-1"
              onClick={() => void finish()}
              disabled={closeMutation.isPending}
            >
              {closeMutation.isPending ? 'Salvando…' : 'Concluir'}
            </Button>
          ) : null}
        </div>
      }
    >
      <div className="space-y-5">
        <p className="font-mono text-[11px] uppercase tracking-[0.12em] text-text-muted">
          Passo {step} de 3
        </p>

        {step === 1 ? (
          <div className="space-y-3">
            <p className="text-sm text-text-muted">
              Quanto o banco diz que a fatura totalizou neste mês?
            </p>
            <AmountKeypad digits={digits} onChange={setDigits} />
            <p className="text-center text-xs text-text-muted">
              Compras lançadas:{' '}
              <MoneyText cents={purchasesSumCents} className="text-xs" tone="muted" />
            </p>
          </div>
        ) : null}

        {step === 2 ? (
          <div className="space-y-4">
            <dl className="grid grid-cols-2 gap-3 text-sm">
              <div className="rounded-lg border border-border bg-bg px-3 py-2">
                <dt className="text-text-muted">Total do banco</dt>
                <dd className="mt-1 font-medium">
                  <MoneyText cents={totalCents} />
                </dd>
              </div>
              <div className="rounded-lg border border-border bg-bg px-3 py-2">
                <dt className="text-text-muted">Compras lançadas</dt>
                <dd className="mt-1 font-medium">
                  <MoneyText cents={purchasesSumCents} />
                </dd>
              </div>
            </dl>
            <InvoiceGapBanner gapCents={gap} />
            {gap !== 0 ? (
              <p className="text-sm text-text-muted">
                Você pode continuar e vincular o pagamento agora. Depois ajuste
                as compras se precisar zerar o gap.
              </p>
            ) : null}
          </div>
        ) : null}

        {step === 3 ? (
          <div className="space-y-4">
            <p className="text-sm text-text-muted">
              O pagamento é uma transferência (corrente → cartão). Não conta como
              gasto de consumo no Mês.
            </p>

            <div className="flex flex-wrap gap-2">
              {(
                [
                  ['create', 'Registrar PIX'],
                  ['link', 'Já paguei'],
                  ['skip', 'Só fechar'],
                ] as const
              ).map(([mode, label]) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setPayMode(mode)}
                  className={cn(
                    'rounded-full border px-3 py-1.5 text-xs font-medium transition-colors',
                    payMode === mode
                      ? 'border-accent bg-accent-muted text-accent'
                      : 'border-border text-text-muted hover:border-border-strong hover:text-text',
                  )}
                >
                  {label}
                </button>
              ))}
            </div>

            {payMode === 'create' ? (
              <div className="space-y-3">
                <label className="block space-y-1.5 text-sm">
                  <span className="font-medium text-text-muted">Saiu de</span>
                  <select
                    className="min-h-10 w-full rounded-md border border-border bg-bg px-3 text-sm text-text"
                    value={fromAccountId ?? ''}
                    onChange={(e) => setFromAccountId(e.target.value || null)}
                  >
                    <option value="">Selecione</option>
                    {checkingAccounts.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name}
                      </option>
                    ))}
                  </select>
                </label>
                <AmountKeypad digits={payDigits} onChange={setPayDigits} />
              </div>
            ) : null}

            {payMode === 'link' ? (
              <div className="space-y-2">
                {candidates.length === 0 ? (
                  <p className="text-sm text-text-muted">
                    Nenhuma transferência envolvendo este cartão. Registre um PIX
                    ou use “Registrar PIX”.
                  </p>
                ) : (
                  <ul className="max-h-48 space-y-1 overflow-y-auto">
                    {candidates.map((tx) => (
                      <li key={tx.id}>
                        <button
                          type="button"
                          onClick={() => setSelectedTxId(tx.id)}
                          className={cn(
                            'flex w-full items-center justify-between gap-2 rounded-lg border px-3 py-2 text-left text-sm',
                            selectedTxId === tx.id
                              ? 'border-accent bg-accent-muted'
                              : 'border-border hover:border-border-strong',
                          )}
                        >
                          <span className="min-w-0">
                            <span className="block truncate font-medium">
                              {tx.description}
                            </span>
                            <span className="text-xs text-text-muted">
                              {tx.date}
                            </span>
                          </span>
                          <MoneyText cents={tx.amountCents} className="text-sm" />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ) : null}

            {payMode === 'skip' ? (
              <p className="text-sm text-text-muted">
                A fatura será marcada como fechada sem vínculo de pagamento. Você
                pode vincular depois.
              </p>
            ) : null}
          </div>
        ) : null}

        {error ? <p className="text-sm text-danger">{error}</p> : null}
      </div>
    </Sheet>
  );
}
