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
 * Fechamento acumulado mês a mês — não o gráfico dia a dia.
 *
 * Cheia = só o cadastrado; tracejada = se o ritmo estimado se mantiver, **somado
 * mês a mês**.
 *
 * O headline mudou de dono. Era `jul 2027 R$ 105.332,25 +97k`: o saldo terminal de
 * uma janela de treze meses, em corpo destacado, calculado com um único mês de gasto
 * variável descontado — o número mais visível do painel era o menos defensável, e
 * ninguém decide nada com o saldo de julho do ano que vem. Agora o headline é o
 * **pior fechamento à frente**, que é onde alguma decisão cabe, e o terminal desce
 * para o rodapé com o rótulo do cenário.
 */
export function TrajectoryChart({
  trajectory: t,
  minimumCents,
  currentYm,
  onSelect,
}: Props) {
  const points = t.points;
  if (points.length < 2) return null;

  const commitmentValues = points.map((p) => p.closingCents);
  const estimateValues = points.map((p) => p.closingWithEstimateCents);
  const values = t.showsEstimate
    ? [...commitmentValues, ...estimateValues]
    : commitmentValues;
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

  const pathFor = (
    from: number,
    to: number,
    pick: (p: (typeof points)[number]) => number,
  ) =>
    points
      .slice(from, to + 1)
      .map((p, k) => `${k === 0 ? 'M' : 'L'}${x(from + k)},${y(pick(p))}`)
      .join(' ');

  const yMin = y(minimumCents);
  const showMinimum = minimumCents > 0;
  const spansYears = points[0]!.ym.slice(0, 4) !== points.at(-1)!.ym.slice(0, 4);

  // O pior mês à frente no cenário que vale: com estimado quando existe.
  const worst = t.showsEstimate ? t.lowestWithEstimate : t.lowest;
  const worstCents = worst
    ? t.showsEstimate
      ? worst.closingWithEstimateCents
      : worst.closingCents
    : null;
  const endCents = t.showsEstimate ? t.endWithEstimateCents : t.endCents;
  const alertLowest =
    t.showsEstimate && t.lowestWithEstimate
      ? t.lowestWithEstimate.belowMinimumWithEstimate
        ? t.lowestWithEstimate
        : null
      : t.lowest && t.lowest.belowMinimum
        ? t.lowest
        : null;

  return (
    <figure className="overflow-hidden rounded-xl border border-border bg-surface">
      <figcaption className="space-y-1 border-b border-border px-4 py-3">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <h3 className="font-mono text-[10px] uppercase tracking-[0.12em] text-text-muted">
            Saldo no fim de cada mês
          </h3>
          {worst && worstCents != null ? (
            <p className="text-[11px] tabular-nums text-text-muted">
              pior mês à frente{' '}
              <span
                className={cn(
                  'font-medium',
                  worstCents < minimumCents ? 'text-danger' : 'text-text',
                )}
              >
                {formatBRL(worstCents)}
              </span>{' '}
              em {formatMonth(worst.ym, spansYears ? 'MMM/yy' : 'MMMM')}
            </p>
          ) : null}
        </div>
        <p className="text-[11px] leading-snug text-text-muted">
          {t.showsEstimate
            ? `Mantendo o ritmo, a janela termina em ${formatBRL(endCents)}; só com o que está cadastrado, ${formatBRL(t.endCents)}. Doze meses à frente é ordem de grandeza, não previsão.`
            : 'Fechamento acumulado da janela — não é o gráfico dia a dia.'}
        </p>
      </figcaption>

      <div className="px-2 pb-1 pt-1 sm:px-3">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="w-full"
          style={{ height: 'auto' }}
          role="img"
          aria-label={
            t.showsEstimate
              ? `Saldo de fechamento por mês, de ${points[0]!.ym} a ${points.at(-1)!.ym}. Com ritmo estimado termina em ${formatBRL(t.endWithEstimateCents)}; só compromissos em ${formatBRL(t.endCents)}.`
              : `Saldo de fechamento por mês, de ${points[0]!.ym} a ${points.at(-1)!.ym}. Termina em ${formatBRL(t.endCents)}.`
          }
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

          {/* Estimado atrás: se mantiver o ritmo. */}
          {t.showsEstimate ? (
            <path
              d={pathFor(
                splitAt,
                points.length - 1,
                (p) => p.closingWithEstimateCents,
              )}
              fill="none"
              className="stroke-text-muted"
              strokeWidth={2}
              strokeDasharray="5 4"
              strokeLinejoin="round"
              strokeLinecap="round"
              opacity={0.9}
            />
          ) : null}

          {/* Compromissos: fato cheio, projeção tracejada mais viva. */}
          {splitAt > 0 ? (
            <path
              d={pathFor(0, splitAt, (p) => p.closingCents)}
              fill="none"
              className="stroke-accent"
              strokeWidth={2}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          ) : null}

          <path
            d={pathFor(splitAt, points.length - 1, (p) => p.closingCents)}
            fill="none"
            className="stroke-accent"
            strokeWidth={2}
            strokeDasharray="5 4"
            strokeLinejoin="round"
            strokeLinecap="round"
            opacity={0.75}
          />

          {points.map((p, i) => {
            const markEstimate =
              t.showsEstimate &&
              (p.belowMinimumWithEstimate ||
                p.ym === t.lowestWithEstimate?.ym);
            const markCommit =
              p.belowMinimum || p.ym === t.lowest?.ym;
            return (
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
                      {formatMonth(p.ym, 'MMMM yyyy')} · cadastrado{' '}
                      {formatBRL(p.closingCents)}
                      {t.showsEstimate
                        ? ` · com ritmo ${formatBRL(p.closingWithEstimateCents)}`
                        : ''}
                    </title>
                  </rect>
                ) : null}
                {markCommit ? (
                  <circle
                    cx={x(i)}
                    cy={y(p.closingCents)}
                    r={3.5}
                    className={cn(
                      'stroke-surface',
                      p.belowMinimum ? 'fill-danger' : 'fill-accent',
                    )}
                    strokeWidth={2}
                  />
                ) : null}
                {markEstimate &&
                p.closingWithEstimateCents !== p.closingCents ? (
                  <circle
                    cx={x(i)}
                    cy={y(p.closingWithEstimateCents)}
                    r={3}
                    className={cn(
                      'stroke-surface',
                      p.belowMinimumWithEstimate
                        ? 'fill-danger'
                        : 'fill-text-muted',
                    )}
                    strokeWidth={2}
                  />
                ) : null}
              </g>
            );
          })}

          {/* Só as pontas e o mês corrente — e mesmo esses três colidem quando o
              corrente é o segundo da janela: o gráfico imprimia `jun/2jul/26`.
              Rótulo a menos de ~52px do anterior não entra. */}
          {[0, splitAt, points.length - 1]
            .filter((i, k, arr) => arr.indexOf(i) === k)
            .sort((a, b) => a - b)
            .filter((i, k, kept) => k === 0 || x(i) - x(kept[k - 1]!) > 52)
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

      <p className="border-t border-border px-4 py-2 text-[11px] leading-snug text-text-muted">
        {t.showsEstimate
          ? 'Verde = só o cadastrado · cinza = mantendo o ritmo, acumulado mês a mês · não é o saldo dia a dia.'
          : 'Fechamento de cada mês acumulado · não é o saldo dia a dia.'}
      </p>

      {alertLowest ? (
        <p className="border-t border-border px-4 py-2.5 text-[11px] leading-snug text-danger">
          O pior fechamento à frente é{' '}
          <span className="font-medium tabular-nums">
            {formatBRL(
              t.showsEstimate
                ? alertLowest.closingWithEstimateCents
                : alertLowest.closingCents,
            )}
          </span>{' '}
          em {formatMonth(alertLowest.ym, 'MMMM yyyy')} — abaixo do colchão.
        </p>
      ) : null}
    </figure>
  );
}
