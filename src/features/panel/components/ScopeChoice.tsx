import { Button } from '@/components/ui/Button';
import type { SeriesEditScope } from '@/types/models';

type Props = {
  busy?: boolean;
  destructive?: boolean;
  onChoose: (scope: SeriesEditScope) => void;
  onCancel: () => void;
};

/**
 * Alcance de uma mudança em série.
 *
 * "Só este mês" grava uma exceção; "daqui pra frente" encerra a série atual e
 * abre outra. O passado nunca é reescrito — mês fechado é história.
 */
export function ScopeChoice({ busy, destructive, onChoose, onCancel }: Props) {
  return (
    <div className="space-y-3">
      <p className="text-[13px] leading-relaxed text-text-muted">
        Este lançamento se repete todo mês.{' '}
        {destructive
          ? 'O que você quer remover?'
          : 'Onde a mudança deve valer?'}
      </p>

      <Button
        className="w-full"
        variant={destructive ? 'secondary' : 'primary'}
        disabled={busy}
        onClick={() => onChoose('one')}
      >
        Só este mês
      </Button>

      <Button
        className="w-full"
        variant={destructive ? 'secondary' : 'secondary'}
        disabled={busy}
        onClick={() => onChoose('forward')}
      >
        Deste mês em diante
      </Button>

      <p className="text-[11px] leading-snug text-text-muted">
        Os meses já passados ficam como estão — mês fechado é história.
      </p>

      <Button
        variant="ghost"
        className="w-full"
        disabled={busy}
        onClick={onCancel}
      >
        Voltar
      </Button>
    </div>
  );
}
