import { useEffect, useMemo, useState } from 'react';
import { AmountKeypad } from '@/components/money/AmountKeypad';
import { MoneyText } from '@/components/money/MoneyText';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Sheet } from '@/components/ui/Sheet';
import { resolveBalanceAnchor } from '@/core/balance/anchor';
import {
  addMonths,
  currentYearMonth,
  formatMonth,
  isYearMonth,
} from '@/core/month';
import { parseDigits } from '@/core/money';
import {
  useCloseMonth,
  useLatestBalances,
  useMonthClose,
} from '@/features/balances/hooks/useBalances';
import { useAccounts } from '@/features/capture/hooks/useCaptureLookups';

type CloseMonthSheetProps = {
  open: boolean;
  onClose: () => void;
  /** Mês a fechar (default = mês anterior). */
  defaultMonth?: string;
  /** Sugestão (ex.: fechamento implícito do caixa). */
  suggestedCents?: number | null;
};

export function CloseMonthSheet({
  open,
  onClose,
  defaultMonth,
  suggestedCents,
}: CloseMonthSheetProps) {
  const fallbackMonth = addMonths(currentYearMonth(), -1);
  const initialMonth =
    defaultMonth && isYearMonth(defaultMonth) ? defaultMonth : fallbackMonth;

  const [month, setMonth] = useState(initialMonth);
  const [notes, setNotes] = useState('');
  const [digits, setDigits] = useState('');
  const [negative, setNegative] = useState(false);

  const close = useCloseMonth();
  const { data: latest = [] } = useLatestBalances();
  const { data: accounts = [] } = useAccounts();
  const { data: existing } = useMonthClose(month);

  const kindById = useMemo(
    () => new Map(accounts.map((a) => [a.id, a.kind])),
    [accounts],
  );

  const snapshot = useMemo(
    () =>
      resolveBalanceAnchor(
        latest.map((b) => ({
          accountId: b.accountId,
          kind: kindById.get(b.accountId),
          balanceCents: b.balanceCents,
          asOfDate: b.asOfDate,
        })),
      ),
    [latest, kindById],
  );

  useEffect(() => {
    if (!open) return;
    setMonth(initialMonth);
  }, [open, initialMonth]);

  useEffect(() => {
    if (!open) return;
    setNotes(existing?.notes ?? '');

    const seed =
      existing?.realBalanceCents ??
      suggestedCents ??
      (snapshot.hasAnchor ? snapshot.totalCents : null);

    if (seed != null && Number.isInteger(seed)) {
      setNegative(seed < 0);
      setDigits(seed === 0 ? '' : String(Math.abs(seed)));
    } else {
      setNegative(false);
      setDigits('');
    }
  }, [
    open,
    existing?.notes,
    existing?.realBalanceCents,
    month,
    suggestedCents,
    snapshot.hasAnchor,
    snapshot.totalCents,
  ]);

  const amountCents = (negative ? -1 : 1) * parseDigits(digits);

  async function handleClose() {
    if (!isYearMonth(month)) return;
    await close.mutateAsync({
      month,
      realBalanceCents: amountCents,
      notes: notes.trim() || null,
    });
    onClose();
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Fechar mês"
      footer={
        <Button
          className="w-full"
          disabled={close.isPending || !isYearMonth(month)}
          onClick={() => void handleClose()}
        >
          {existing ? 'Atualizar fechamento' : 'Fechar mês'}
        </Button>
      }
    >
      <div className="space-y-5">
        <p className="text-sm leading-relaxed text-text-muted">
          Grava quanto o mês fechou de verdade. Esse valor vira a{' '}
          <span className="font-medium text-text">abertura do mês seguinte</span>
          . Os lançamentos não são apagados.
        </p>

        <Input
          label="Mês"
          name="close-month"
          type="month"
          value={month}
          onChange={(e) => setMonth(e.target.value)}
          hint={isYearMonth(month) ? formatMonth(month) : undefined}
        />

        <div>
          <div className="mb-2 flex items-center justify-between">
            <p className="text-sm font-medium text-text">Valor do fechamento</p>
            <button
              type="button"
              className="text-xs font-medium text-accent hover:underline"
              onClick={() => setNegative((v) => !v)}
            >
              {negative ? 'Negativo' : 'Positivo'}
            </button>
          </div>
          <AmountKeypad digits={digits} onChange={setDigits} />
          <div className="mt-2 flex items-center justify-between text-sm text-text-muted">
            <span>Será gravado</span>
            <MoneyText cents={amountCents} signed />
          </div>
          {snapshot.hasAnchor ? (
            <button
              type="button"
              className="mt-2 text-xs text-accent hover:underline"
              onClick={() => {
                const t = snapshot.totalCents;
                setNegative(t < 0);
                setDigits(t === 0 ? '' : String(Math.abs(t)));
              }}
            >
              Usar soma dos saldos (
              <MoneyText cents={snapshot.totalCents} signed className="text-xs" />
              )
            </button>
          ) : null}
          {suggestedCents != null && suggestedCents !== snapshot.totalCents ? (
            <button
              type="button"
              className="mt-1 block text-xs text-accent hover:underline"
              onClick={() => {
                setNegative(suggestedCents < 0);
                setDigits(
                  suggestedCents === 0
                    ? ''
                    : String(Math.abs(suggestedCents)),
                );
              }}
            >
              Usar caixa implícito (
              <MoneyText cents={suggestedCents} signed className="text-xs" />)
            </button>
          ) : null}
        </div>

        {existing?.closedAt ? (
          <p className="text-xs text-text-muted">
            Já fechado em{' '}
            {new Date(existing.closedAt).toLocaleString('pt-BR')} · snapshot
            anterior{' '}
            <MoneyText cents={existing.realBalanceCents} className="text-xs" />
          </p>
        ) : null}

        <Input
          label="Nota (opcional)"
          name="close-notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Ex.: fechamos julho no domingo"
        />
      </div>
    </Sheet>
  );
}
