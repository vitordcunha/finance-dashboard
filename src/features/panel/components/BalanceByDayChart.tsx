import { useEffect, useId, useRef, useState } from 'react';
import type { BandPoint, DayPoint } from '@/core/month-metrics';
import { formatBRL } from '@/core/money';
import { cn } from '@/lib/cn';

const W = 720;
const H = 280;
const PAD_L = 44;
const PAD_R = 14;
const PAD_T = 22;
const PAD_B = 28;

type Props = {
  points: DayPoint[];
  minimumCents: number;
  /** Menor saldo do mês — ganha marcador nomeado. */
  lowest: DayPoint | null;
  /**
   * Faixa de incerteza do estimado. A curva central usa a mediana; com base
   * curta a mediana é um chute com cara de fato, e o erro acumula justamente até
   * o fundo do poço, que é onde o usuário decide.
   */
  band?: BandPoint[] | null;
  /** Abre o extrato no dia selecionado. */
  onSelectDay?: (date: string) => void;
};

function short(cents: number): string {
  const v = cents / 100;
  const sign = v < 0 ? '−' : '';
  const abs = Math.abs(v);
  if (abs >= 1000) return `${sign}${(abs / 1000).toFixed(1).replace('.', ',')}k`;
  return `${sign}${Math.round(abs)}`;
}

function dayDelta(points: DayPoint[], point: DayPoint): number | null {
  const prev = points[point.day - 2];
  if (!prev) return null;
  return point.balanceCents - prev.balanceCents;
}

/**
 * Saldo em cada dia do mês.
 *
 * Série única: sem legenda, o título já diz o que é. A fronteira entre fato e
 * projeção é **traço** (cheio × tracejado), não cor — quem não distingue matiz
 * ainda lê. A faixa abaixo do colchão é o alerta, e o fundo do poço ganha
 * marcador com data porque é a informação que decide alguma coisa: não importa
 * fechar o mês bem se no dia 24 o saldo furou.
 */
export function BalanceByDayChart({
  points,
  minimumCents,
  lowest,
  band,
  onSelectDay,
}: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const movedRef = useRef(false);
  const uid = useId().replace(/:/g, '');
  const fillId = `balanceFill-${uid}`;
  const dangerFillId = `balanceDanger-${uid}`;
  const glowId = `balanceGlow-${uid}`;
  const clipId = `balanceClip-${uid}`;

  const [hover, setHover] = useState<DayPoint | null>(null);
  const [pinned, setPinned] = useState<DayPoint | null>(null);
  const [scrubbing, setScrubbing] = useState(false);

  const seriesKey =
    points.length > 0
      ? `${points[0]!.date}:${points.length}:${points.at(-1)!.balanceCents}`
      : '';

  useEffect(() => {
    setPinned(null);
    setHover(null);
  }, [seriesKey]);

  if (points.length === 0) return null;

  const values = points.map((p) => p.balanceCents);
  const estimateValues = points.map((p) => p.balanceWithEstimateCents);
  const hasEstimateOverlay = points.some(
    (p) => p.balanceWithEstimateCents !== p.balanceCents,
  );
  // A escala tem de caber a faixa e a curva de alerta: um piso fora do gráfico
  // esconderia exatamente o cenário que preocupa.
  const bandValues = band
    ? band.flatMap((b) => [b.lowCents, b.highCents])
    : [];
  const scaleValues = [
    ...values,
    ...(hasEstimateOverlay ? estimateValues : []),
    ...bandValues,
  ];
  const rawMin = Math.min(...scaleValues, minimumCents, 0);
  const dataMax = Math.max(...scaleValues, minimumCents, 0);

  /**
   * Teto **robusto**: o pico do salário não manda na escala.
   *
   * Em julho o saldo passa o mês entre R$ 0 e R$ 3 mil e recebe R$ 11.900 no dia
   * 31. Com o teto no dado máximo, os trinta dias em que a decisão acontece ficavam
   * espremidos nos 15% de baixo do gráfico — uma reta rente à base — e o único
   * traço visível era o penhasco do último dia. O teto vem do percentil 85 dos
   * saldos, com folga para o colchão; a ponta que passar é **cortada** e anotada,
   * porque o valor exato dela está no toque e na legenda embaixo.
   */
  const robustMax = Math.max(
    quantile(values, 0.85),
    minimumCents * 1.6,
    rawMin + 1,
  );
  const clipped = dataMax > robustMax * 1.25;
  const rawMax = clipped ? robustMax : dataMax;
  const peakIndex = values.indexOf(Math.max(...values));
  const span = Math.max(rawMax - rawMin, 1);
  const min = rawMin - span * 0.14;
  const max = rawMax + span * (clipped ? 0.06 : 0.14);

  const plotW = W - PAD_L - PAD_R;
  const plotH = H - PAD_T - PAD_B;

  const x = (i: number) =>
    PAD_L + (points.length === 1 ? plotW / 2 : (i / (points.length - 1)) * plotW);
  const y = (cents: number) =>
    PAD_T + plotH - ((cents - min) / (max - min)) * plotH;

  const todayIndex = points.findIndex((p) => p.isToday);
  const lastRealIndex =
    todayIndex >= 0
      ? todayIndex
      : points.every((p) => p.projected)
        ? -1
        : points.length - 1;

  const line = (from: number, to: number) =>
    points
      .slice(from, to + 1)
      .map((p, k) => `${k === 0 ? 'M' : 'L'}${x(from + k)},${y(p.balanceCents)}`)
      .join(' ');

  const estimateLine = (from: number, to: number) =>
    points
      .slice(from, to + 1)
      .map(
        (p, k) =>
          `${k === 0 ? 'M' : 'L'}${x(from + k)},${y(p.balanceWithEstimateCents)}`,
      )
      .join(' ');

  const areaTo = lastRealIndex >= 0 ? lastRealIndex : points.length - 1;
  const area = `${line(0, areaTo)} L${x(areaTo)},${y(min)} L${x(0)},${y(min)} Z`;

  // Faixa só na parte projetada: no realizado não há incerteza a desenhar.
  const bandFrom = Math.max(lastRealIndex, 0);
  const bandArea =
    band && bandFrom < points.length - 1
      ? [
          band
            .slice(bandFrom)
            .map((b, k) => `${k === 0 ? 'M' : 'L'}${x(bandFrom + k)},${y(b.highCents)}`)
            .join(' '),
          band
            .slice(bandFrom)
            .reverse()
            .map((b, k) => `L${x(points.length - 1 - k)},${y(b.lowCents)}`)
            .join(' '),
          'Z',
        ].join(' ')
      : null;

  const yZero = y(0);
  const yMin = y(minimumCents);
  const showMinimum = minimumCents > 0;
  const ticks = buildYTicks(min, max, rawMin, rawMax);

  const troughIsToday =
    lowest != null && todayIndex >= 0 && points[todayIndex]!.day === lowest.day;

  const active = hover ?? pinned;
  const activeDelta = active ? dayDelta(points, active) : null;
  const activeX = active ? x(active.day - 1) : 0;
  const activeY = active ? y(active.balanceCents) : 0;

  function indexFromClientX(clientX: number): number {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect || points.length === 1) return 0;
    const ratio = (clientX - rect.left) / rect.width;
    const px = ratio * W;
    const i = Math.round(((px - PAD_L) / plotW) * (points.length - 1));
    return Math.min(Math.max(i, 0), points.length - 1);
  }

  function setFromClientX(clientX: number) {
    const point = points[indexFromClientX(clientX)];
    if (point) setHover(point);
  }

  function onPointerDown(e: React.PointerEvent<SVGSVGElement>) {
    e.currentTarget.setPointerCapture(e.pointerId);
    movedRef.current = false;
    setScrubbing(true);
    setFromClientX(e.clientX);
  }

  function onPointerMove(e: React.PointerEvent<SVGSVGElement>) {
    if (!scrubbing && e.pointerType === 'touch') return;
    if (scrubbing) movedRef.current = true;
    setFromClientX(e.clientX);
  }

  function onPointerUp(e: React.PointerEvent<SVGSVGElement>) {
    const point = points[indexFromClientX(e.clientX)];
    if (point) {
      // Toque fixa o dia (mobile não tem hover). Clique no mesmo dia solta.
      if (e.pointerType === 'touch' || e.pointerType === 'pen') {
        setPinned((prev) =>
          prev?.day === point.day && !movedRef.current ? null : point,
        );
      }
      setHover(point);
    }
    setScrubbing(false);
  }

  function onPointerLeave() {
    if (scrubbing) return;
    setHover(null);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    const current = active ?? points[todayIndex >= 0 ? todayIndex : 0]!;
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      e.preventDefault();
      const dir = e.key === 'ArrowLeft' ? -1 : 1;
      const next = points[current.day - 1 + dir];
      if (next) {
        setPinned(next);
        setHover(next);
      }
    }
    if (e.key === 'Escape') {
      setPinned(null);
      setHover(null);
    }
  }

  return (
    <figure className="overflow-hidden rounded-xl border border-border bg-surface">
      <figcaption className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-border px-4 py-3">
        <h3 className="font-mono text-[10px] uppercase tracking-[0.12em] text-text-muted">
          Saldo dia a dia
        </h3>
        <p className="text-[11px] tabular-nums text-text-muted">
          {active ? (
            <span className="animate-fade-in inline-flex flex-wrap items-baseline gap-x-1.5">
              <span className="text-text">dia {active.day}</span>
              <span className="text-border-strong">·</span>
              <span
                className={cn(
                  'font-medium',
                  active.belowMinimum ? 'text-danger' : 'text-text',
                )}
              >
                {formatBRL(active.balanceCents)}
              </span>
              {activeDelta != null && activeDelta !== 0 ? (
                <span
                  className={cn(
                    'font-mono text-[10px]',
                    activeDelta > 0 ? 'text-accent' : 'text-text-muted',
                  )}
                >
                  {activeDelta > 0 ? '+' : ''}
                  {short(activeDelta)}
                </span>
              ) : null}
              {active.projected ? (
                <span className="rounded-sm bg-surface-elevated px-1 py-0.5 font-mono text-[9px] uppercase tracking-wide text-text-muted">
                  previsto
                </span>
              ) : null}
              {active.projected &&
              active.balanceWithEstimateCents !== active.balanceCents ? (
                <span className="font-mono text-[10px] text-warning">
                  c/ ritmo {short(active.balanceWithEstimateCents)}
                </span>
              ) : null}
              {active.isToday ? (
                <span className="rounded-sm bg-accent-muted px-1 py-0.5 font-mono text-[9px] uppercase tracking-wide text-accent">
                  hoje
                </span>
              ) : null}
              {onSelectDay ? (
                <button
                  type="button"
                  onClick={() => onSelectDay(active.date)}
                  className="rounded-sm px-1 py-0.5 font-mono text-[9px] uppercase tracking-wide text-accent underline-offset-2 hover:underline"
                >
                  ver no extrato
                </button>
              ) : null}
            </span>
          ) : hasEstimateOverlay || bandArea ? (
            'cheia = compromissos · pontilhada = se mantiver o ritmo · faixa = margem'
          ) : (
            'cheia = realizado · tracejada = previsto'
          )}
        </p>
      </figcaption>

      <div
        className="relative px-2 pb-1 pt-1 outline-none sm:px-3"
        tabIndex={0}
        role="group"
        aria-label="Gráfico de saldo. Use as setas para navegar entre os dias."
        onKeyDown={onKeyDown}
      >
        <svg
          ref={svgRef}
          viewBox={`0 0 ${W} ${H}`}
          className="w-full touch-none select-none"
          style={{ height: 'auto' }}
          role="img"
          aria-label="Saldo em cada dia do mês"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={() => setScrubbing(false)}
          onPointerLeave={onPointerLeave}
        >
          <defs>
            <linearGradient id={fillId} x1="0" y1="0" x2="0" y2="1">
              <stop
                offset="0%"
                className="text-accent"
                stopColor="currentColor"
                stopOpacity="0.22"
              />
              <stop
                offset="55%"
                className="text-accent"
                stopColor="currentColor"
                stopOpacity="0.06"
              />
              <stop
                offset="100%"
                className="text-accent"
                stopColor="currentColor"
                stopOpacity="0"
              />
            </linearGradient>
            <linearGradient id={dangerFillId} x1="0" y1="0" x2="0" y2="1">
              <stop
                offset="0%"
                className="text-danger"
                stopColor="currentColor"
                stopOpacity="0.14"
              />
              <stop
                offset="100%"
                className="text-danger"
                stopColor="currentColor"
                stopOpacity="0.02"
              />
            </linearGradient>
            <filter id={glowId} x="-40%" y="-40%" width="180%" height="180%">
              <feGaussianBlur stdDeviation="3" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
            {/* Corta a ponta do salário sem deixá-la governar a escala. */}
            <clipPath id={clipId}>
              <rect
                x={PAD_L}
                y={PAD_T - 2}
                width={plotW}
                height={plotH + 4}
              />
            </clipPath>
          </defs>

          {/* Grade horizontal — lê a escala sem poluir. */}
          {ticks.map((tick) => (
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

          {/* Faixa de alerta: tudo abaixo do colchão. */}
          {showMinimum && yMin < PAD_T + plotH ? (
            <rect
              x={PAD_L}
              y={yMin}
              width={plotW}
              height={Math.max(PAD_T + plotH - yMin, 0)}
              fill={`url(#${dangerFillId})`}
            />
          ) : null}

          {yZero > PAD_T && yZero < PAD_T + plotH ? (
            <line
              x1={PAD_L}
              x2={W - PAD_R}
              y1={yZero}
              y2={yZero}
              className="stroke-border-strong"
              strokeWidth={1.25}
            />
          ) : null}

          {showMinimum ? (
            <>
              <line
                x1={PAD_L}
                x2={W - PAD_R}
                y1={yMin}
                y2={yMin}
                className="stroke-danger/55"
                strokeWidth={1}
                strokeDasharray="3 3"
              />
              <text
                x={PAD_L + 4}
                y={yMin - 6}
                className="fill-danger font-mono text-[11px]"
              >
                mínimo {short(minimumCents)}
              </text>
            </>
          ) : null}

          <g clipPath={`url(#${clipId})`}>
            {/* Faixa antes da linha: contexto fica atrás do dado. */}
            {bandArea ? (
              <path
                d={bandArea}
                className="fill-text-muted/[0.13] stroke-text-muted/25"
                strokeWidth={1}
                strokeDasharray="2 3"
              />
            ) : null}

            {lastRealIndex >= 0 ? (
              <>
                <path
                  d={area}
                  fill={`url(#${fillId})`}
                  className="motion-safe:animate-fade-in"
                />
                <DrawPath d={line(0, lastRealIndex)} className="stroke-accent" />
              </>
            ) : null}

            {lastRealIndex < points.length - 1 ? (
              <path
                d={line(Math.max(lastRealIndex, 0), points.length - 1)}
                fill="none"
                className="stroke-text-muted"
                strokeWidth={2}
                strokeDasharray="5 4"
                strokeLinejoin="round"
                strokeLinecap="round"
                opacity={0.85}
              />
            ) : null}

            {/* Alerta: se o ritmo estimado se concretizar. Nunca é a curva do herói. */}
            {hasEstimateOverlay && lastRealIndex < points.length - 1 ? (
              <path
                d={estimateLine(Math.max(lastRealIndex, 0), points.length - 1)}
                fill="none"
                className="stroke-warning"
                strokeWidth={1.5}
                strokeDasharray="2 4"
                strokeLinejoin="round"
                strokeLinecap="round"
                opacity={0.75}
              />
            ) : null}

            {/* Dias de entrada: sem marca, a curva sobe e ninguém sabe por quê. */}
            {points
              .filter((p) => p.inCents > 0)
              .map((p) => (
                <circle
                  key={`in-${p.day}`}
                  cx={x(p.day - 1)}
                  cy={y(p.balanceCents)}
                  r={3.25}
                  className="fill-accent stroke-surface"
                  strokeWidth={1.5}
                  opacity={active && active.day !== p.day ? 0.55 : 1}
                />
              ))}
          </g>

          {/* A ponta cortada, anotada: o número existe, só não manda na escala.
              Ancorado pela borda mais próxima — centralizar no dia 31 jogava metade
              do texto fora do viewBox. */}
          {clipped ? (
            <text
              x={
                x(peakIndex) > W / 2
                  ? W - PAD_R - 2
                  : PAD_L + 2
              }
              y={PAD_T + 10}
              textAnchor={x(peakIndex) > W / 2 ? 'end' : 'start'}
              className="fill-accent font-mono text-[11px]"
            >
              ↑ {short(dataMax)} · dia {peakIndex + 1}
            </text>
          ) : null}

          {/* Fundo do poço: o dia que decide se o mês aperta. */}
          {lowest && (!active || active.day !== lowest.day) ? (
            <g>
              <circle
                cx={x(lowest.day - 1)}
                cy={y(lowest.balanceCents)}
                r={4.5}
                className={cn(
                  'stroke-surface',
                  lowest.belowMinimum ? 'fill-danger' : 'fill-text-muted',
                )}
                strokeWidth={2}
              />
              <text
                x={clampLabel(x(lowest.day - 1))}
                y={
                  y(lowest.balanceCents) > PAD_T + plotH - 34
                    ? y(lowest.balanceCents) - 11
                    : y(lowest.balanceCents) + 17
                }
                textAnchor="middle"
                className={cn(
                  'font-mono text-[12px]',
                  lowest.belowMinimum ? 'fill-danger' : 'fill-text-muted',
                )}
              >
                menor {short(lowest.balanceCents)} ·{' '}
                {troughIsToday ? 'hoje' : `dia ${lowest.day}`}
              </text>
            </g>
          ) : null}

          {todayIndex >= 0 ? (
            <>
              <line
                x1={x(todayIndex)}
                x2={x(todayIndex)}
                y1={PAD_T}
                y2={PAD_T + plotH}
                className="stroke-accent/35"
                strokeWidth={1}
                strokeDasharray="2 3"
              />
              <circle
                cx={x(todayIndex)}
                cy={y(points[todayIndex]!.balanceCents)}
                r={5}
                className="fill-accent stroke-surface"
                strokeWidth={2.5}
                filter={`url(#${glowId})`}
              />
              {/* Quando hoje **é** o fundo do poço, os dois rótulos caem no mesmo
                  ponto e o gráfico imprimia `menor 2·hoje dia 28`. Aí quem diz que
                  é hoje é o rótulo do fundo, que já está ali. */}
              {(!active || active.day !== points[todayIndex]!.day) &&
              !troughIsToday ? (
                <text
                  x={clampLabel(x(todayIndex))}
                  y={Math.max(y(points[todayIndex]!.balanceCents) - 12, PAD_T + 10)}
                  textAnchor="middle"
                  className="fill-accent font-mono text-[11px]"
                >
                  hoje
                </text>
              ) : null}
            </>
          ) : null}

          {active ? (
            <g className="motion-safe:animate-fade-in">
              <line
                x1={activeX}
                x2={activeX}
                y1={PAD_T}
                y2={PAD_T + plotH}
                className="stroke-text/40"
                strokeWidth={1}
              />
              <circle
                cx={activeX}
                cy={activeY}
                r={10}
                className={cn(
                  active.belowMinimum ? 'fill-danger/15' : 'fill-accent/15',
                )}
              />
              <circle
                cx={activeX}
                cy={activeY}
                r={4.5}
                className={cn(
                  'stroke-surface',
                  active.belowMinimum ? 'fill-danger' : 'fill-text',
                )}
                strokeWidth={2.5}
              />
            </g>
          ) : null}

          {[1, 8, 15, 22, points.length].map((day) => (
            <text
              key={day}
              x={clampLabel(x(day - 1), 18)}
              y={H - 8}
              textAnchor="middle"
              className={cn(
                'font-mono text-[12px]',
                active?.day === day ? 'fill-text' : 'fill-text-muted',
              )}
            >
              {day}
            </text>
          ))}
        </svg>

        {active ? (
          <ChartTooltip
            point={active}
            delta={activeDelta}
            leftPct={(activeX / W) * 100}
            topPct={(activeY / H) * 100}
          />
        ) : null}
      </div>

      <div className="border-t border-border px-4 py-2.5">
        <DayDetail point={active} pinned={pinned != null} />
      </div>
    </figure>
  );
}

function DrawPath({ d, className }: { d: string; className?: string }) {
  const pathRef = useRef<SVGPathElement | null>(null);

  useEffect(() => {
    const el = pathRef.current;
    if (!el) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      el.style.strokeDasharray = 'none';
      el.style.strokeDashoffset = '0';
      return;
    }
    const len = el.getTotalLength();
    el.style.strokeDasharray = `${len}`;
    el.style.strokeDashoffset = `${len}`;
    el.style.transition = 'none';
    requestAnimationFrame(() => {
      el.style.transition =
        'stroke-dashoffset 700ms cubic-bezier(0.22, 1, 0.36, 1)';
      el.style.strokeDashoffset = '0';
    });
  }, [d]);

  return (
    <path
      ref={pathRef}
      d={d}
      fill="none"
      className={className}
      strokeWidth={2.25}
      strokeLinejoin="round"
      strokeLinecap="round"
    />
  );
}

function ChartTooltip({
  point,
  delta,
  leftPct,
  topPct,
}: {
  point: DayPoint;
  delta: number | null;
  leftPct: number;
  topPct: number;
}) {
  const flipX = leftPct > 72;
  const flipY = topPct < 28;

  return (
    <div
      className="pointer-events-none absolute z-10 hidden min-w-[148px] max-w-[200px] animate-fade-in rounded-lg border border-border-strong bg-surface-elevated/95 px-3 py-2 shadow-[0_8px_24px_rgb(0_0_0_/0.35)] backdrop-blur-sm sm:block"
      style={{
        left: `${leftPct}%`,
        top: `${topPct}%`,
        transform: `translate(${flipX ? '-108%' : '12%'}, ${flipY ? '12%' : 'calc(-100% - 12px)'})`,
      }}
    >
      <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-text-muted">
        Dia {point.day}
        {point.isToday ? ' · hoje' : ''}
        {point.projected ? ' · previsto' : ''}
      </p>
      <p
        className={cn(
          'mt-0.5 text-[15px] font-medium tabular-nums tracking-tight',
          point.belowMinimum ? 'text-danger' : 'text-text',
        )}
      >
        {formatBRL(point.balanceCents)}
      </p>
      {delta != null && delta !== 0 ? (
        <p
          className={cn(
            'mt-0.5 font-mono text-[11px] tabular-nums',
            delta > 0 ? 'text-accent' : 'text-text-muted',
          )}
        >
          {delta > 0 ? '+' : '−'}
          {formatBRL(Math.abs(delta))} no dia
        </p>
      ) : null}
      {(point.inCents > 0 || point.outCents > 0) && (
        <p className="mt-1 flex gap-2 font-mono text-[10px] tabular-nums text-text-muted">
          {point.inCents > 0 ? (
            <span className="text-accent">+{short(point.inCents)}</span>
          ) : null}
          {point.outCents > 0 ? <span>−{short(point.outCents)}</span> : null}
        </p>
      )}
    </div>
  );
}

/**
 * O que moveu a curva naquele dia.
 *
 * Sem isso o gráfico mostra a forma e esconde a causa: dá para ver o saldo
 * subir no dia 14 e não fazer ideia de que foi o rateio entrando.
 */
function DayDetail({
  point,
  pinned,
}: {
  point: DayPoint | null;
  pinned: boolean;
}) {
  const events = point?.events ?? [];

  if (!point || events.length === 0) {
    return (
      <p className="min-h-[34px] text-[11px] text-text-muted">
        {point
          ? `Dia ${point.day} · nenhum movimento, o saldo vem do dia anterior.`
          : 'Passe o dedo ou use ← → para ver o que acontece em cada dia.'}
        {pinned ? (
          <span className="ml-1 text-text-muted/70">Toque de novo para soltar.</span>
        ) : null}
      </p>
    );
  }

  return (
    <ul className="min-h-[34px] space-y-1">
      {events.slice(0, 4).map((e) => (
        <li
          key={e.id}
          className="flex items-baseline justify-between gap-3 text-[12px] animate-fade-in"
        >
          <span className="min-w-0 truncate text-text-muted">
            {e.label}
            {e.cashless ? (
              <span className="ml-1 font-mono text-[9px] uppercase tracking-wide">
                · cartão
              </span>
            ) : null}
            {e.estimated ? (
              <span className="ml-1 font-mono text-[9px] uppercase tracking-wide">
                · estimado
              </span>
            ) : null}
          </span>
          <span
            className={cn(
              'shrink-0 tabular-nums',
              e.nominalCents > 0 ? 'text-accent' : 'text-text',
            )}
          >
            {formatBRL(e.nominalCents)}
          </span>
        </li>
      ))}
      {events.length > 4 ? (
        <li className="text-[11px] text-text-muted">
          + {events.length - 4} {events.length - 4 === 1 ? 'outro' : 'outros'}
        </li>
      ) : null}
    </ul>
  );
}

/** Mantém rótulo dentro da caixa: no dia 1 e no 31 ele vazaria. */
function clampLabel(px: number, inset = 44): number {
  return Math.min(Math.max(px, PAD_L + inset), W - PAD_R - inset);
}

/** Percentil linear simples — só para dimensionar eixo, não para estatística. */
function quantile(values: ReadonlyArray<number>, q: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const pos = (sorted.length - 1) * q;
  const low = Math.floor(pos);
  const high = Math.ceil(pos);
  if (low === high) return sorted[low]!;
  return sorted[low]! + (sorted[high]! - sorted[low]!) * (pos - low);
}

/** Dois ou três ticks úteis — inclui zero quando ele entra no range. */
function buildYTicks(
  plotMin: number,
  plotMax: number,
  dataMin: number,
  dataMax: number,
): number[] {
  const candidates = [dataMax, 0, dataMin].filter(
    (v, i, arr) =>
      Number.isFinite(v) &&
      v >= plotMin &&
      v <= plotMax &&
      arr.indexOf(v) === i,
  );
  if (candidates.length >= 2) return candidates.sort((a, b) => b - a);

  const mid = (dataMin + dataMax) / 2;
  return [dataMax, mid, dataMin]
    .filter((v, i, arr) => arr.indexOf(v) === i)
    .sort((a, b) => b - a);
}
