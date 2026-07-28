import { RotateCcw, SlidersHorizontal } from 'lucide-react';
import { formatBRL } from '@/core/money';
import { cn } from '@/lib/cn';

type Props = {
  /** Estimado do histórico, em centavos por dia. O ponto de partida. */
  baselineDailyCents: number;
  /** Valor em vigor — igual ao baseline quando ninguém mexeu. */
  valueDailyCents: number;
  onChange: (dailyCents: number | null) => void;
  /** Menor saldo à frente com o valor em vigor. */
  lowestAheadCents: number | null;
  /** Menor saldo à frente com o estimado do histórico, para comparar. */
  baselineLowestCents: number | null;
  lowestDay: number | null;
  minimumCents: number;
};

/**
 * “E se eu segurar em R$ X/dia?”
 *
 * O resto do painel responde *o que vai acontecer*. Isto responde *o que muda se
 * eu mudar* — a única pergunta que o usuário pode agir hoje. O ritmo é a única
 * variável sob o controle dele: aluguel, fatura e salário estão dados.
 *
 * Não persiste nada. É lente sobre a projeção, não um orçamento: gravar viraria
 * uma segunda fonte de verdade competindo com o histórico.
 */
export function PaceSimulator({
  baselineDailyCents,
  valueDailyCents,
  onChange,
  lowestAheadCents,
  baselineLowestCents,
  lowestDay,
  minimumCents,
}: Props) {
  if (baselineDailyCents <= 0) return null;

  // Teto no dobro do estimado: escala grande demais torna a faixa útil
  // indistinguível no polegar.
  const max = Math.max(Math.round(baselineDailyCents * 2), 5_000);
  const step = 500;
  const touched = valueDailyCents !== baselineDailyCents;

  const diff =
    lowestAheadCents != null && baselineLowestCents != null
      ? lowestAheadCents - baselineLowestCents
      : null;
  const below = lowestAheadCents != null && lowestAheadCents < minimumCents;

  return (
    <div className="rounded-xl border border-border bg-surface p-3">
      <div className="flex items-baseline justify-between gap-3">
        <p className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.1em] text-text-muted">
          <SlidersHorizontal className="size-3" aria-hidden />
          E se eu segurar o ritmo
        </p>
        {touched ? (
          <button
            type="button"
            onClick={() => onChange(null)}
            className="flex items-center gap-1 rounded-md px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wide text-text-muted hover:text-text"
          >
            <RotateCcw className="size-3" aria-hidden />
            estimado
          </button>
        ) : null}
      </div>

      <div className="mt-2 flex items-baseline gap-2">
        <span className="font-display text-xl font-semibold tabular-nums tracking-tight">
          {formatBRL(valueDailyCents)}
        </span>
        <span className="text-[11px] text-text-muted">/dia</span>
        {touched ? (
          <span className="ml-auto font-mono text-[10px] uppercase tracking-wide text-text-muted">
            simulando
          </span>
        ) : null}
      </div>

      <input
        type="range"
        min={0}
        max={max}
        step={step}
        value={Math.min(valueDailyCents, max)}
        onChange={(e) => onChange(Number(e.target.value))}
        aria-label="Ritmo de gasto variável por dia"
        className="mt-2 w-full accent-[var(--color-accent)]"
      />

      <div className="flex justify-between font-mono text-[10px] text-text-muted">
        <span>0</span>
        <span>{formatBRL(baselineDailyCents)} estimado</span>
        <span>{formatBRL(max)}</span>
      </div>

      {lowestAheadCents != null ? (
        <p className="mt-2 border-t border-border/70 pt-2 text-[11px] leading-snug text-text-muted">
          Menor saldo à frente{' '}
          <span
            className={cn(
              'font-medium tabular-nums',
              below ? 'text-danger' : 'text-text',
            )}
          >
            {formatBRL(lowestAheadCents)}
          </span>
          {lowestDay != null ? ` no dia ${lowestDay}` : null}
          {diff != null && diff !== 0 ? (
            <>
              {' — '}
              <span
                className={cn(
                  'tabular-nums',
                  diff > 0 ? 'text-accent' : 'text-warning',
                )}
              >
                {diff > 0 ? '+' : '−'}
                {formatBRL(Math.abs(diff))}
              </span>{' '}
              contra o estimado
            </>
          ) : null}
          .
        </p>
      ) : null}
    </div>
  );
}
