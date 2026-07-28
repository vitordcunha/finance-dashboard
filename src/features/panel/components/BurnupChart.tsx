import type { Burnup } from '@/core/month-metrics';
import { formatBRL } from '@/core/money';
import { cn } from '@/lib/cn';

const W = 720;
const H = 180;
const PAD_L = 44;
const PAD_R = 14;
const PAD_T = 16;
const PAD_B = 24;

type Props = {
  burnup: Burnup;
  /** Rótulo do orçamento — muda quando o usuário está simulando. */
  budgetLabel?: string;
};

function short(cents: number): string {
  const abs = Math.abs(cents / 100);
  if (abs >= 1000) return `${(abs / 1000).toFixed(1).replace('.', ',')}k`;
  return String(Math.round(abs));
}

/**
 * Variável acumulado × orçamento — o dia em que o mês virou.
 *
 * Duas séries, distinguidas por **traço** (cheio × tracejado) antes de cor: a
 * comparação tem de sobreviver a quem não separa matiz. A área entre elas é o
 * excesso, e é ela que carrega a leitura — o número no rodapé só confirma.
 *
 * A curva de gasto para em hoje de propósito. Projetá-la assumiria que o ritmo
 * continua, que é exatamente a pergunta em aberto.
 */
export function BurnupChart({ burnup: b, budgetLabel }: Props) {
  const points = b.points;
  if (points.length === 0) return null;

  const max = Math.max(
    ...points.map((p) => Math.max(p.spentCents, p.budgetCents)),
    1,
  );
  const plotW = W - PAD_L - PAD_R;
  const plotH = H - PAD_T - PAD_B;

  const x = (day: number) =>
    PAD_L + ((day - 1) / Math.max(points.length - 1, 1)) * plotW;
  const y = (cents: number) => PAD_T + plotH - (cents / max) * plotH;

  const realized = points.filter((p) => p.realized);
  const spentPath = realized
    .map((p, i) => `${i === 0 ? 'M' : 'L'}${x(p.day)},${y(p.spentCents)}`)
    .join(' ');
  const budgetPath = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'}${x(p.day)},${y(p.budgetCents)}`)
    .join(' ');

  // Área entre as curvas no trecho realizado: o excesso (ou a folga) visível.
  const gapArea =
    realized.length > 1
      ? `${spentPath} ${realized
          .slice()
          .reverse()
          .map((p) => `L${x(p.day)},${y(p.budgetCents)}`)
          .join(' ')} Z`
      : null;

  const over = b.gapCents > 0;
  const last = realized.at(-1);
  const ticks = [max / 2, max];

  return (
    <figure className="overflow-hidden rounded-xl border border-border bg-surface">
      <figcaption className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-border px-4 py-3">
        <h3 className="font-mono text-[10px] uppercase tracking-[0.12em] text-text-muted">
          Variável acumulado
        </h3>
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-text-muted">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-0.5 w-3.5 bg-expense" aria-hidden />
            gasto
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span
              className="h-0 w-3.5 border-t-2 border-dashed border-text-muted"
              aria-hidden
            />
            {budgetLabel ?? 'orçamento'}
          </span>
        </p>
      </figcaption>

      <div className="px-2 pb-1 pt-1 sm:px-3">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="w-full"
          style={{ height: 'auto' }}
          role="img"
          aria-label={`Gasto variável acumulado contra o orçamento. ${
            b.crossedOn
              ? `Passou o orçamento no dia ${b.crossedOn}.`
              : 'Não passou o orçamento.'
          }`}
        >
          {ticks.map((t) => (
            <g key={t}>
              <line
                x1={PAD_L}
                x2={W - PAD_R}
                y1={y(t)}
                y2={y(t)}
                className="stroke-border/70"
                strokeWidth={1}
              />
              <text
                x={PAD_L - 8}
                y={y(t) + 3}
                textAnchor="end"
                className="fill-text-muted font-mono text-[11px]"
              >
                {short(t)}
              </text>
            </g>
          ))}

          {gapArea ? (
            <path
              d={gapArea}
              className={over ? 'fill-warning/20' : 'fill-accent/12'}
            />
          ) : null}

          <path
            d={budgetPath}
            fill="none"
            className="stroke-text-muted"
            strokeWidth={2}
            strokeDasharray="5 4"
            strokeLinecap="round"
            opacity={0.8}
          />

          {realized.length > 1 ? (
            <path
              d={spentPath}
              fill="none"
              className={over ? 'stroke-warning' : 'stroke-expense'}
              strokeWidth={2}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          ) : null}

          {/* O dia da virada — a informação que a média diária não dá. */}
          {b.crossedOn != null ? (
            <g>
              <line
                x1={x(b.crossedOn)}
                x2={x(b.crossedOn)}
                y1={PAD_T}
                y2={PAD_T + plotH}
                className="stroke-warning/50"
                strokeWidth={1}
                strokeDasharray="2 3"
              />
              <text
                x={Math.min(x(b.crossedOn) + 5, W - PAD_R - 78)}
                y={PAD_T + 11}
                className="fill-warning font-mono text-[11px]"
              >
                passou · dia {b.crossedOn}
              </text>
            </g>
          ) : null}

          {last ? (
            <circle
              cx={x(last.day)}
              cy={y(last.spentCents)}
              r={4}
              className={cn(
                'stroke-surface',
                over ? 'fill-warning' : 'fill-expense',
              )}
              strokeWidth={2}
            />
          ) : null}
        </svg>
      </div>

      <p className="border-t border-border px-4 py-2.5 text-[11px] leading-snug text-text-muted">
        {over ? (
          <>
            <span className="font-medium text-warning tabular-nums">
              {formatBRL(b.gapCents)}
            </span>{' '}
            acima da reta
            {b.crossedOn != null ? ` desde o dia ${b.crossedOn}` : null}. Manter
            o ritmo fecha o mês em{' '}
            <span className="tabular-nums text-text">
              {formatBRL(projectClose(b))}
            </span>
            {' contra '}
            <span className="tabular-nums">{formatBRL(b.budgetCents)}</span>{' '}
            previstos.
          </>
        ) : (
          <>
            <span className="font-medium text-accent tabular-nums">
              {formatBRL(Math.abs(b.gapCents))}
            </span>{' '}
            de folga sobre a reta. No ritmo de hoje o mês fecha em{' '}
            <span className="tabular-nums text-text">
              {formatBRL(projectClose(b))}
            </span>
            .
          </>
        )}
      </p>
    </figure>
  );
}

/** Onde o mês fecha se o ritmo dos dias vividos continuar. */
function projectClose(b: Burnup): number {
  const realized = b.points.filter((p) => p.realized);
  const days = realized.length;
  if (days === 0) return 0;
  return Math.round((b.spentCents / days) * b.points.length);
}
