import { useEffect, useRef, useState } from 'react';
import { AmountKeypad } from '@/components/money/AmountKeypad';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Sheet } from '@/components/ui/Sheet';
import { parseDigits } from '@/core/money';
import { currentYearMonth } from '@/core/month';
import { usePeopleQuery } from '@/features/capture/hooks/useCaptureLookups';
import { useCreateGoal } from '@/features/goals/hooks/useGoals';
import { goalSchema } from '@/features/goals/schema';
import { cn } from '@/lib/cn';

type GoalFormSheetProps = {
  open: boolean;
  onClose: () => void;
};

export function GoalFormSheet({ open, onClose }: GoalFormSheetProps) {
  const create = useCreateGoal();
  const { data: people = [], isLoading: peopleLoading } = usePeopleQuery();
  const sessionKey = useRef<string | null>(null);

  const [name, setName] = useState('');
  const [digits, setDigits] = useState('');
  const [personId, setPersonId] = useState<string | null>(null);
  const [deadlineMonth, setDeadlineMonth] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      sessionKey.current = null;
      return;
    }
    if (sessionKey.current === 'create') return;
    if (peopleLoading) return;

    setName('');
    setDigits('');
    setPersonId(null);
    setDeadlineMonth('');
    setNotes('');
    setError(null);
    sessionKey.current = 'create';
  }, [open, peopleLoading]);

  async function handleSave() {
    const draft = {
      name,
      targetCents: parseDigits(digits),
      personId,
      deadlineMonth: deadlineMonth || null,
      notes: notes.trim() || null,
    };

    const result = goalSchema.safeParse(draft);
    if (!result.success) {
      setError(result.error.issues[0]?.message ?? 'Dados inválidos');
      return;
    }

    setError(null);
    await create.mutateAsync({
      name: result.data.name,
      targetCents: result.data.targetCents,
      personId: result.data.personId,
      deadlineMonth: result.data.deadlineMonth,
      notes: result.data.notes ?? null,
    });
    onClose();
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Nova meta"
      footer={
        <div className="space-y-2">
          {error ? <p className="text-sm text-danger">{error}</p> : null}
          <Button
            className="w-full"
            disabled={create.isPending}
            onClick={() => void handleSave()}
          >
            Criar meta
          </Button>
        </div>
      }
    >
      <div className="space-y-5">
        <Input
          label="Nome"
          name="goal-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Ex.: Viagem, fundo de emergência…"
          autoComplete="off"
        />

        <div>
          <p className="mb-1.5 text-sm font-medium text-text-muted">Valor alvo</p>
          <AmountKeypad digits={digits} onChange={setDigits} />
        </div>

        <div className="space-y-2">
          <p className="text-sm font-medium text-text-muted">De quem é</p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setPersonId(null)}
              className={cn(
                'min-h-9 rounded-full border px-3 text-sm font-medium transition-colors',
                personId === null
                  ? 'border-accent bg-accent/10 text-text'
                  : 'border-border text-text-muted hover:border-border-strong',
              )}
            >
              Casa
            </button>
            {people.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setPersonId(p.id)}
                className={cn(
                  'min-h-9 rounded-full border px-3 text-sm font-medium transition-colors',
                  personId === p.id
                    ? 'border-accent bg-accent/10 text-text'
                    : 'border-border text-text-muted hover:border-border-strong',
                )}
              >
                {p.name}
              </button>
            ))}
          </div>
          <p className="text-xs text-text-muted">
            Meta da Casa reduz o disponível da casa; meta pessoal, o do Eu.
          </p>
        </div>

        <Input
          label="Prazo (opcional)"
          name="deadline"
          type="month"
          value={deadlineMonth}
          onChange={(e) => setDeadlineMonth(e.target.value)}
          hint={`Vazio = sem ritmo obrigatório. Hoje: ${currentYearMonth()}`}
        />

        <Input
          label="Nota (opcional)"
          name="notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
      </div>
    </Sheet>
  );
}
