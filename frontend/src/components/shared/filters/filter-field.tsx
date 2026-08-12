'use client';

import { X } from 'lucide-react';
import { type KeyboardEvent, useCallback, useMemo, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import {
  FilterType,
  isFilterEntity,
  type FilterEntity,
  type FilterItem,
  type FilterValue,
  type Primitive,
} from '@/lib/filters';

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
      return <MultipleSelectField item={item} value={value as Primitive[] | undefined} onChange={onChange} />;
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
        placeholder="Type and press Enter"
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
      <option value="">All</option>
      {items.map(opt => {
        const entity = isFilterEntity(opt) ? opt : { label: String(opt), value: opt };
        return (
          <option key={String(entity.value)} value={String(entity.value)}>
            {entity.label}
          </option>
        );
      })}
    </select>
  );
}

function MultipleSelectField({
  item,
  value,
  onChange,
}: {
  item: FilterItem;
  value: Primitive[] | undefined;
  onChange: (v: Primitive[] | undefined) => void;
}) {
  const items = item.options?.items ?? [];
  const selected = value ?? [];

  function toggle(itemValue: Primitive) {
    const strVal = String(itemValue);
    const isSelected = selected.some(s => String(s) === strVal);
    let updated: Primitive[];
    if (isSelected) {
      updated = selected.filter(s => String(s) !== strVal);
    } else {
      const resolved = item.options?.number ? Number(itemValue) : itemValue;
      updated = [...selected, resolved];
    }
    onChange(updated.length > 0 ? updated : undefined);
  }

  return (
    <div className="space-y-1">
      {items.map(opt => {
        const entity: FilterEntity = isFilterEntity(opt) ? opt : { label: String(opt), value: opt };
        const isChecked = selected.some(s => String(s) === String(entity.value));
        return (
          <label
            key={String(entity.value)}
            className="flex items-center gap-2 py-0.5 text-sm cursor-pointer hover:text-foreground text-muted-foreground"
          >
            <Checkbox checked={isChecked} onCheckedChange={() => toggle(entity.value)} />
            {entity.label}
          </label>
        );
      })}
    </div>
  );
}

function ClearButton({ onClick }: { onClick: () => void }) {
  return (
    <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={onClick}>
      <X className="size-3 mr-1" />
      Clear
    </Button>
  );
}

export { ClearButton };
