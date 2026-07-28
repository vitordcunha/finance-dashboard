import { useEffect, useState } from 'react';
import { format } from 'date-fns';
import { AmountKeypad } from '@/components/money/AmountKeypad';
import { MoneyText } from '@/components/money/MoneyText';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Sheet } from '@/components/ui/Sheet';
import {
  toDisplayAbsCents,
  toStoredBalanceCents,
} from '@/core/balance/anchor';
import { parseDigits } from '@/core/money';
import type { AccountKind } from '@/data/accounts';
import { useUpsertAccountBalance } from '@/features/balances/hooks/useBalances';
import type { AccountBalance } from '@/types/models';

function todayIso() {
  return format(new Date(), 'yyyy-MM-dd');
}

type UpdateBalanceSheetProps = {
  open: boolean;
  onClose: () => void;
  account: {
    id: string;
    name: string;
    kind: AccountKind;
  };
  latest?: AccountBalance | null;
};

export function UpdateBalanceSheet({
  open,
  onClose,
  account,
  latest,
}: UpdateBalanceSheetProps) {
  const upsert = useUpsertAccountBalance();
  const isCredit = account.kind === 'credit';

  const [digits, setDigits] = useState('');
  const [asOfDate, setAsOfDate] = useState(todayIso());
  const [notes, setNotes] = useState('');

  useEffect(() => {
    if (!open) return;
    const abs = latest ? toDisplayAbsCents(latest.balanceCents) : 0;
    setDigits(abs > 0 ? String(abs) : '');
    setAsOfDate(latest?.asOfDate ?? todayIso());
    setNotes(latest?.notes ?? '');
  }, [open, account.id, latest]);

  const entered = parseDigits(digits);
  const stored = toStoredBalanceCents(entered, account.kind);

  async function handleSave() {
    await upsert.mutateAsync({
      accountId: account.id,
      asOfDate,
      balanceCents: stored,
      notes: notes.trim() || null,
    });
    onClose();
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={isCredit ? `Dívida · ${account.name}` : `Saldo · ${account.name}`}
      footer={
        <Button
          className="w-full"
          disabled={upsert.isPending || !asOfDate}
          onClick={() => void handleSave()}
        >
          Salvar saldo
        </Button>
      }
    >
      <div className="space-y-5">
        {isCredit ? (
          <p className="rounded-lg border border-border bg-bg/60 px-3 py-2 text-xs leading-relaxed text-text-muted">
            No cartão, informe{' '}
            <span className="font-medium text-text">quanto você deve</span>{' '}
            (dívida). Guardamos como valor negativo — não é o limite do cartão.
          </p>
        ) : (
          <p className="text-xs text-text-muted">
            Informe quanto há nesta conta agora (extrato / app do banco).
          </p>
        )}

        <AmountKeypad digits={digits} onChange={setDigits} />

        <div className="flex items-center justify-between text-sm text-text-muted">
          <span>Será gravado</span>
          <MoneyText
            cents={stored}
            signed
            tone={stored < 0 ? 'danger' : 'default'}
          />
        </div>

        <Input
          label="Na data"
          name="as-of"
          type="date"
          value={asOfDate}
          onChange={(e) => setAsOfDate(e.target.value)}
        />

        <Input
          label="Nota (opcional)"
          name="balance-notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Ex.: saldo no app às 18h"
        />
      </div>
    </Sheet>
  );
}
