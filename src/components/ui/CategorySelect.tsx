import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown, Search, Tag } from 'lucide-react';
import { cn } from '@/lib/cn';

export type CategorySelectOption = {
  id: string;
  name: string;
  essential?: boolean;
  color?: string | null;
};

type Props = {
  value: string | null;
  onChange: (categoryId: string | null) => void;
  categories: ReadonlyArray<CategorySelectOption>;
  /** Rótulo acima do trigger (modo field). */
  label?: string;
  /** Texto quando nada está selecionado. */
  placeholder?: string;
  /** Permite limpar / escolher “sem categoria”. Default true. */
  allowEmpty?: boolean;
  /** Rótulo da opção vazia. Default “Sem categoria”. */
  emptyLabel?: string;
  disabled?: boolean;
  /**
   * `field` — formulário com label (captura, import).
   * `inline` — trigger compacto em lista (categorizar em lote).
   */
  variant?: 'field' | 'inline';
  className?: string;
  id?: string;
  /** Nome acessível do trigger quando não há label visível. */
  'aria-label'?: string;
};

type PanelPos = {
  left: number;
  width: number;
  maxHeight: number;
  top?: number;
  bottom?: number;
};

const SEARCH_THRESHOLD = 6;

/**
 * Seletor de categoria próprio — busca, teclado e painel portaled.
 *
 * O `<select>` nativo quebra o tom do app (menu do SO), não filtra e no mobile
 * esconde contexto. Aqui a lista sobe/desce conforme o espaço (sheet embaixo),
 * marca essencial e cor, e fecha com Escape / fora.
 */
export function CategorySelect({
  value,
  onChange,
  categories,
  label,
  placeholder = 'Sem categoria',
  allowEmpty = true,
  emptyLabel = 'Sem categoria',
  disabled = false,
  variant = 'field',
  className,
  id: idProp,
  'aria-label': ariaLabel,
}: Props) {
  const reactId = useId();
  const listboxId = `${reactId}-listbox`;
  const inputId = idProp ?? `${reactId}-trigger`;

  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const [pos, setPos] = useState<PanelPos | null>(null);

  const selected = useMemo(
    () => categories.find((c) => c.id === value) ?? null,
    [categories, value],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [...categories];
    return categories.filter((c) => c.name.toLowerCase().includes(q));
  }, [categories, query]);

  const rows = useMemo(() => {
    const list: Array<
      | { type: 'empty'; label: string }
      | { type: 'category'; option: CategorySelectOption }
    > = [];
    if (allowEmpty && !query.trim()) {
      list.push({ type: 'empty', label: emptyLabel });
    }
    for (const option of filtered) {
      list.push({ type: 'category', option });
    }
    return list;
  }, [allowEmpty, emptyLabel, filtered, query]);

  const showSearch = categories.length >= SEARCH_THRESHOLD;

  const updatePosition = useCallback(() => {
    const el = triggerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const gap = 6;
    const ideal = 300;
    const minWidth = variant === 'inline' ? Math.max(rect.width, 240) : rect.width;
    const width = Math.min(Math.max(minWidth, rect.width), window.innerWidth - 16);
    const left = Math.min(
      Math.max(8, rect.left),
      window.innerWidth - width - 8,
    );
    const spaceBelow = window.innerHeight - rect.bottom - gap - 8;
    const spaceAbove = rect.top - gap - 8;
    const openUp = spaceBelow < 200 && spaceAbove > spaceBelow;
    const maxHeight = Math.min(ideal, openUp ? spaceAbove : spaceBelow);

    setPos({
      left,
      width,
      maxHeight: Math.max(140, maxHeight),
      ...(openUp
        ? { bottom: window.innerHeight - rect.top + gap }
        : { top: rect.bottom + gap }),
    });
  }, [variant]);

  useLayoutEffect(() => {
    if (!open) return;
    updatePosition();
    const onScroll = () => updatePosition();
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', onScroll, true);
    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', onScroll, true);
    };
  }, [open, updatePosition, rows.length]);

  useEffect(() => {
    if (!open) return;
    setQuery('');
    const selectedIdx = rows.findIndex((r) =>
      r.type === 'empty' ? value == null : r.option.id === value,
    );
    setActiveIndex(selectedIdx >= 0 ? selectedIdx : 0);
    const t = window.setTimeout(() => {
      if (showSearch) searchRef.current?.focus();
      else panelRef.current?.focus();
    }, 0);
    return () => window.clearTimeout(t);
    // Só ao abrir — não resetar activeIndex a cada filtro.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: MouseEvent) => {
      const t = e.target as Node;
      if (triggerRef.current?.contains(t)) return;
      if (panelRef.current?.contains(t)) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', onPointer);
    return () => document.removeEventListener('mousedown', onPointer);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    setActiveIndex((i) => Math.min(i, Math.max(0, rows.length - 1)));
  }, [open, rows.length]);

  function close() {
    setOpen(false);
    setQuery('');
    triggerRef.current?.focus();
  }

  function pick(next: string | null) {
    onChange(next);
    close();
  }

  function moveActive(delta: number) {
    if (rows.length === 0) return;
    setActiveIndex((i) => (i + delta + rows.length) % rows.length);
  }

  function activateCurrent() {
    const row = rows[activeIndex];
    if (!row) return;
    if (row.type === 'empty') pick(null);
    else pick(row.option.id);
  }

  function onTriggerKeyDown(e: KeyboardEvent<HTMLButtonElement>) {
    if (disabled) return;
    if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      setOpen(true);
    }
  }

  function onPanelKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key === 'Escape') {
      e.preventDefault();
      close();
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      moveActive(1);
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      moveActive(-1);
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      activateCurrent();
      return;
    }
    if (e.key === 'Home') {
      e.preventDefault();
      setActiveIndex(0);
      return;
    }
    if (e.key === 'End') {
      e.preventDefault();
      setActiveIndex(Math.max(0, rows.length - 1));
    }
  }

  const triggerLabel = selected?.name ?? placeholder;
  const isEmpty = !selected;

  const trigger = (
    <button
      ref={triggerRef}
      type="button"
      id={inputId}
      disabled={disabled}
      aria-label={ariaLabel ?? label}
      aria-haspopup="listbox"
      aria-expanded={open}
      aria-controls={open ? listboxId : undefined}
      onClick={() => {
        if (disabled) return;
        setOpen((v) => !v);
      }}
      onKeyDown={onTriggerKeyDown}
      className={cn(
        'group flex w-full items-center gap-2 border text-left outline-none transition-colors',
        'disabled:pointer-events-none disabled:opacity-50',
        variant === 'field' &&
          'min-h-10 rounded-md border-border bg-bg px-3 text-sm hover:border-border-strong focus-visible:border-accent',
        variant === 'inline' &&
          'min-h-9 rounded-md border-border bg-surface px-2.5 text-[12px] hover:border-border-strong focus-visible:border-accent',
        open && 'border-accent',
        className,
      )}
    >
      {selected?.color ? (
        <span
          className="size-2 shrink-0 rounded-full"
          style={{ backgroundColor: selected.color }}
          aria-hidden
        />
      ) : (
        <Tag
          className={cn(
            'shrink-0 text-text-muted transition-colors group-hover:text-text',
            variant === 'field' ? 'size-3.5' : 'size-3',
          )}
          aria-hidden
        />
      )}
      <span
        className={cn(
          'min-w-0 flex-1 truncate',
          isEmpty ? 'text-text-muted' : 'text-text',
        )}
      >
        {triggerLabel}
      </span>
      {selected?.essential ? (
        <span className="shrink-0 text-[10px] uppercase tracking-wide text-text-muted">
          essencial
        </span>
      ) : null}
      <ChevronDown
        className={cn(
          'size-3.5 shrink-0 text-text-muted transition-transform',
          open && 'rotate-180',
        )}
        aria-hidden
      />
    </button>
  );

  const panelStyle: CSSProperties | undefined = pos
    ? {
        position: 'fixed',
        left: pos.left,
        width: pos.width,
        maxHeight: pos.maxHeight,
        top: pos.top,
        bottom: pos.bottom,
        zIndex: 70,
      }
    : undefined;

  const panel =
    open && pos
      ? createPortal(
          <div
            ref={panelRef}
            role="presentation"
            tabIndex={-1}
            style={panelStyle}
            onKeyDown={onPanelKeyDown}
            className={cn(
              'flex flex-col overflow-hidden rounded-lg border border-border-strong outline-none',
              'bg-surface-elevated shadow-[0_12px_40px_rgb(0_0_0_/0.45)]',
              'animate-fade-in',
            )}
          >
            {showSearch ? (
              <div className="shrink-0 border-b border-border px-2.5 py-2">
                <label className="flex items-center gap-2 rounded-md bg-bg px-2.5 py-1.5">
                  <Search className="size-3.5 shrink-0 text-text-muted" aria-hidden />
                  <input
                    ref={searchRef}
                    type="text"
                    value={query}
                    onChange={(e) => {
                      setQuery(e.target.value);
                      setActiveIndex(0);
                    }}
                    placeholder="Buscar categoria…"
                    className="min-w-0 flex-1 bg-transparent text-sm text-text outline-none placeholder:text-text-muted/70"
                    aria-autocomplete="list"
                    aria-controls={listboxId}
                  />
                </label>
              </div>
            ) : null}

            <ul
              id={listboxId}
              role="listbox"
              aria-label={label ?? 'Categoria'}
              className="min-h-0 flex-1 overflow-y-auto overscroll-contain py-1"
            >
              {rows.length === 0 ? (
                <li className="px-3 py-4 text-center text-[12px] text-text-muted">
                  Nenhuma categoria com “{query.trim()}”
                </li>
              ) : (
                rows.map((row, index) => {
                  const active = index === activeIndex;
                  if (row.type === 'empty') {
                    const isSelected = value == null;
                    return (
                      <li key="__empty__" role="presentation">
                        <OptionButton
                          active={active}
                          selected={isSelected}
                          onHover={() => setActiveIndex(index)}
                          onPick={() => pick(null)}
                        >
                          <span className="text-text-muted">{row.label}</span>
                        </OptionButton>
                      </li>
                    );
                  }

                  const { option } = row;
                  const isSelected = option.id === value;
                  return (
                    <li key={option.id} role="presentation">
                      <OptionButton
                        active={active}
                        selected={isSelected}
                        onHover={() => setActiveIndex(index)}
                        onPick={() => pick(option.id)}
                      >
                        {option.color ? (
                          <span
                            className="size-2 shrink-0 rounded-full"
                            style={{ backgroundColor: option.color }}
                            aria-hidden
                          />
                        ) : (
                          <span
                            className="size-2 shrink-0 rounded-full bg-border-strong"
                            aria-hidden
                          />
                        )}
                        <span className="min-w-0 flex-1 truncate text-text">
                          {option.name}
                        </span>
                        {option.essential ? (
                          <span className="shrink-0 text-[10px] uppercase tracking-wide text-text-muted">
                            essencial
                          </span>
                        ) : null}
                      </OptionButton>
                    </li>
                  );
                })
              )}
            </ul>
          </div>,
          document.body,
        )
      : null;

  if (variant === 'inline') {
    return (
      <>
        {trigger}
        {panel}
      </>
    );
  }

  return (
    <div className="block space-y-1.5 text-sm">
      {label ? (
        <label htmlFor={inputId} className="font-medium text-text-muted">
          {label}
        </label>
      ) : null}
      {trigger}
      {panel}
    </div>
  );
}

function OptionButton({
  children,
  active,
  selected,
  onHover,
  onPick,
}: {
  children: ReactNode;
  active: boolean;
  selected: boolean;
  onHover: () => void;
  onPick: () => void;
}) {
  const ref = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (active) {
      ref.current?.scrollIntoView({ block: 'nearest' });
    }
  }, [active]);

  return (
    <button
      ref={ref}
      type="button"
      role="option"
      aria-selected={selected}
      tabIndex={-1}
      onMouseEnter={onHover}
      onClick={onPick}
      className={cn(
        'flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm transition-colors',
        active && 'bg-surface-hover',
        selected && !active && 'bg-accent-muted/40',
      )}
    >
      <span className="flex min-w-0 flex-1 items-center gap-2.5">{children}</span>
      <Check
        className={cn(
          'size-3.5 shrink-0 text-accent transition-opacity',
          selected ? 'opacity-100' : 'opacity-0',
        )}
        aria-hidden
      />
    </button>
  );
}
