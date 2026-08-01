import { AlertTriangle, Tag } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { HouseholdSplit } from '@/core/month-metrics';
import { formatBRL } from '@/core/money';
import { cn } from '@/lib/cn';

type Props = {
  split: HouseholdSplit;
  /** Nomes das categorias no pote, para dizer o que está sendo dividido. */
  sharedCategoryNames?: string[];
};

/** Acima disto a divergência deixa de ser arredondamento. */
const DRIFT_ALERT_CENTS = 5_000;

/**
 * `renda recorrente **deste mês**` não é preciosismo: em julho/2026 só a primeira
 * quinzena dela está agendada, então o peso do mês é 79,8/20,2 — e a partir de
 * agosto, com as três recorrências dela ativas, é 66/34. Sem dizer de onde vem o
 * peso, o card parece contradizer a si mesmo de um mês para o outro.
 */
const MODE_LABEL: Record<HouseholdSplit['mode'], string> = {
  income_share: 'proporcional à renda recorrente deste mês',
  equal_50: 'meio a meio',
  custom: 'porcentagem definida por vocês',
};

/**
 * A divisão da casa: o pote, a cota de cada um, e a parcela que fecha a conta.
 *
 * Duas barras por pessoa, mesma escala: cota em cima, ônus real embaixo. A
 * comparação é de **posição**, não de cor — desalinhamento se vê de relance e
 * sobrevive a quem não separa matiz.
 *
 * O que o card faz de novo é **dizer o número**. Antes ele dizia "ajuste as
 * parcelas para voltar à proporção" e não dizia para quanto: a base do rateio vivia
 * fora do app, e quando o supermercado previsto subiu de R$ 500 para R$ 1.100 a
 * parcela ficou R$ 204/mês desatualizada sem ninguém perceber. Agora a parcela é
 * derivada do pote e da regra, e o card mostra a diferença contra o que está
 * agendado.
 */
export function HouseholdSplitCard({ split, sharedCategoryNames }: Props) {
  if (split.needsSharedCategories) {
    return (
      <div className="rounded-xl border border-border bg-surface p-3">
        <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-text-muted">
          Divisão da casa
        </p>
        <p className="mt-2 flex items-start gap-2 text-[11px] leading-relaxed text-text-muted">
          <Tag className="mt-px size-3.5 shrink-0" aria-hidden />
          <span>
            Falta dizer <strong className="text-text">quais categorias são
            conta da casa</strong>. Sem isso não há pote a dividir — e adivinhar
            pelo que é recorrente colocava no pote o transporte de um e a fatura do
            cartão do outro.{' '}
            <Link
              to="/settings"
              className="text-accent underline-offset-2 hover:underline"
            >
              Marcar em Ajustes
            </Link>
          </span>
        </p>
      </div>
    );
  }

  const drift =
    split.hasContribution && split.worstDriftCents >= DRIFT_ALERT_CENTS;
  const scale = Math.max(
    split.houseCostCents,
    ...split.people.map((p) => Math.max(p.expectedShareCents, p.burdenCents)),
    1,
  );

  return (
    <div className="rounded-xl border border-border bg-surface p-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-text-muted">
          Divisão da casa
        </p>
        <p className="text-[11px] text-text-muted">
          <span className="tabular-nums text-text">
            {formatBRL(split.houseCostCents)}
          </span>{' '}
          de conta da casa
        </p>
      </div>

      <p className="mt-1 text-[11px] leading-snug text-text-muted">
        {MODE_LABEL[split.mode]}
        {split.usedFallback ? ' (sem renda recorrente cadastrada → meio a meio)' : ''}
        {sharedCategoryNames && sharedCategoryNames.length > 0
          ? ` · ${sharedCategoryNames.join(', ')}`
          : ''}
      </p>

      <div className="mt-3 space-y-3.5">
        {split.people.map((p) => {
          const gap = p.driftCents;
          const flagged =
            split.hasContribution && Math.abs(gap) >= DRIFT_ALERT_CENTS;
          const pct = (cents: number) => (cents / scale) * 100;

          return (
            <div key={p.personId}>
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 text-[12px]">
                <span className="font-medium text-text">{p.name}</span>
                <span className="text-text-muted">
                  {split.mode === 'income_share' ? (
                    <>
                      ganha{' '}
                      <span className="tabular-nums text-text">
                        {formatBRL(p.fixedIncomeCents)}
                      </span>{' '}
                      ·{' '}
                    </>
                  ) : null}
                  <span className="tabular-nums text-text">
                    {(p.weightBps / 100).toFixed(1).replace('.', ',')}%
                  </span>
                </span>
              </div>

              <div className="mt-1.5 space-y-1">
                <Row
                  label={`cota ${formatBRL(p.expectedShareCents)}`}
                  pct={pct(p.expectedShareCents)}
                  className="bg-accent/55"
                />
                <Row
                  label={`ônus ${formatBRL(p.burdenCents)}`}
                  pct={pct(p.burdenCents)}
                  className={flagged ? 'bg-warning/60' : 'bg-expense/45'}
                />
              </div>

              <p className="mt-1 text-[11px] leading-snug text-text-muted">
                <Composition person={p} />
              </p>

              {flagged ? (
                <p className="mt-1 text-[11px] leading-snug text-text-muted">
                  {gap > 0 ? 'Paga' : 'Falta'}{' '}
                  <span className="tabular-nums text-warning">
                    {formatBRL(Math.abs(gap))}
                  </span>{' '}
                  {gap > 0 ? 'acima' : 'abaixo'} da cota.
                  {p.suggestedTransferCents > 0 ? (
                    <>
                      {' '}
                      A parcela que fecharia o mês é{' '}
                      <span className="tabular-nums text-text">
                        {formatBRL(p.suggestedTransferCents)}
                      </span>
                      {p.transferredCents > 0
                        ? ` (agendado ${formatBRL(p.transferredCents)})`
                        : ''}
                      .
                    </>
                  ) : null}
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
            O repasse está gravado como valor em cada lançamento, então mudar um
            salário ou uma conta não recalcula nada. Os números acima são o que a
            regra pede hoje.
          </span>
        </p>
      ) : !split.hasContribution ? (
        <p className="mt-3 border-t border-border/70 pt-2 text-[11px] leading-snug text-text-muted">
          Este mês não tem repasse agendado — a conta da casa sai toda de uma conta
          só. As cotas acima são o que a regra pediria.
        </p>
      ) : null}
    </div>
  );
}

/** De onde vem o ônus: pagar direto, repassar, receber. */
function Composition({ person }: { person: HouseholdSplit['people'][number] }) {
  const parts: string[] = [];
  if (person.paidDirectCents > 0) {
    parts.push(`paga ${formatBRL(person.paidDirectCents)} direto`);
  }
  if (person.transferredCents > 0) {
    parts.push(`repassa ${formatBRL(person.transferredCents)}`);
  }
  if (person.receivedCents > 0) {
    parts.push(`recebe ${formatBRL(person.receivedCents)}`);
  }
  if (parts.length === 0) return <>Não paga nada da casa neste mês.</>;
  return <>{parts.join(' · ')}</>;
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
          style={{ width: `${Math.min(Math.max(pct, 1), 100)}%` }}
        />
      </div>
      <span className="w-36 shrink-0 text-right font-mono text-[10px] tabular-nums text-text-muted">
        {label}
      </span>
    </div>
  );
}
