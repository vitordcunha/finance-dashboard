import type { Person } from '@/data/supabase/types';

type Props = {
  id?: string;
  people: Person[];
  /** Pessoa do login — aparece como “(você)”. */
  mePersonId?: string | null;
  value: string | null;
  onChange: (personId: string | null) => void;
  disabled?: boolean;
  hint?: string;
};

/** Quem recebe os lançamentos criados no import (`null` = Casa). */
export function ImportPersonField({
  id = 'import-person',
  people,
  mePersonId,
  value,
  onChange,
  disabled,
  hint,
}: Props) {
  return (
    <div className="space-y-2">
      <label htmlFor={id} className="text-sm font-medium text-text-muted">
        Lançar como
      </label>
      <select
        id={id}
        value={value ?? ''}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value || null)}
        className="min-h-10 w-full rounded-md border border-border bg-bg px-3 text-sm text-text outline-none hover:border-border-strong focus:border-accent disabled:opacity-60"
      >
        {people.map((p) => {
          const label = p.short_name || p.name;
          return (
            <option key={p.id} value={p.id}>
              {p.id === mePersonId ? `${label} (você)` : label}
            </option>
          );
        })}
        <option value="">Casa</option>
      </select>
      {hint ? <p className="text-xs text-text-muted">{hint}</p> : null}
    </div>
  );
}
