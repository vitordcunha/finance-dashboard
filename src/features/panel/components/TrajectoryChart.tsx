import type { Trajectory } from '@/core/month-metrics';
import { formatMonth } from '@/core/month';
import { formatBRL } from '@/core/money';
import { cn } from '@/lib/cn';

const W = 720;
const H = 170;
const PAD_L = 44;
const PAD_R = 14;
const PAD_T = 18;
const PAD_B = 24;

type Props = {
  trajectory: Trajectory;
  minimumCents: number;
  currentYm: string;
  onSelect?: (ym: string) => void;
};

function short(cents: number): string {
  const v = cents / 100;
  const sign = v < 0 ? '−' : '';
  const abs = Math.abs(v);
  if (abs >= 1000) return `${sign}${(abs / 1000).toFixed(0)}k`;
  return `${sign}${Math.round(abs)}`;
}

/**
 * Onde o saldo chega ao longo da janela.
 *
 * A fita mostra deltas por mês; deltas não somam de cabeça. Doze resultados
 * positivos em sequência não dizem se o saldo dobrou ou ficou parado — o olho
 * não acumula. Esta curva é a mesma informação, acumulada, e responde a pergunta
 * que a fita não responde: “estou construindo algo?”.
 *
 * Fato e projeção se separam por **traço**, como no gráfico do mês. Uma subida
 * reta e longa aqui é sinal de otimismo na projeção, não de riqueza — e é bom
 * que fique óbvio em vez de enterrado num aviso.
 */
export function TrajectoryChart({
  trajectory: t,
  minimumCents,
  currentYm,
  onSelect,
}: Props) {
  const points = t.points;
  if (points.length < 2) return null;

  const values = points.map((p) => p.closingCents);
  const rawMin = Math.min(...values, minimumCents, 0);
  const rawMax = Math.max(...values, minimumCents, 0);
  const span = Math.max(rawMax - rawMin, 1);
  const min = rawMin - span * 0.14;
  const max = rawMax + span * 0.14;

  const plotW = W - PAD_L - PAD_R;
  const plotH = H - PAD_T - PAD_B;

  const x = (i: number) => PAD_L + (i / (points.length - 1)) * plotW;
  const y = (cents: number) =>
    PAD_T + plotH - ((cents - min) / (max - min)) * plotH;

  const currentIndex = points.findIndex((p) => p.ym === currentYm);
  const splitAt = currentIndex >= 0 ? currentIndex : 0;

  const path = (from: number, to: number) =>
    points
      .slice(from, to + 1)
      .map((p, k) => `${k === 0 ? 'M' : 'L'}${x(from + k)},${y(p.closingCents)}`)
      .join(' ');

  const yMin = y(minimumCents);
  const showMinimum = minimumCents > 0;
  const growing = t.deltaCents >= 0;
  const spansYears = points[0]!.ym.slice(0, 4) !== points.at(-1)!.ym.slice(0, 4);

  return (
    <figure className="overflow-hidden rounded-xl border border-border bg-surface">
      <figcaption className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-border px-4 py-3">
        <h3 className="font-mono text-[10px] uppercase tracking-[0.12em] text-text-muted">
          Para onde o saldo caminha
        </h3>
        <p className="text-[11px] tabular-nums text-text-muted">
          {formatMonth(points.at(-1)!.ym, 'MMM yyyy')}{' '}
          <span className="text-text">{formatBRL(t.endCents)}</span>{' '}
          <span className={growing ? 'text-accent' : 'text-danger'}>
            {growing ? '+' : '−'}
            {short(Math.abs(t.deltaCents))}
          </span>
        </p>
      </figcaption>

      <div className="px-2 pb-1 pt-1 sm:px-3">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="w-full"
          style={{ height: 'auto' }}
          role="img"
          aria-label={`Saldo de fechamento por mês, de ${points[0]!.ym} a ${points.at(-1)!.ym}. Termina em ${formatBRL(t.endCents)}.`}
        >
          {[rawMin, rawMax].map((tick) => (
            <g key={tick}>
              <line
                x1={PAD_L}
                x2={W - PAD_R}
                y1={y(tick)}
                y2={y(tick)}
                className="stroke-border/70"
                strokeWidth={1}
              />
              <text
                x={PAD_L - 8}
                y={y(tick) + 3}
                textAnchor="end"
                className="fill-text-muted font-mono text-[11px]"
              >
                {short(tick)}
              </text>
            </g>
          ))}

          {showMinimum && yMin > PAD_T && yMin < PAD_T + plotH ? (
            <line
              x1={PAD_L}
              x2={W - PAD_R}
              y1={yMin}
              y2={yMin}
              className="stroke-danger/50"
              strokeWidth={1}
              strokeDasharray="3 3"
            />
          ) : null}

          {splitAt > 0 ? (
            <path
              d={path(0, splitAt)}
              fill="none"
              className="stroke-accent"
              strokeWidth={2}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          ) : null}

          <path
            d={path(splitAt, points.length - 1)}
            fill="none"
            className="stroke-text-muted"
            strokeWidth={2}
            strokeDasharray="5 4"
            strokeLinejoin="round"
            strokeLinecap="round"
            opacity={0.85}
          />

          {points.map((p, i) => (
            <g key={p.ym}>
              {onSelect ? (
                <rect
                  x={x(i) - plotW / (points.length * 2)}
                  y={PAD_T}
                  width={plotW / points.length}
                  height={plotH}
                  fill="transparent"
                  className="cursor-pointer"
                  onClick={() => onSelect(p.ym)}
                >
                  <title>
                    {formatMonth(p.ym, 'MMMM yyyy')} · {formatBRL(p.closingCents)}
                  </title>
                </rect>
              ) : null}
              {p.belowMinimum || p.ym === t.lowest?.ym ? (
                <circle
                  cx={x(i)}
                  cy={y(p.closingCents)}
                  r={3.5}
                  className={cn(
                    'stroke-surface',
                    p.belowMinimum ? 'fill-danger' : 'fill-text-muted',
                  )}
                  strokeWidth={2}
                />
              ) : null}
            </g>
          ))}

          {/* Só as pontas e o mês corrente: doze rótulos colidem. Com ano, porque
              a janela cruza o réveillon e dois "jul" lado a lado não se distinguem. */}
          {[0, splitAt, points.length - 1]
            .filter((i, k, arr) => arr.indexOf(i) === k)
            .map((i) => (
              <text
                key={i}
                x={Math.min(Math.max(x(i), PAD_L + 20), W - PAD_R - 20)}
                y={H - 8}
                textAnchor="middle"
                className={cn(
                  'font-mono text-[11px]',
                  i === splitAt ? 'fill-text' : 'fill-text-muted',
                )}
              >
                {formatMonth(points[i]!.ym, spansYears ? 'MMM/yy' : 'MMM')}
              </text>
            ))}
        </svg>
      </div>

      {t.lowest && t.lowest.closingCents < minimumCents ? (
        <p className="border-t border-border px-4 py-2.5 text-[11px] leading-snug text-danger">
          O pior fechamento à frente é{' '}
          <span className="font-medium tabular-nums">
            {formatBRL(t.lowest.closingCents)}
          </span>{' '}
          em {formatMonth(t.lowest.ym, 'MMMM yyyy')} — abaixo do colchão.
        </p>
      ) : null}
    </figure>
  );
}
