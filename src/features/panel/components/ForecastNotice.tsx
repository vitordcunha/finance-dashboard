import { AlertTriangle, Info } from 'lucide-react';
import {
  monthlyToDailyCents,
  type ApplicableForecast,
  type VariableForecast,
} from '@/core/forecast';
import { formatMonth } from '@/core/month';
import { formatBRL } from '@/core/money';
import { cn } from '@/lib/cn';

type Props = {
  forecast: VariableForecast | null;
  /**
   * O recorte que vale para **este** mês: a mediana menos as categorias que ele
   * já tem cadastradas. Sem isso a nota anunciava um total que não era o que a
   * projeção do mês usava.
   */
  applicable: ApplicableForecast | null;
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
  applicable,
  ym,
  relevant,
  categoryNameById,
}: Props) {
  if (!forecast || !relevant) return null;

  const monthlyCents = applicable?.monthlyCents ?? forecast.totalMonthlyCents;
  const lowCents = applicable?.lowCents ?? forecast.lowCents;
  const highCents = applicable?.highCents ?? forecast.highCents;
  const categories = applicable?.byCategory ?? forecast.byCategory;
  const covered = applicable?.coveredCategoryIds ?? [];

  const usable = monthlyCents > 0;
  const daily = monthlyToDailyCents(monthlyCents, ym);
  const lowDaily = monthlyToDailyCents(lowCents, ym);
  const highDaily = monthlyToDailyCents(highCents, ym);
  const hasBand = highCents > lowCents;
  const topCategories = categories.slice(0, 3);
  const coveredNames = covered.map(
    (id) => categoryNameById?.get(id) ?? 'categoria',
  );

  if (usable) {
    return (
      <div className="space-y-1.5 px-1">
        <p className="flex items-start gap-2 text-[11px] leading-relaxed text-text-muted">
          <Info className="mt-px size-3.5 shrink-0" aria-hidden />
          <span>
            O <strong className="font-medium text-text">estimado</strong> de{' '}
            {formatBRL(monthlyCents)}/mês
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
        {coveredNames.length > 0 ? (
          <p className="pl-[22px] text-[11px] leading-relaxed text-text-muted">
            Fora da conta neste mês:{' '}
            <span className="text-text">{coveredNames.join(', ')}</span> — já
            {coveredNames.length === 1 ? ' tem' : ' têm'} previsto cadastrado em{' '}
            {monthName(ym)}, e somar a mediana contaria duas vezes. Em meses sem o
            previsto, {coveredNames.length === 1 ? 'ela volta' : 'elas voltam'}.
          </p>
        ) : null}
        {hasBand ? (
          <p className="pl-[22px] text-[11px] leading-relaxed text-text-muted">
            Faixa nos meses usados:{' '}
            <span className="tabular-nums text-text">
              {formatBRL(lowCents)}–{formatBRL(highCents)}
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
            {categories.length > 3 ? ` · +${categories.length - 3}` : null}
          </p>
        ) : null}
      </div>
    );
  }

  // Estimado zerado **porque o plano cobre tudo** não é falta de base: é o caso
  // bom. Cair no aviso de "sem histórico" aqui assustaria sem motivo.
  if (forecast.totalMonthlyCents > 0) {
    return (
      <p className="flex items-start gap-2 px-1 text-[11px] leading-relaxed text-text-muted">
        <Info className="mt-px size-3.5 shrink-0" aria-hidden />
        <span>
          Nada a estimar em {monthName(ym)}: todas as categorias que o histórico
          preveria já têm previsto cadastrado
          {coveredNames.length > 0 ? ` (${coveredNames.join(', ')})` : ''}. A
          projeção do mês é o que está lançado.
        </span>
      </p>
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
