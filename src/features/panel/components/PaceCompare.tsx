import { formatBRL } from '@/core/money';
import type { MonthMetrics } from '@/core/month-metrics';
import { cn } from '@/lib/cn';

type Phase = 'past' | 'current' | 'future';

type Props = {
  metrics: MonthMetrics;
  phase: Phase;
  /** No herói não usa col-span do grid de métricas. */
  layout?: 'grid' | 'stack';
  /**
   * O estimado foi apurado em **outro** mês além deste.
   *
   * Sem isso o painel comparava julho com julho: o mês corrente entra na amostra
   * da mediana (é o que torna o estimado útil quando só há um mês de histórico), e
   * então "ritmo acima do estimado — mês mais caro que o habitual" era um veredito
   * sobre o próprio mês que definiu o habitual. O burn-up já se protegia disso; a
   * comparação por dia, não.
   */
  estimateIndependent?: boolean;
};

type PaceCell = {
  key: string;
  label: string;
  cents: number;
  hint: string;
  tone: 'default' | 'accent' | 'warning' | 'danger';
};

/**
 * Três leituras do mesmo dia: o que você vem gastando, o que o histórico
 * espera, e o que o caixa ainda aguenta. Uma grade de tiles soltos escondia
 * a comparação — aqui os três ficam lado a lado.
 *
 * As três células só são comparáveis porque todas falam de **variável**: o
 * ritmo ignora compromisso e fatura, o estimado é mediana do que não está
 * cadastrado, e o "cabe por dia" já nasce depois de descontar as contas. Quando
 * o ritmo somava aluguel, o veredito acusava excesso em todo mês.
 */
export function PaceCompare({
  metrics: m,
  phase,
  layout = 'grid',
  estimateIndependent = true,
}: Props) {
  const cells: PaceCell[] = [];

  if (phase === 'current' && m.dailyBurnCents > 0) {
    const overSafe =
      m.safeDailyCents != null && m.dailyBurnCents > m.safeDailyCents;
    const overEst =
      estimateIndependent &&
      m.estimatedDailyCents > 0 &&
      m.dailyBurnCents > m.estimatedDailyCents;
    cells.push({
      key: 'burn',
      label: 'Ritmo até hoje',
      cents: m.dailyBurnCents,
      hint: `${formatBRL(m.realizedVariableCents)} em ${m.elapsedDays} ${m.elapsedDays === 1 ? 'dia' : 'dias'}`,
      tone: overSafe ? 'warning' : overEst ? 'warning' : 'default',
    });
  }

  if (phase === 'past' && m.dailyBurnCents > 0) {
    cells.push({
      key: 'burn',
      label: 'Média do mês',
      cents: m.dailyBurnCents,
      hint: `${formatBRL(m.realizedVariableCents)} em ${m.elapsedDays} dias`,
      tone: 'default',
    });
  }

  if (phase !== 'past' && m.estimatedDailyCents > 0) {
    cells.push({
      key: 'estimated',
      label: phase === 'current' ? 'Estimado à frente' : 'Estimado / dia',
      cents: m.estimatedDailyCents,
      hint:
        phase === 'current'
          ? estimateIndependent
            ? `Variável nos ${m.daysAhead} dias que faltam`
            : `Nos ${m.daysAhead} dias que faltam · apurado neste mês`
          : 'Mediana histórica diluída no mês',
      tone: 'default',
    });
  }

  if (phase !== 'past' && m.safeDailyCents != null && m.safeDailyCents > 0) {
    cells.push({
      key: 'safe',
      label: 'Cabe por dia',
      cents: m.safeDailyCents,
      hint: `${m.daysLeft} ${m.daysLeft === 1 ? 'dia' : 'dias'} sem furar o colchão`,
      tone: 'accent',
    });
  }

  // No stack (herói) um único número ainda vale a pena; no grid antigo, não.
  if (cells.length === 0) return null;
  if (layout === 'grid' && cells.length < 2) return null;

  const verdict = paceVerdict(m, phase, estimateIndependent);

  return (
    <div
      className={cn(
        'rounded-xl border border-border bg-surface p-3',
        layout === 'grid' && 'col-span-2 sm:col-span-3',
      )}
    >
      <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-text-muted">
        Por dia · só o variável
      </p>
      <div
        className={cn(
          'mt-2 grid gap-3',
          cells.length === 1
            ? 'grid-cols-1'
            : cells.length === 2
              ? 'grid-cols-2'
              : 'grid-cols-3',
        )}
      >
        {cells.map((cell) => (
          <div key={cell.key} className="min-w-0">
            <p className="text-[11px] text-text-muted">{cell.label}</p>
            <p
              className={cn(
                'mt-0.5 font-display text-base font-medium tracking-tight tabular-nums',
                cell.tone === 'warning'
                  ? 'text-warning'
                  : cell.tone === 'accent'
                    ? 'text-accent'
                    : cell.tone === 'danger'
                      ? 'text-danger'
                      : 'text-text',
              )}
            >
              {formatBRL(cell.cents)}
              <span className="text-[11px] font-sans font-normal text-text-muted">
                /dia
              </span>
            </p>
            <p className="mt-0.5 text-[10px] leading-snug text-text-muted">
              {cell.hint}
            </p>
          </div>
        ))}
      </div>
      {verdict || m.realizedCommittedCents > 0 ? (
        <div className="mt-2.5 space-y-1 border-t border-border/70 pt-2">
          {verdict ? (
            <p
              className={cn(
                'text-[11px] leading-snug',
                verdict.tone === 'warning'
                  ? 'text-warning'
                  : verdict.tone === 'accent'
                    ? 'text-accent'
                    : 'text-text-muted',
              )}
            >
              {verdict.text}
            </p>
          ) : null}
          {m.realizedCommittedCents > 0 ? (
            <p className="text-[10px] leading-snug text-text-muted">
              Fora do ritmo: {formatBRL(m.realizedCommittedCents)} de
              compromisso já pago no mês — recorrências, contas essenciais e
              fatura. Não se decide por dia, então não vira média diária.
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function paceVerdict(
  m: MonthMetrics,
  phase: Phase,
  estimateIndependent: boolean,
): { text: string; tone: 'default' | 'accent' | 'warning' } | null {
  if (phase !== 'current') return null;

  const burn = m.dailyBurnCents;
  const safe = m.safeDailyCents;
  // Sem mês independente, comparar ritmo com estimado é comparar o mês com ele
  // mesmo: o que sobra de honesto é a régua do caixa (`cabe por dia`).
  const est = estimateIndependent ? m.estimatedDailyCents : 0;

  if (burn <= 0) return null;

  if (
    est > 0 &&
    m.headroomBurnDays != null &&
    m.paceGapCents != null &&
    m.paceGapCents > 0
  ) {
    return {
      tone: 'warning',
      text: `Ritmo ${formatBRL(m.paceGapCents)}/dia acima do estimado — a folga de compromissos aguenta ~${m.headroomBurnDays} ${m.headroomBurnDays === 1 ? 'dia' : 'dias'} se mantiver.`,
    };
  }

  if (safe != null && burn > safe) {
    return {
      tone: 'warning',
      text: `Ritmo acima do que cabe — se mantiver, o colchão aperta antes do fim do mês.`,
    };
  }

  if (est > 0 && burn > est) {
    return {
      tone: 'warning',
      text: `Ritmo acima do estimado histórico (${formatBRL(est)}/dia). Mês mais caro que o habitual.`,
    };
  }

  if (est > 0 && burn <= est) {
    return {
      tone: 'accent',
      text: `No ritmo do estimado. A folga acima é só compromisso — o estimado é alerta à parte.`,
    };
  }

  if (safe != null && burn <= safe) {
    return {
      tone: 'default',
      text: `Dentro do que cabe nos ${m.daysLeft} dias que faltam.`,
    };
  }

  if (!estimateIndependent && m.estimatedDailyCents > 0) {
    return {
      tone: 'default',
      text: `Sem mês fechado para comparar: o estimado saiu deste mesmo mês, então "acima do habitual" não teria sentido. A régua aqui é o caixa.`,
    };
  }

  return null;
}
