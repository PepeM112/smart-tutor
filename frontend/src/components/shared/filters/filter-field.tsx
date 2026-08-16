'use client';

import { Check, ChevronsUpDown, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { type KeyboardEvent, useCallback, useMemo, useRef, useState } from 'react';

import { Input } from '@/components/ui/input';
import {
  FilterType,
  isFilterEntity,
  type DateFilterValue,
  type FilterEntity,
  type FilterItem,
  type FilterValue,
  type Primitive,
  type RangeFilterValue,
} from '@/lib/filters';
import { cn } from '@/lib/utils';

type Props = {
  item: FilterItem;
  value: FilterValue[string] | undefined;
  onChange: (value: FilterValue[string] | undefined) => void;
};

export function FilterField({ item, value, onChange }: Props) {
  switch (item.type) {
    case FilterType.SINGLE:
      return <SingleField value={value as Primitive} onChange={onChange} />;
    case FilterType.MULTIPLE:
      return <MultipleField value={value as Primitive[] | undefined} onChange={onChange} />;
    case FilterType.SELECT:
      return <SelectField item={item} value={value as Primitive} onChange={onChange} />;
    case FilterType.MULTIPLE_SELECT:
      return <SearchableMultiSelectField item={item} value={value as Primitive[] | undefined} onChange={onChange} />;
    case FilterType.TOGGLE:
      return <ToggleField item={item} value={value as Primitive | undefined} onChange={onChange} />;
    case FilterType.DATE:
      return <DateField value={value as DateFilterValue | undefined} onChange={onChange} />;
    case FilterType.RANGE:
      return <RangeField value={value as RangeFilterValue | undefined} onChange={onChange} />;
    default:
      return null;
  }
}

function SingleField({
  value,
  onChange,
}: {
  value: Primitive | undefined;
  onChange: (v: Primitive | undefined) => void;
}) {
  return (
    <Input
      value={value != null ? String(value) : ''}
      onChange={e => onChange(e.target.value || undefined)}
      className="h-8 text-sm"
    />
  );
}

function MultipleField({
  value,
  onChange,
}: {
  value: Primitive[] | undefined;
  onChange: (v: Primitive[] | undefined) => void;
}) {
  const t = useTranslations();
  const [inputValue, setInputValue] = useState('');
  const tags = useMemo(() => value ?? [], [value]);

  const addTag = useCallback(
    (tag: string) => {
      const trimmed = tag.trim();
      if (!trimmed || tags.includes(trimmed)) return;
      onChange([...tags, trimmed]);
      setInputValue('');
    },
    [tags, onChange]
  );

  const removeTag = useCallback(
    (idx: number) => {
      const updated = tags.filter((_, i) => i !== idx);
      onChange(updated.length > 0 ? updated : undefined);
    },
    [tags, onChange]
  );

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      addTag(inputValue);
    }
  };

  return (
    <div className="space-y-1.5">
      <Input
        value={inputValue}
        onChange={e => setInputValue(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={() => addTag(inputValue)}
        className="h-8 text-sm"
        placeholder={t('common.type_and_enter')}
      />
      {tags.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {tags.map((tag, i) => (
            <span
              key={i}
              className="inline-flex items-center gap-0.5 rounded-md bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground"
            >
              {String(tag)}
              <button
                type="button"
                onClick={() => removeTag(i)}
                className="ml-0.5 rounded-full hover:bg-foreground/10 p-0.5"
              >
                <X className="size-3" />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function SelectField({
  item,
  value,
  onChange,
}: {
  item: FilterItem;
  value: Primitive | undefined;
  onChange: (v: Primitive | undefined) => void;
}) {
  const t = useTranslations();
  const items = item.options?.items ?? [];

  return (
    <select
      value={value != null ? String(value) : ''}
      onChange={e => {
        const v = e.target.value;
        if (!v) return onChange(undefined);
        if (item.options?.number) return onChange(Number(v));
        onChange(v);
      }}
      className="flex h-8 w-full rounded-md border border-input bg-transparent px-2 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
    >
      <option value="">{t('common.all')}</option>
      {items.map(opt => {
        const entity = isFilterEntity(opt) ? opt : { label: String(opt), value: opt };
        return (
          <option key={String(entity.value)} value={String(entity.value)}>
            {t(entity.label)}
          </option>
        );
      })}
    </select>
  );
}

function ToggleField({
  item,
  value,
  onChange,
}: {
  item: FilterItem;
  value: Primitive | undefined;
  onChange: (v: Primitive | undefined) => void;
}) {
  const t = useTranslations();

  const options = useMemo(() => {
    const items = item.options?.items ?? [];
    // '__all__' sentinel maps back to undefined (no filter) on click
    const all: FilterEntity[] = [{ label: 'common.all', value: '__all__' }];
    items.forEach(opt => {
      all.push(isFilterEntity(opt) ? opt : { label: String(opt), value: opt });
    });
    return all;
  }, [item.options?.items]);

  const activeValue = value ?? '__all__';

  return (
    <div className="flex rounded-md border border-input bg-muted/30 p-0.5">
      {options.map(opt => {
        const isActive = String(opt.value) === String(activeValue);
        return (
          <button
            key={String(opt.value)}
            type="button"
            onClick={() => onChange(opt.value === '__all__' ? undefined : opt.value)}
            className={cn(
              'flex-1 basis-0 rounded-sm px-3 py-1.5 text-center text-sm font-medium transition-colors',
              isActive ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
            )}
          >
            {t(opt.label)}
          </button>
        );
      })}
    </div>
  );
}

function DateField({
  value,
  onChange,
}: {
  value: DateFilterValue | undefined;
  onChange: (v: DateFilterValue | undefined) => void;
}) {
  const t = useTranslations();
  const from = value?.from ? toLocalDateString(value.from) : '';
  const to = value?.to ? toLocalDateString(value.to) : '';

  const handleChange = (field: 'from' | 'to', dateStr: string) => {
    const next: DateFilterValue = { ...value };
    if (dateStr) {
      next[field] = new Date(dateStr + 'T00:00:00');
    } else {
      delete next[field];
    }
    onChange(next.from || next.to ? next : undefined);
  };

  return (
    <div className="grid grid-cols-2 gap-2">
      <div>
        <label className="mb-1 block text-xs text-muted-foreground">{t('common.from')}</label>
        <Input type="date" value={from} onChange={e => handleChange('from', e.target.value)} className="h-8 text-sm" />
      </div>
      <div>
        <label className="mb-1 block text-xs text-muted-foreground">{t('common.to')}</label>
        <Input type="date" value={to} onChange={e => handleChange('to', e.target.value)} className="h-8 text-sm" />
      </div>
    </div>
  );
}

function toLocalDateString(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function RangeField({
  value,
  onChange,
}: {
  value: RangeFilterValue | undefined;
  onChange: (v: RangeFilterValue | undefined) => void;
}) {
  const t = useTranslations();

  const handleChange = (field: 'min' | 'max', raw: string) => {
    const next: RangeFilterValue = { ...value };
    if (raw !== '') {
      next[field] = Number(raw);
    } else {
      delete next[field];
    }
    onChange(next.min != null || next.max != null ? next : undefined);
  };

  return (
    <div className="grid grid-cols-2 gap-2">
      <div>
        <label className="mb-1 block text-xs text-muted-foreground">{t('common.min')}</label>
        <Input
          type="number"
          value={value?.min != null ? String(value.min) : ''}
          onChange={e => handleChange('min', e.target.value)}
          className="h-8 text-sm"
        />
      </div>
      <div>
        <label className="mb-1 block text-xs text-muted-foreground">{t('common.max')}</label>
        <Input
          type="number"
          value={value?.max != null ? String(value.max) : ''}
          onChange={e => handleChange('max', e.target.value)}
          className="h-8 text-sm"
        />
      </div>
    </div>
  );
}

function SearchableMultiSelectField({
  item,
  value,
  onChange,
}: {
  item: FilterItem;
  value: Primitive[] | undefined;
  onChange: (v: Primitive[] | undefined) => void;
}) {
  const t = useTranslations();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const selected = useMemo(() => value ?? [], [value]);

  const entities = useMemo(
    () => (item.options?.items ?? []).map(opt => (isFilterEntity(opt) ? opt : { label: String(opt), value: opt })),
    [item.options?.items]
  );

  const filtered = useMemo(() => {
    if (!search) return entities;
    const lower = search.toLowerCase();
    return entities.filter(e => {
      const label = t.has(e.label) ? t(e.label) : e.label;
      return label.toLowerCase().includes(lower);
    });
  }, [entities, search, t]);

  const selectedEntities = useMemo(
    () => entities.filter(e => selected.some(s => String(s) === String(e.value))),
    [entities, selected]
  );

  const toggle = useCallback(
    (itemValue: Primitive) => {
      const strVal = String(itemValue);
      const isSelected = selected.some(s => String(s) === strVal);
      let updated: Primitive[];
      if (isSelected) {
        updated = selected.filter(s => String(s) !== strVal);
      } else {
        updated = [...selected, itemValue];
      }
      onChange(updated.length > 0 ? updated : undefined);
    },
    [selected, onChange]
  );

  const handleBlur = useCallback((e: React.FocusEvent) => {
    if (containerRef.current?.contains(e.relatedTarget)) return;
    setOpen(false);
    setSearch('');
  }, []);

  return (
    <div ref={containerRef} className="relative" onBlur={handleBlur}>
      <div
        className="flex min-h-8 w-full flex-wrap items-center gap-1 rounded-md border border-input bg-transparent px-1.5 py-1 focus-within:ring-1 focus-within:ring-ring"
        onClick={() => inputRef.current?.focus()}
      >
        {selectedEntities.map(entity => (
          <span
            key={String(entity.value)}
            className="inline-flex items-center gap-0.5 rounded-md bg-muted px-1.5 py-0.5 text-xs font-medium text-muted-foreground"
          >
            <span className="max-w-[140px] truncate">{t.has(entity.label) ? t(entity.label) : entity.label}</span>
            <button
              type="button"
              onClick={e => {
                e.stopPropagation();
                toggle(entity.value);
              }}
              className="rounded-full p-0.5 hover:bg-foreground/10"
            >
              <X className="size-3" />
            </button>
          </span>
        ))}
        <div className="flex min-w-[60px] flex-1 items-center">
          <input
            ref={inputRef}
            value={search}
            onChange={e => setSearch(e.target.value)}
            onFocus={() => setOpen(true)}
            placeholder={selectedEntities.length === 0 ? t('common.all') : ''}
            className="h-6 w-full bg-transparent text-sm placeholder:text-muted-foreground focus-visible:outline-none"
          />
          {selectedEntities.length > 0 ? (
            <button
              type="button"
              onClick={e => {
                e.stopPropagation();
                onChange(undefined);
              }}
              className="rounded-full p-0.5 text-muted-foreground hover:text-foreground"
            >
              <X className="size-3.5" />
            </button>
          ) : (
            <ChevronsUpDown className="pointer-events-none size-3.5 shrink-0 text-muted-foreground" />
          )}
        </div>
      </div>

      {open && (
        <div className="absolute z-50 mt-1 w-full rounded-md border border-input bg-popover shadow-md">
          <div className="max-h-48 overflow-y-auto px-1 py-1">
            {filtered.length === 0 ? (
              <p className="py-3 text-center text-xs text-muted-foreground">{t('common.no_data_found')}</p>
            ) : (
              filtered.map(entity => {
                const isChecked = selected.some(s => String(s) === String(entity.value));
                return (
                  <button
                    key={String(entity.value)}
                    type="button"
                    onClick={() => toggle(entity.value)}
                    className="flex w-full items-center gap-2 rounded-sm px-1.5 py-1.5 text-left text-sm hover:bg-muted"
                  >
                    <Check className={cn('size-3.5 shrink-0', isChecked ? 'text-foreground' : 'text-transparent')} />
                    <span className="truncate">{t.has(entity.label) ? t(entity.label) : entity.label}</span>
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
