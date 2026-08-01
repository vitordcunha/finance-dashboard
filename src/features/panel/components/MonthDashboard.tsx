import { MoneyText } from '@/components/money/MoneyText';
import type { TimelineMonth } from '@/core/timeline';
import { cn } from '@/lib/cn';

type Props = {
  month: TimelineMonth;
  isCurrent: boolean;
  isFuture: boolean;
};

/**
 * Onde o mês começa e onde termina — em **uma linha**, embaixo da curva.
 *
 * Isto era um card com dois números grandes e uma régua no meio, logo abaixo do
 * gráfico que já desenha exatamente esses dois pontos: abriu é o começo da curva,
 * fecha é o fim dela. O card repetia em corpo grande o que a linha ao lado já
 * mostrava, e o "sobrou R$ 3.592" era a terceira aparição do mesmo número na mesma
 * tela (rodapé do herói, fita de meses, aqui).
 *
 * Sobrou como legenda do gráfico: os números exatos que o desenho não dá.
 *
 * Abriu e fecha são **saldo**, não fluxo — a distinção que fazia o painel parecer
 * contraditório quando "sobra −2.990" e "5.104" estavam ambos certos com nome
 * enganoso.
 */
export function MonthDashboard({ month, isCurrent, isFuture }: Props) {
  const negative = month.netCents < 0;
  const estimateGap =
    month.estimatedOutCents > 0
      ? month.closingCents - month.closingWithEstimateCents
      : 0;

  return (
    <p className="px-1 text-[11px] leading-relaxed text-text-muted">
      Abriu com{' '}
      <MoneyText cents={month.openingCents} className="text-[11px] text-text" />{' '}
      ·{' '}
      <span className={cn(negative ? 'text-danger' : 'text-accent')}>
        {negative ? 'queimou' : 'sobrou'}{' '}
        {formatShort(Math.abs(month.netCents))}
      </span>{' '}
      · {isFuture || isCurrent ? 'fecha' : 'fechou'} com{' '}
      <MoneyText
        cents={month.closingCents}
        tone={month.closingCents < 0 ? 'danger' : 'default'}
        className="text-[11px] font-medium"
      />
      {estimateGap > 0 ? (
        <>
          {' '}
          — mantendo o ritmo,{' '}
          <MoneyText
            cents={month.closingWithEstimateCents}
            className="text-[11px] text-text"
          />
        </>
      ) : null}
      .
    </p>
  );
}

function formatShort(cents: number): string {
  return (cents / 100).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    maximumFractionDigits: 0,
  });
}
