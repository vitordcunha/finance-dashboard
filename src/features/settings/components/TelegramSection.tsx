import { useState } from 'react';
import { Check, Copy, MessageCircle, Unplug } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { Panel } from '@/components/ui/Panel';
import { Skeleton } from '@/components/ui/Skeleton';
import { useAuth } from '@/features/auth/hooks/useAuth';
import {
  useAccounts,
  usePeopleQuery,
} from '@/features/capture/hooks/useCaptureLookups';
import {
  useCreateTelegramLinkCode,
  useRevokeTelegramLink,
  useTelegramLink,
  useUpdateTelegramLinkDefaults,
} from '@/features/settings/hooks/useTelegram';
import { getTelegramBotUsername } from '@/data/telegram';
import { cn } from '@/lib/cn';

export function TelegramSection() {
  const { user } = useAuth();
  const { data: link, isLoading, isError, refetch } = useTelegramLink();
  const { data: people = [] } = usePeopleQuery();
  const { data: accounts = [] } = useAccounts();
  const createCode = useCreateTelegramLinkCode();
  const revoke = useRevokeTelegramLink();
  const updateDefaults = useUpdateTelegramLinkDefaults();

  const [code, setCode] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const botUser = getTelegramBotUsername();
  const mePerson =
    people.find((p) => p.user_id === user?.id) ?? people[0] ?? null;

  async function handleGenerate() {
    try {
      const row = await createCode.mutateAsync({
        personId: mePerson?.id ?? null,
      });
      setCode(row.code);
      setExpiresAt(row.expires_at);
      setCopied(false);
    } catch (err) {
      const msg =
        err && typeof err === 'object' && 'message' in err
          ? String((err as { message: unknown }).message)
          : err instanceof Error
            ? err.message
            : 'Não deu para gerar o código.';
      toast.error(msg);
    }
  }

  async function handleCopy() {
    if (!code) return;
    const deep = botUser
      ? `https://t.me/${botUser}?start=${code}`
      : `/start ${code}`;
    try {
      await navigator.clipboard.writeText(deep);
      setCopied(true);
      toast.success('Link copiado');
    } catch {
      toast.error('Não deu para copiar');
    }
  }

  async function handleRevoke() {
    if (!link) return;
    try {
      await revoke.mutateAsync(link.id);
      setCode(null);
      toast.success('Telegram desvinculado');
    } catch {
      toast.error('Não deu para desvincular');
    }
  }

  return (
    <section className="space-y-3" aria-labelledby="settings-telegram">
      <h2
        id="settings-telegram"
        className="text-xs font-medium uppercase tracking-wide text-text-muted"
      >
        Telegram
      </h2>

      {isLoading ? <Skeleton className="h-28 w-full rounded-xl" /> : null}

      {isError ? (
        <EmptyState
          icon={MessageCircle}
          title="Não deu para carregar o vínculo"
          description="Tente de novo em instantes."
          action={
            <Button variant="secondary" size="sm" onClick={() => void refetch()}>
              Tentar de novo
            </Button>
          }
        />
      ) : null}

      {!isLoading && !isError && link ? (
        <Panel className="space-y-4 p-4">
          <div className="flex items-start gap-3">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-border bg-accent-muted text-accent">
              <MessageCircle className="size-4" strokeWidth={1.75} aria-hidden />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-text">Vinculado</p>
              <p className="mt-0.5 font-mono text-xs text-text-muted">
                id {link.telegram_user_id}
                {link.linked_at
                  ? ` · desde ${new Date(link.linked_at).toLocaleDateString('pt-BR')}`
                  : null}
              </p>
            </div>
            <Button
              size="sm"
              variant="secondary"
              className="gap-1.5"
              disabled={revoke.isPending}
              onClick={() => void handleRevoke()}
            >
              <Unplug className="size-3.5" aria-hidden />
              Desvincular
            </Button>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block space-y-1.5">
              <span className="text-xs text-text-muted">Quem (padrão)</span>
              <select
                className={cn(
                  'w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm text-text',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40',
                )}
                value={link.person_id ?? ''}
                disabled={updateDefaults.isPending}
                onChange={(e) => {
                  const v = e.target.value;
                  void updateDefaults
                    .mutateAsync({
                      linkId: link.id,
                      personId: v === '' ? null : v,
                    })
                    .then(() => toast.success('Padrão atualizado'))
                    .catch(() => toast.error('Não salvou'));
                }}
              >
                <option value="">Casa</option>
                {people.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.short_name || p.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="block space-y-1.5">
              <span className="text-xs text-text-muted">Conta (padrão)</span>
              <select
                className={cn(
                  'w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm text-text',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40',
                )}
                value={link.default_account_id ?? ''}
                disabled={updateDefaults.isPending}
                onChange={(e) => {
                  const v = e.target.value;
                  void updateDefaults
                    .mutateAsync({
                      linkId: link.id,
                      defaultAccountId: v === '' ? null : v,
                    })
                    .then(() => toast.success('Conta padrão atualizada'))
                    .catch(() => toast.error('Não salvou'));
                }}
              >
                <option value="">Primeira conta</option>
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </Panel>
      ) : null}

      {!isLoading && !isError && !link ? (
        <Panel className="space-y-4 p-4">
          <p className="text-sm text-text-muted">
            Lance gastos pelo Telegram (texto ou foto de cupom). Gere um código e
            envie <code className="font-mono text-xs">/start CODIGO</code> no
            bot.
          </p>

          {code ? (
            <div className="space-y-3 rounded-lg border border-border bg-bg px-4 py-3">
              <p className="font-mono text-2xl tracking-widest text-accent">
                {code}
              </p>
              {expiresAt ? (
                <p className="text-xs text-text-muted">
                  Válido até{' '}
                  {new Date(expiresAt).toLocaleTimeString('pt-BR', {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </p>
              ) : null}
              {botUser ? (
                <p className="text-xs text-text-muted">
                  Abra{' '}
                  <a
                    className="text-accent underline-offset-2 hover:underline"
                    href={`https://t.me/${botUser}?start=${code}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    t.me/{botUser}
                  </a>{' '}
                  ou copie o link.
                </p>
              ) : (
                <p className="text-xs text-text-muted">
                  No bot, envie: /start {code}
                  <br />
                  (Defina VITE_TELEGRAM_BOT_USERNAME para o link direto.)
                </p>
              )}
              <Button
                size="sm"
                variant="secondary"
                className="gap-1.5"
                onClick={() => void handleCopy()}
              >
                {copied ? (
                  <Check className="size-3.5" aria-hidden />
                ) : (
                  <Copy className="size-3.5" aria-hidden />
                )}
                Copiar link
              </Button>
            </div>
          ) : null}

          <Button
            size="sm"
            disabled={createCode.isPending}
            onClick={() => void handleGenerate()}
          >
            {createCode.isPending ? 'Gerando…' : 'Gerar código'}
          </Button>
        </Panel>
      ) : null}
    </section>
  );
}
