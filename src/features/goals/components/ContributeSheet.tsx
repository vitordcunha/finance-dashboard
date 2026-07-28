import { useEffect, useState } from 'react';
import { AmountKeypad } from '@/components/money/AmountKeypad';
import { MoneyText } from '@/components/money/MoneyText';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Sheet } from '@/components/ui/Sheet';
import { parseDigits } from '@/core/money';
import { currentYearMonth, formatMonth } from '@/core/month';
import { useUpsertGoalContribution } from '@/features/goals/hooks/useGoals';
import { contributionSchema } from '@/features/goals/schema';
import type { Goal } from '@/types/models';

type ContributeSheetProps = {
  open: boolean;
  onClose: () => void;
  goal: Goal | null;
  monthContributionCents: number;
};

export function ContributeSheet({
  open,
  onClose,
  goal,
  monthContributionCents,
}: ContributeSheetProps) {
  const upsert = useUpsertGoalContribution();
  const ym = currentYearMonth();

  const [digits, setDigits] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !goal) return;
    setDigits(
      monthContributionCents > 0 ? String(monthContributionCents) : '',
    );
    setNotes('');
    setError(null);
  }, [open, goal?.id, monthContributionCents]);

  if (!goal) return null;

  async function handleSave() {
    const draft = {
      amountCents: parseDigits(digits),
      notes: notes.trim() || null,
    };
    const result = contributionSchema.safeParse(draft);
    if (!result.success) {
      setError(result.error.issues[0]?.message ?? 'Dados inválidos');
      return;
    }

    setError(null);
    await upsert.mutateAsync({
      goalId: goal!.id,
      month: ym,
      amountCents: result.data.amountCents,
      notes: result.data.notes ?? null,
    });
    onClose();
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={`Aporte · ${goal.name}`}
      footer={
        <div className="space-y-2">
          {error ? <p className="text-sm text-danger">{error}</p> : null}
          <Button
            className="w-full"
            disabled={upsert.isPending}
            onClick={() => void handleSave()}
          >
            Salvar aporte
          </Button>
        </div>
      }
    >
      <div className="space-y-5">
        <p className="text-sm text-text-muted">
          Quanto reservar em {formatMonth(ym)}. Isso reduz o disponível do mês
          {goal.personId ? ' (Eu)' : ' (Casa)'}.
        </p>

        <AmountKeypad digits={digits} onChange={setDigits} />

        {monthContributionCents > 0 ? (
          <p className="text-xs text-text-muted">
            Já havia{' '}
            <MoneyText cents={monthContributionCents} className="text-xs" />{' '}
            neste mês — salvar substitui esse valor.
          </p>
        ) : null}

        <Input
          label="Nota (opcional)"
          name="contrib-notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
      </div>
    </Sheet>
  );
}
