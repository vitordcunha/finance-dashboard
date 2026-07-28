import { AlertTriangle } from 'lucide-react';
import type { HouseholdSplit } from '@/core/month-metrics';
import { formatBRL } from '@/core/money';
import { cn } from '@/lib/cn';

type Props = {
  split: HouseholdSplit;
};

/** Acima disto a divergência deixa de ser arredondamento. */
const DRIFT_ALERT_CENTS = 5_000;

/**
 * A divisão da casa: peso pela renda fixa × o que está agendado.
 *
 * Duas barras por pessoa, mesma escala: peso em cima, agendado embaixo. A
 * comparação é de **posição**, não de cor — desalinhamento se vê de relance e
 * sobrevive a quem não separa matiz.
 *
 * O aviso de divergência é o ponto do componente. A proporção está gravada como
 * valor nas linhas de rateio, então mudar um salário não recalcula nada: sem esta
 * tela a divisão envelhece em silêncio e ninguém descobre.
 */
export function HouseholdSplitCard({ split }: Props) {
  const drift = split.hasContribution && split.worstDriftCents >= DRIFT_ALERT_CENTS;

  return (
    <div className="rounded-xl border border-border bg-surface p-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-text-muted">
          Divisão da casa
        </p>
        <p className="text-[11px] text-text-muted">
          {formatBRL(split.houseCostCents)} de compromisso
        </p>
      </div>

      <div className="mt-3 space-y-3">
        {split.people.map((p) => {
          const pct = p.weightBps / 100;
          const scheduledPct =
            split.houseCostCents > 0
              ? (p.scheduledOutCents / split.houseCostCents) * 100
              : 0;
          const gap = p.scheduledOutCents - p.expectedShareCents;

          return (
            <div key={p.personId}>
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 text-[12px]">
                <span className="font-medium text-text">{p.name}</span>
                <span className="text-text-muted">
                  ganha{' '}
                  <span className="tabular-nums text-text">
                    {formatBRL(p.fixedIncomeCents)}
                  </span>{' '}
                  · deve{' '}
                  <span className="tabular-nums text-text">
                    {formatBRL(p.expectedShareCents)}
                  </span>
                </span>
              </div>

              <div className="mt-1.5 space-y-1">
                <Row
                  label={`peso ${pct.toFixed(1).replace('.', ',')}%`}
                  pct={pct}
                  className="bg-accent/55"
                />
                <Row
                  label={`agendado ${formatBRL(p.scheduledOutCents)}`}
                  pct={Math.min(scheduledPct, 100)}
                  className={
                    split.hasContribution && Math.abs(gap) >= DRIFT_ALERT_CENTS
                      ? 'bg-warning/60'
                      : 'bg-expense/45'
                  }
                />
              </div>

              {split.hasContribution && Math.abs(gap) >= DRIFT_ALERT_CENTS ? (
                <p className="mt-1 text-[11px] leading-snug text-text-muted">
                  {gap > 0 ? 'Paga' : 'Falta'}{' '}
                  <span className="tabular-nums text-warning">
                    {formatBRL(Math.abs(gap))}
                  </span>{' '}
                  {gap > 0 ? 'acima' : 'abaixo'} do que a proporção pede.
                </p>
              ) : null}
            </div>
          );
        })}
      </div>

      {drift ? (
        <p className="mt-3 flex items-start gap-2 border-t border-border/70 pt-2 text-[11px] leading-snug text-warning">
          <AlertTriangle className="mt-px size-3.5 shrink-0" aria-hidden />
          <span>
            O rateio está gravado como valor nos lançamentos, então mudar um
            salário não recalcula a divisão. Ajuste as parcelas para voltar à
            proporção.
          </span>
        </p>
      ) : !split.hasContribution ? (
        <p className="mt-3 border-t border-border/70 pt-2 text-[11px] leading-snug text-text-muted">
          Este mês não tem rateio agendado — o compromisso sai todo de uma conta
          só. Os pesos acima são a proporção que a regra pediria.
        </p>
      ) : null}
    </div>
  );
}

function Row({
  label,
  pct,
  className,
}: {
  label: string;
  pct: number;
  className: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-bg">
        <div
          className={cn('h-full rounded-full', className)}
          style={{ width: `${Math.max(pct, 1)}%` }}
        />
      </div>
      <span className="w-36 shrink-0 text-right font-mono text-[10px] tabular-nums text-text-muted">
        {label}
      </span>
    </div>
  );
}
