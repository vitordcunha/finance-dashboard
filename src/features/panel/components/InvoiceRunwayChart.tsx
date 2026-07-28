import type { InvoiceRunway } from '@/core/month-metrics';
import { formatMonth } from '@/core/month';
import { formatBRL } from '@/core/money';
import { cn } from '@/lib/cn';

type Props = {
  runway: InvoiceRunway;
  onSelect?: (ym: string) => void;
};

/**
 * A pista de aterrissagem da fatura.
 *
 * Parcelamento é custo fixo com data de morte, e a data de morte decide algo:
 * responde quando dá para assumir uma despesa nova. Nenhuma métrica de mês único
 * mostra isso — cada mês vê a própria fatura e nunca a curva.
 *
 * Magnitude ao longo do tempo, uma série: coluna, um tom só. O mês em que zera é
 * a informação, então ele ganha marca — o resto é contexto.
 */
export function InvoiceRunwayChart({ runway, onSelect }: Props) {
  const points = runway.points;
  if (points.length === 0) return null;

  // Doze colunas em 375px viram traços; o horizonte útil é o que tem fatura mais
  // um mês de folga para o zero aparecer.
  const lastWith = points.reduce(
    (acc, p, i) => (p.cents > 0 ? i : acc),
    0,
  );
  const shown = points.slice(0, Math.min(lastWith + 2, points.length));

  return (
    <figure className="rounded-xl border border-border bg-surface p-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-text-muted">
          Fatura mês a mês
        </p>
        {runway.clearFromYm ? (
          <p className="text-[11px] text-text-muted">
            zera em{' '}
            <span className="text-accent">
              {formatMonth(runway.clearFromYm, "MMM/yy")}
            </span>
          </p>
        ) : null}
      </div>

      <div className="mt-3 flex items-end gap-1.5">
        {shown.map((p) => {
          const h =
            p.cents > 0
              ? Math.max(6, Math.round((p.cents / runway.maxCents) * 56))
              : 2;
          const clear = p.cents === 0;
          return (
            <button
              key={p.ym}
              type="button"
              disabled={!onSelect}
              onClick={() => onSelect?.(p.ym)}
              className="flex min-w-0 flex-1 flex-col items-center gap-1 rounded disabled:cursor-default"
              title={`${formatMonth(p.ym, 'MMMM yyyy')} · ${formatBRL(p.cents)}`}
            >
              <span className="font-mono text-[9px] tabular-nums text-text-muted">
                {p.cents > 0 ? shortK(p.cents) : '—'}
              </span>
              <span
                className={cn(
                  'w-full max-w-9 rounded-t-md',
                  clear ? 'bg-accent/60' : 'bg-expense/55',
                )}
                style={{ height: h }}
                aria-hidden
              />
              <span className="font-mono text-[10px] text-text-muted">
                {formatMonth(p.ym, 'MMM')}
              </span>
            </button>
          );
        })}
      </div>

      <p className="mt-2.5 border-t border-border/70 pt-2 text-[11px] leading-snug text-text-muted">
        {runway.clearFromYm ? (
          <>
            A partir de{' '}
            <span className="text-text">
              {formatMonth(runway.clearFromYm, 'MMMM yyyy')}
            </span>{' '}
            sobram{' '}
            <span className="font-medium tabular-nums text-accent">
              {formatBRL(runway.reliefCents)}
            </span>
            /mês que hoje vão para a fatura.
          </>
        ) : (
          <>
            Ainda há fatura prevista até o fim da janela — sem data de quitação, o
            custo fixo não desce. Cadastrar as parcelas que faltam mostra quando.
          </>
        )}
      </p>
    </figure>
  );
}

function shortK(cents: number): string {
  const v = cents / 100;
  if (v >= 1000) return `${(v / 1000).toFixed(1).replace('.', ',')}k`;
  return String(Math.round(v));
}
