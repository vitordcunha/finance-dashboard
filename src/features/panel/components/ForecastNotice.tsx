import { AlertTriangle, Info } from 'lucide-react';
import {
  monthlyToDailyCents,
  type VariableForecast,
} from '@/core/forecast';
import { formatMonth } from '@/core/month';
import { formatBRL } from '@/core/money';
import { cn } from '@/lib/cn';

type Props = {
  forecast: VariableForecast | null;
  /** Mês de referência para diluir o estimado em /dia. */
  ym: string;
  /** Só o mês corrente e os futuros dependem da estimativa. */
  relevant: boolean;
  categoryNameById?: ReadonlyMap<string, string>;
};

function monthName(ym: string): string {
  return formatMonth(ym, 'MMMM');
}

/**
 * De onde vem — ou por que não vem — o gasto variável estimado.
 *
 * Sem base, o app antes simplesmente omitia o variável: os meses futuros
 * mostravam só aluguel e fatura e pareciam completos, quando faltava a maior
 * parte do gasto real. Estimativa ausente **em silêncio** é pior que
 * estimativa fraca — parece um número fechado.
 */
export function ForecastNotice({
  forecast,
  ym,
  relevant,
  categoryNameById,
}: Props) {
  if (!forecast || !relevant) return null;

  const usable = forecast.totalMonthlyCents > 0;
  const daily = monthlyToDailyCents(forecast.totalMonthlyCents, ym);
  const lowDaily = monthlyToDailyCents(forecast.lowCents, ym);
  const highDaily = monthlyToDailyCents(forecast.highCents, ym);
  const hasBand = forecast.highCents > forecast.lowCents;
  const topCategories = forecast.byCategory.slice(0, 3);

  if (usable) {
    return (
      <div className="space-y-1.5 px-1">
        <p className="flex items-start gap-2 text-[11px] leading-relaxed text-text-muted">
          <Info className="mt-px size-3.5 shrink-0" aria-hidden />
          <span>
            O <strong className="font-medium text-text">estimado</strong> de{' '}
            {formatBRL(forecast.totalMonthlyCents)}/mês
            {daily > 0 ? (
              <>
                {' '}
                (~{formatBRL(daily)}/dia)
              </>
            ) : null}{' '}
            é a mediana do que você gasta fora do que está cadastrado, apurada
            em {forecast.monthsUsed.length}{' '}
            {forecast.monthsUsed.length === 1 ? 'mês' : 'meses'}
            {/* Um mês aberto na base não é a mesma coisa que três fechados: dizer
                qual é muda a confiança que o número merece. */}
            {forecast.partialMonthUsed ? (
              <>
                , incluindo{' '}
                <strong className="font-medium text-text">
                  {monthName(forecast.partialMonthUsed)} em andamento
                </strong>
              </>
            ) : (
              ' fechados'
            )}
            {forecast.confidence === 'low'
              ? ' — base curta, trate como ordem de grandeza'
              : ''}
            . Entra diluído por dia, não num tranco: é assim que o gasto acontece.
            Cadastre o gasto e ele sai da estimativa.
          </span>
        </p>
        {hasBand ? (
          <p className="pl-[22px] text-[11px] leading-relaxed text-text-muted">
            Faixa nos meses usados:{' '}
            <span className="tabular-nums text-text">
              {formatBRL(forecast.lowCents)}–{formatBRL(forecast.highCents)}
            </span>
            /mês
            {lowDaily > 0 || highDaily > 0 ? (
              <>
                {' '}
                (
                <span className="tabular-nums text-text">
                  {formatBRL(lowDaily)}–{formatBRL(highDaily)}
                </span>
                /dia)
              </>
            ) : null}
            .
          </p>
        ) : null}
        {topCategories.length > 0 ? (
          <p className="pl-[22px] text-[11px] leading-relaxed text-text-muted">
            Por categoria:{' '}
            {topCategories.map((c, i) => {
              const name =
                c.categoryId == null
                  ? 'Sem categoria'
                  : (categoryNameById?.get(c.categoryId) ?? 'Categoria');
              return (
                <span key={c.categoryId ?? 'none'}>
                  {i > 0 ? ' · ' : null}
                  {name}{' '}
                  <span className="tabular-nums text-text">
                    {formatBRL(c.monthlyCents)}
                  </span>
                </span>
              );
            })}
            {forecast.byCategory.length > 3
              ? ` · +${forecast.byCategory.length - 3}`
              : null}
          </p>
        ) : null}
      </div>
    );
  }

  const semDados = forecast.monthsSkipped.filter((m) => m.reason === 'no_data');
  const parciais = forecast.monthsSkipped.filter(
    (m) => m.reason === 'low_coverage',
  );
  const cedo = forecast.monthsSkipped.find((m) => m.reason === 'too_early');

  return (
    <div className="flex items-start gap-2.5 rounded-xl border border-warning/30 bg-warning/[0.06] p-3">
      <AlertTriangle
        className="mt-0.5 size-4 shrink-0 text-warning"
        aria-hidden
      />
      <div className="min-w-0 space-y-1">
        <p className="text-[13px] font-medium text-text">
          Sem gasto variável estimado
        </p>
        <p className="text-[11px] leading-relaxed text-text-muted">
          Não há mês com histórico suficiente, então mercado, delivery,
          transporte e PIX miúdo <strong className="text-text">não entram</strong>{' '}
          nos meses à frente. O que você vê aqui é só o que está cadastrado —{' '}
          <strong className="text-text">está otimista</strong>.
        </p>
        {cedo ? (
          <p className="text-[11px] leading-relaxed text-text-muted">
            {monthName(cedo.ym)} tem só {Math.round(cedo.coverage * 31)} dias
            vividos. O mês em andamento entra na base a partir do dia 14 — antes
            disso, poucos dias escalados para mês cheio viram número selvagem.
          </p>
        ) : null}
        {parciais.length > 0 ? (
          <p className="text-[11px] leading-relaxed text-text-muted">
            {parciais
              .map(
                (m) =>
                  `${monthName(m.ym)} tem só ${Math.round(m.coverage * 100)}% do mês importado`,
              )
              .join('; ')}
            . Precisa de 80%.
          </p>
        ) : null}
        {semDados.length > 0 ? (
          <p className={cn('text-[11px] text-text-muted')}>
            Sem lançamento nenhum em {semDados.map((m) => monthName(m.ym)).join(', ')}.
          </p>
        ) : null}
        <p className="text-[11px] leading-relaxed text-text-muted">
          Some quando o primeiro mês inteiro fechar. Até lá, cadastrar os gastos
          recorrentes como previstos é o que aproxima a projeção.
        </p>
      </div>
    </div>
  );
}
