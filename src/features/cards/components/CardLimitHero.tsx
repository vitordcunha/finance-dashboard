import { MoneyText } from '@/components/money/MoneyText';
import { Panel } from '@/components/ui/Panel';
import { cn } from '@/lib/cn';

type CardLimitHeroProps = {
  limitCents: number;
  usedCents: number;
  availableCents: number;
  closingDay: number | null;
  dueDay: number | null;
  className?: string;
};

export function CardLimitHero({
  limitCents,
  usedCents,
  availableCents,
  closingDay,
  dueDay,
  className,
}: CardLimitHeroProps) {
  const usedRatio =
    limitCents > 0 ? Math.min(1, usedCents / limitCents) : 0;

  return (
    <Panel className={cn('space-y-5 p-5', className)}>
      <div>
        <p className="font-mono text-[11px] uppercase tracking-[0.12em] text-text-muted">
          Disponível
        </p>
        <p className="mt-1 font-display text-3xl font-medium tracking-tight text-text">
          <MoneyText cents={availableCents} />
        </p>
      </div>

      <div
        className="h-1.5 overflow-hidden rounded-full bg-border"
        role="progressbar"
        aria-valuenow={Math.round(usedRatio * 100)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="Uso do limite"
      >
        <div
          className="h-full rounded-full bg-accent transition-[width]"
          style={{ width: `${usedRatio * 100}%` }}
        />
      </div>

      <dl className="grid grid-cols-2 gap-4 text-sm">
        <div>
          <dt className="text-text-muted">Limite</dt>
          <dd className="mt-0.5 font-medium tabular-nums">
            <MoneyText cents={limitCents} />
          </dd>
        </div>
        <div>
          <dt className="text-text-muted">Usado</dt>
          <dd className="mt-0.5 font-medium tabular-nums">
            <MoneyText cents={usedCents} />
          </dd>
        </div>
        <div>
          <dt className="text-text-muted">Fecha</dt>
          <dd className="mt-0.5 font-medium">
            {closingDay != null ? `dia ${closingDay}` : '—'}
          </dd>
        </div>
        <div>
          <dt className="text-text-muted">Vence</dt>
          <dd className="mt-0.5 font-medium">
            {dueDay != null ? `dia ${dueDay}` : '—'}
          </dd>
        </div>
      </dl>
    </Panel>
  );
}
