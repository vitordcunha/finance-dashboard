import { formatBRL } from '@/core/money';
import type { MonthMetrics, UpcomingItem } from '@/core/month-metrics';
import { MetricTile } from '@/features/panel/components/MetricTile';
import { UpcomingList } from '@/features/panel/components/UpcomingList';

type Phase = 'past' | 'current' | 'future';

type Props = {
  metrics: MonthMetrics;
  phase: Phase;
  minimumCents: number;
  upcoming: UpcomingItem[];
  onSelectEvent?: (eventId: string) => void;
};

function dayLabel(iso: string): string {
  return `dia ${Number(iso.slice(8, 10))}`;
}

/**
 * O que ainda está marcado — compromissos que puxam o herói.
 */
export function CommitmentsSection({
  metrics: m,
  phase,
  minimumCents,
  upcoming,
  onSelectEvent,
}: Props) {
  const hasCushion = minimumCents > 0;
  const tiles: React.ReactNode[] = [];

  if (m.lowest) {
    const target = phase === 'past' ? m.lowest : (m.lowestAhead ?? m.lowest);
    tiles.push(
      <MetricTile
        key="lowest"
        label={
          phase === 'past' ? 'Menor saldo do mês' : 'Menor saldo com o agendado'
        }
        tone={target.belowMinimum ? 'danger' : 'default'}
        value={formatBRL(target.balanceCents)}
        hint={
          target.belowMinimum
            ? hasCushion
              ? `${dayLabel(target.date)} · abaixo do colchão de ${formatBRL(minimumCents)}`
              : `${dayLabel(target.date)} · no vermelho`
            : dayLabel(target.date)
        }
      />,
    );
  }

  // `Dias abaixo do colchão` saiu: a contagem assusta (17 num mês que fecha
  // positivo) e não sugere ação nenhuma. A faixa vermelha do gráfico mostra os
  // mesmos dias, com o formato e a duração visíveis, e o tile acima já dá o
  // primeiro dia do furo.

  if (phase !== 'past' && m.committedAheadCents > 0) {
    tiles.push(
      <MetricTile
        key="committed"
        label="Ainda vai sair"
        value={formatBRL(m.committedAheadCents)}
        hint="Contas e recorrências previstas"
      />,
    );
  }

  if (phase !== 'past' && m.incomingAheadCents > 0) {
    tiles.push(
      <MetricTile
        key="incoming"
        label="Ainda vai entrar"
        tone="accent"
        value={formatBRL(m.incomingAheadCents)}
        hint={
          m.nextIncome
            ? `Próxima: ${m.nextIncome.label}, ${dayLabel(m.nextIncome.date)}`
            : undefined
        }
      />,
    );
  }

  if (m.overdueCount > 0) {
    tiles.push(
      <MetricTile
        key="overdue"
        label={m.overdueCount === 1 ? 'Conta atrasada' : 'Contas atrasadas'}
        tone="danger"
        value={formatBRL(m.overdueCents)}
        hint={`${m.overdueCount} ${m.overdueCount === 1 ? 'previsto venceu' : 'previstos venceram'} sem confirmação`}
      />,
    );
  }

  if (tiles.length === 0 && upcoming.length === 0) return null;

  return (
    <section className="space-y-2">
      <p className="px-1 font-mono text-[10px] uppercase tracking-[0.1em] text-text-muted">
        O que ainda está marcado
      </p>
      {tiles.length > 0 ? (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">{tiles}</div>
      ) : null}
      {phase !== 'past' ? (
        <UpcomingList items={upcoming} onSelect={onSelectEvent} />
      ) : null}
    </section>
  );
}
