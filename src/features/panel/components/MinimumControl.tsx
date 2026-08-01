import { useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import { formatBRL, parseDigits } from '@/core/money';
import { useSetMinimumBalance } from '@/features/panel/hooks/useMinimumBalance';
import { cn } from '@/lib/cn';

type Props = {
  cents: number;
  /** Lente aberta: cada uma tem o seu colchão. `null` é a casa. */
  personId?: string | null;
  /** Nome da lente, para o texto dizer de quem é o colchão. */
  scopeLabel?: string | null;
};

/**
 * O colchão fica onde ele é usado, não escondido em ajustes: é o parâmetro que
 * muda a leitura do gráfico logo acima.
 *
 * É **por lente**. O mesmo R$ 1.500 aplicado à conta pessoal dela deixava a lente
 * dela em alerta permanente, e alerta que nunca apaga não é alerta.
 */
export function MinimumControl({ cents, personId, scopeLabel }: Props) {
  const [editing, setEditing] = useState(false);
  const [digits, setDigits] = useState(String(cents || ''));
  const mutation = useSetMinimumBalance(personId);

  async function save() {
    await mutation.mutateAsync(parseDigits(digits));
    setEditing(false);
  }

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => {
          setDigits(String(cents || ''));
          setEditing(true);
        }}
        className={cn(
          'flex w-full items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2',
          'text-left text-[11px] text-text-muted hover:border-border-strong hover:text-text',
        )}
      >
        <ShieldCheck className="size-3.5 shrink-0" aria-hidden />
        {cents > 0 ? (
          <span>
            Colchão{scopeLabel ? ` de ${scopeLabel}` : ''} de{' '}
            <strong className="font-medium text-text">{formatBRL(cents)}</strong>{' '}
            — abaixo disso o mês acende alerta.
          </span>
        ) : (
          <span>
            Defina um <strong className="font-medium text-text">colchão</strong>{' '}
            {scopeLabel ? `para ${scopeLabel} ` : ''}para o app avisar antes de o
            saldo chegar perto do fim.
          </span>
        )}
        <span className="ml-auto shrink-0 font-mono uppercase tracking-[0.06em]">
          {cents > 0 ? 'alterar' : 'definir'}
        </span>
      </button>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-accent/40 bg-surface px-3 py-2">
      <label className="flex items-center gap-2 text-[11px] text-text-muted">
        <ShieldCheck className="size-3.5" aria-hidden />
        Saldo mínimo
        <input
          autoFocus
          inputMode="numeric"
          value={digits}
          onChange={(e) => setDigits(e.target.value.replace(/\D/g, ''))}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void save();
            if (e.key === 'Escape') setEditing(false);
          }}
          className="w-28 rounded-md border border-border bg-bg px-2 py-1 text-right text-sm tabular-nums text-text outline-none focus:border-accent"
          placeholder="0,00"
        />
      </label>
      <span className="font-mono text-[11px] tabular-nums text-text-muted">
        {formatBRL(parseDigits(digits))}
      </span>
      <div className="ml-auto flex gap-1">
        <button
          type="button"
          disabled={mutation.isPending}
          onClick={() => void save()}
          className="rounded-md bg-accent px-2.5 py-1 text-[11px] font-medium text-accent-fg"
        >
          Salvar
        </button>
        <button
          type="button"
          onClick={() => setEditing(false)}
          className="rounded-md px-2.5 py-1 text-[11px] text-text-muted hover:text-text"
        >
          Cancelar
        </button>
      </div>
    </div>
  );
}
