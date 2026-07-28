import { ArrowRight, Repeat } from 'lucide-react';
import { Input } from '@/components/ui/Input';
import { cn } from '@/lib/cn';
import type { TransactionStatus } from '@/types/models';

export function PersonChips({
  people,
  value,
  onChange,
}: {
  people: { id: string; name: string; short_name: string }[];
  value: string | null;
  onChange: (id: string | null) => void;
}) {
  const options = [
    { id: null as string | null, label: 'Casa' },
    ...people.map((p) => ({
      id: p.id as string | null,
      label: p.short_name || p.name,
    })),
  ];

  return (
    <div>
      <p className="mb-1.5 text-sm font-medium text-text-muted">Quem</p>
      <div className="flex flex-wrap gap-1.5">
        {options.map((opt) => {
          const selected = value === opt.id;
          return (
            <button
              key={opt.id ?? '__casa__'}
              type="button"
              onClick={() => onChange(opt.id)}
              className={cn(
                'rounded-full border px-3 py-1.5 text-xs font-medium transition-colors',
                selected
                  ? 'border-accent/40 bg-accent-muted text-accent'
                  : 'border-border bg-bg text-text-muted hover:border-border-strong hover:text-text',
              )}
            >
              {opt.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function TransferAccounts({
  accountId,
  transferAccountId,
  accounts,
  onAccountChange,
  onTransferChange,
}: {
  accountId: string | null;
  transferAccountId: string | null;
  accounts: { id: string; name: string }[];
  onAccountChange: (id: string | null) => void;
  onTransferChange: (id: string | null) => void;
}) {
  return (
    <div className="grid grid-cols-[1fr_auto_1fr] items-end gap-2">
      <SelectField
        label="De"
        value={accountId ?? ''}
        onChange={(v) => onAccountChange(v || null)}
        options={accounts.map((a) => ({ value: a.id, label: a.name }))}
        placeholder="Origem"
        allowEmpty
      />
      <ArrowRight
        className="mb-2.5 size-4 shrink-0 text-text-muted"
        aria-hidden
      />
      <SelectField
        label="Para"
        value={transferAccountId ?? ''}
        onChange={(v) => onTransferChange(v || null)}
        options={accounts
          .filter((a) => a.id !== accountId)
          .map((a) => ({ value: a.id, label: a.name }))}
        placeholder="Destino"
        allowEmpty
      />
    </div>
  );
}

export function StatusToggle({
  status,
  onChange,
  lockedToPlanned,
}: {
  status: TransactionStatus;
  onChange: (v: TransactionStatus) => void;
  lockedToPlanned: boolean;
}) {
  return (
    <div>
      <div className="flex gap-1 rounded-lg border border-border bg-surface p-1">
        {(
          [
            { value: 'actual' as const, label: 'Já aconteceu' },
            { value: 'planned' as const, label: 'É previsto' },
          ]
        ).map((item) => (
          <button
            key={item.value}
            type="button"
            disabled={lockedToPlanned && item.value === 'actual'}
            onClick={() => onChange(item.value)}
            className={cn(
              'flex-1 rounded-md px-2 py-2 text-xs font-medium transition-colors',
              status === item.value
                ? 'bg-accent-muted text-accent'
                : 'text-text-muted hover:text-text',
              lockedToPlanned &&
                item.value === 'actual' &&
                'cursor-not-allowed opacity-40 hover:text-text-muted',
            )}
          >
            {item.label}
          </button>
        ))}
      </div>
      {lockedToPlanned ? (
        <p className="mt-1.5 text-[11px] text-text-muted">
          Data no futuro — só pode ser previsto.
        </p>
      ) : null}
    </div>
  );
}

export function RepeatField({
  repeats,
  until,
  onToggle,
  onUntilChange,
}: {
  repeats: boolean;
  until: string;
  onToggle: (v: boolean) => void;
  onUntilChange: (v: string) => void;
}) {
  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={() => onToggle(!repeats)}
        className={cn(
          'flex w-full items-center gap-2.5 rounded-lg border px-3 py-2.5 text-left transition-colors',
          repeats
            ? 'border-accent/40 bg-accent-muted'
            : 'border-border bg-surface hover:border-border-strong',
        )}
      >
        <Repeat
          className={cn(
            'size-3.5 shrink-0',
            repeats ? 'text-accent' : 'text-text-muted',
          )}
          aria-hidden
        />
        <span
          className={cn(
            'text-sm',
            repeats ? 'font-medium text-accent' : 'text-text',
          )}
        >
          Repete todo mês
        </span>
      </button>

      {repeats ? (
        <div className="space-y-1.5">
          <Input
            label="Até quando (opcional)"
            name="repeatsUntil"
            type="date"
            value={until}
            onChange={(e) => onUntilChange(e.target.value)}
          />
          <p className="text-[11px] leading-snug text-text-muted">
            Em branco, repete indefinidamente. Cada mês futuro aparece na linha
            como previsto e pode ser ajustado sozinho.
          </p>
        </div>
      ) : null}
    </div>
  );
}

export function SelectField({
  label,
  value,
  onChange,
  options,
  placeholder,
  allowEmpty,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
  placeholder: string;
  allowEmpty?: boolean;
}) {
  return (
    <label className="block space-y-1.5 text-sm">
      <span className="font-medium text-text-muted">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={cn(
          'min-h-10 w-full rounded-md border border-border bg-bg px-3 text-sm text-text',
          'outline-none hover:border-border-strong focus:border-accent',
        )}
      >
        {allowEmpty ? <option value="">{placeholder}</option> : null}
        {options.map((opt) => (
          <option key={opt.value || '__empty__'} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </label>
  );
}

export function formatShortDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return iso;
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: 'short',
  }).format(new Date(y, m - 1, d));
}

export function detailsSummary(input: {
  date: string;
  today: string;
  status: TransactionStatus;
  repeats: boolean;
  categoryName: string | null;
}): string {
  const parts: string[] = [];
  parts.push(input.date === input.today ? 'Hoje' : formatShortDate(input.date));
  parts.push(input.status === 'planned' ? 'previsto' : 'já aconteceu');
  if (input.repeats) parts.push('repete');
  if (input.categoryName) parts.push(input.categoryName);
  return parts.join(' · ');
}
