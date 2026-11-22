'use client';

// Multi-select combobox with chips. Options come from an async fetcher: the fetch runs through
// `useQuery`, keyed by the debounced search term, so the same term is cached and shared.
// With `allowCreate`, free text becomes a new value (Enter or ",").

import { useQuery } from '@tanstack/react-query';
import { Loader2, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useId, useRef, useState, type ChangeEvent, type FocusEvent, type KeyboardEvent } from 'react';

import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { cn } from '@/lib/utils';

const SEARCH_DEBOUNCE_MS = 250;

type Option = { value: string; isCreate: boolean };

type Props = {
  value: string[];
  onChange: (value: string[]) => void;
  /** Base of the query key. The debounced search term is added to it. */
  queryKey: readonly unknown[];
  fetchOptions: (search: string) => Promise<string[]>;
  /** Turns raw text or an option into the stored value. Default: trim only. */
  normalize?: (raw: string) => string;
  allowCreate?: boolean;
  maxItems?: number;
  /** Max length of the text the user types. */
  maxLength?: number;
  /** Off in a popover that focuses its first field by itself: the list would open on its own. */
  openOnFocus?: boolean;
  placeholder?: string;
  id?: string;
  'aria-label'?: string;
  className?: string;
};

const trimValue = (raw: string): string => raw.trim();

export function Autocomplete({
  value,
  onChange,
  queryKey,
  fetchOptions,
  normalize = trimValue,
  allowCreate = false,
  maxItems = Infinity,
  maxLength,
  openOnFocus = true,
  placeholder,
  id,
  'aria-label': ariaLabel,
  className,
}: Props) {
  const t = useTranslations();
  const listId = useId();
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [input, setInput] = useState('');
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);

  const isFull = value.length >= maxItems;
  const search = normalize(input);
  const debouncedSearch = useDebouncedValue(search, SEARCH_DEBOUNCE_MS);

  const { data: fetched = [], isFetching } = useQuery({
    queryKey: [...queryKey, debouncedSearch],
    queryFn: () => fetchOptions(debouncedSearch),
    enabled: open && !isFull,
    // Keep the last list while the next term loads, so the list does not flash empty.
    placeholderData: previous => previous,
  });

  const options = buildOptions({ fetched, value, search, normalize, allowCreate });
  const isListVisible = open && !isFull;
  const showSpinner = isFetching && options.length === 0;
  const activeId = isListVisible && activeIndex >= 0 ? `${listId}-${activeIndex}` : undefined;

  function addValues(raw: string[]) {
    const next = raw.map(normalize).filter(item => item && !value.includes(item));
    const unique = [...new Set(next)].slice(0, maxItems - value.length);
    if (unique.length > 0) onChange([...value, ...unique]);
    setInput('');
    setActiveIndex(-1);
  }

  function removeValue(item: string) {
    onChange(value.filter(existing => existing !== item));
  }

  function handleInputChange(e: ChangeEvent<HTMLInputElement>) {
    const text = e.target.value;
    setOpen(true);
    setActiveIndex(-1);
    if (!allowCreate || !text.includes(',')) {
      setInput(text);
      return;
    }
    // A comma commits everything before it; this also covers pasted lists ("a,b,c").
    const parts = text.split(',');
    addValues(parts.slice(0, -1));
    setInput(parts[parts.length - 1]);
  }

  function handleEnter() {
    const active = options[activeIndex];
    if (active) return addValues([active.value]);
    if (allowCreate) return addValues([input]);
    // Without create, Enter takes the first match: there is no free text to commit.
    if (options[0]) addValues([options[0].value]);
  }

  const keyActions: Record<string, (e: KeyboardEvent<HTMLInputElement>) => void> = {
    ArrowDown: e => {
      e.preventDefault();
      if (!open) return setOpen(true);
      setActiveIndex(index => (options.length === 0 ? -1 : (index + 1) % options.length));
    },
    ArrowUp: e => {
      e.preventDefault();
      if (!open) return setOpen(true);
      setActiveIndex(index => (options.length === 0 ? -1 : (index <= 0 ? options.length : index) - 1));
    },
    Enter: e => {
      // Keeps a surrounding form from submitting while the user picks a value.
      e.preventDefault();
      handleEnter();
    },
    Escape: e => {
      if (!open) return;
      // The list is the innermost thing that closes: a dialog or popover around it stays open.
      e.stopPropagation();
      setOpen(false);
      setActiveIndex(-1);
    },
    Backspace: () => {
      if (input === '' && value.length > 0) onChange(value.slice(0, -1));
    },
  };

  function handleBlur(e: FocusEvent) {
    if (containerRef.current?.contains(e.relatedTarget)) return;
    // Typed text that is not committed would be lost silently when the user clicks Save.
    if (allowCreate && input.trim()) addValues([input]);
    setInput('');
    setOpen(false);
    setActiveIndex(-1);
  }

  return (
    <div ref={containerRef} data-slot="autocomplete" className={cn('relative', className)} onBlur={handleBlur}>
      <div
        className="flex min-h-8 w-full flex-wrap items-center gap-1 rounded-md border border-input bg-transparent px-1.5 py-1 transition-colors focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50 dark:bg-input/30"
        onClick={() => inputRef.current?.focus()}
      >
        {value.map(item => (
          <span
            key={item}
            className="inline-flex h-6 items-center gap-0.5 rounded-md bg-muted pl-2 pr-1 text-xs font-medium text-foreground/80"
          >
            <span className="max-w-35 truncate">{item}</span>
            <button
              type="button"
              onClick={e => {
                e.stopPropagation();
                removeValue(item);
              }}
              className="flex size-4 items-center justify-center rounded text-muted-foreground hover:bg-foreground/10 hover:text-foreground"
              aria-label={t('common.remove_item', { item })}
            >
              <X className="size-3" />
            </button>
          </span>
        ))}
        <input
          ref={inputRef}
          id={id}
          role="combobox"
          aria-expanded={isListVisible}
          aria-controls={isListVisible ? listId : undefined}
          aria-activedescendant={activeId}
          aria-autocomplete="list"
          aria-label={ariaLabel}
          autoComplete="off"
          maxLength={maxLength}
          value={input}
          onChange={handleInputChange}
          onFocus={() => openOnFocus && setOpen(true)}
          onClick={() => setOpen(true)}
          onKeyDown={e => keyActions[e.key]?.(e)}
          placeholder={value.length === 0 ? placeholder : undefined}
          className="h-6 min-w-20 flex-1 bg-transparent px-1 text-sm outline-none placeholder:text-muted-foreground"
        />
        {value.length > 0 && (
          <button
            type="button"
            onClick={e => {
              e.stopPropagation();
              onChange([]);
              inputRef.current?.focus();
            }}
            className="rounded-full p-0.5 text-muted-foreground hover:text-foreground"
            aria-label={t('common.clear_all')}
          >
            <X className="size-3.5" />
          </button>
        )}
      </div>

      {isListVisible && (
        // mousedown would blur the input before the click reaches an option.
        <div
          className="absolute z-50 mt-1 w-full rounded-md bg-popover ring-1 ring-foreground/10"
          onMouseDown={e => e.preventDefault()}
        >
          <ul id={listId} role="listbox" aria-multiselectable className="max-h-48 overflow-y-auto p-1">
            {options.map((option, index) => (
              <li
                key={`${option.isCreate ? 'create' : 'option'}-${option.value}`}
                id={`${listId}-${index}`}
                role="option"
                aria-selected={false}
                onClick={() => addValues([option.value])}
                onMouseMove={() => setActiveIndex(index)}
                className={cn(
                  'cursor-pointer truncate rounded-sm px-1.5 py-1.5 text-sm',
                  index === activeIndex && 'bg-muted'
                )}
              >
                {option.isCreate ? t('common.create_option', { value: option.value }) : option.value}
              </li>
            ))}
          </ul>
          {showSpinner && (
            <div className="flex items-center justify-center py-3" role="status" aria-label={t('common.loading')}>
              <Loader2 className="size-4 animate-spin text-muted-foreground" />
            </div>
          )}
          {!showSpinner && options.length === 0 && (
            <p className="py-3 text-center text-xs text-muted-foreground">{t('common.no_data_found')}</p>
          )}
        </div>
      )}
    </div>
  );
}

type BuildOptionsInput = {
  fetched: string[];
  value: string[];
  search: string;
  normalize: (raw: string) => string;
  allowCreate: boolean;
};

// Filter locally too: the list on screen can still belong to the previous term while the next one loads.
function buildOptions({ fetched, value, search, normalize, allowCreate }: BuildOptionsInput): Option[] {
  const lowerSearch = search.toLowerCase();
  const existing = fetched
    .map(normalize)
    .filter(item => item && !value.includes(item) && item.toLowerCase().includes(lowerSearch))
    .map((item): Option => ({ value: item, isCreate: false }));

  const canCreate =
    allowCreate && search !== '' && !value.includes(search) && !existing.some(option => option.value === search);
  return canCreate ? [...existing, { value: search, isCreate: true }] : existing;
}
