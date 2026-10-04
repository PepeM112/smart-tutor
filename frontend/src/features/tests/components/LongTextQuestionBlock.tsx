'use client';

import { CircleMinus, Plus } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useId, useMemo, useRef, useState } from 'react';

import { LongTextLength, type QuestionType } from '@/client';
import { AutoTextarea } from '@/components/shared/AutoTextarea';
import { Button } from '@/components/ui/button';
import { ButtonGroup, type ButtonGroupItem } from '@/components/ui/button-group';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

import { LONG_TEXT_LENGTH_TIERS } from '../constants';

import { QuestionBlockAction } from './QuestionBlockAction';
import { QuestionBlockWrapper } from './QuestionBlockWrapper';
import { QuestionCardHeader } from './QuestionCardHeader';

export type Criterion = {
  point: string;
  weight: number;
  category: string;
};

export type LongTextQuestionData = {
  key: string;
  /** Backend question ID. Undefined for newly-added, not-yet-saved questions. */
  id?: string;
  type: QuestionType.LONG_TEXT;
  prompt: string;
  lengthLimit: number;
  criteria: Criterion[];
  points: number;
};

type Props = {
  data: LongTextQuestionData;
  onChange: (data: LongTextQuestionData) => void;
  onRemove: () => void;
  index?: number;
  selected?: boolean;
  onClick?: (e: React.MouseEvent) => void;
  isEditing?: boolean;
};

const LENGTH_LABEL_KEYS: Record<number, string> = {
  [LongTextLength.SHORT]: 'test_editor.length_short',
  [LongTextLength.MEDIUM]: 'test_editor.length_medium',
  [LongTextLength.LONG]: 'test_editor.length_long',
};

export function LongTextQuestionBlock({ data, onChange, onRemove, index, selected, onClick, isEditing = true }: Props) {
  const t = useTranslations();

  function updateCriterion(idx: number, patch: Partial<Criterion>) {
    const updated = data.criteria.map((c, i) => (i === idx ? { ...c, ...patch } : c));
    onChange({ ...data, criteria: updated });
  }

  function addCriterion() {
    const lastCategory = data.criteria.at(-1)?.category ?? '';
    onChange({ ...data, criteria: [...data.criteria, { point: '', weight: 0.1, category: lastCategory }] });
  }

  function removeCriterion(idx: number) {
    if (data.criteria.length <= 1) return;
    onChange({ ...data, criteria: data.criteria.filter((_, i) => i !== idx) });
  }

  const totalWeight = data.criteria.reduce((sum, c) => sum + c.weight, 0);
  const isWeightValid = Math.abs(totalWeight - 1.0) < 0.001;
  const uniqueCategories = useMemo(
    () => [...new Set(data.criteria.map(c => c.category).filter(Boolean))],
    [data.criteria]
  );
  const lengthChip = t(LENGTH_LABEL_KEYS[data.lengthLimit] ?? LENGTH_LABEL_KEYS[LongTextLength.SHORT]);
  const lengthItems: ButtonGroupItem<number>[] = LONG_TEXT_LENGTH_TIERS.map(tier => ({
    label: t(LENGTH_LABEL_KEYS[tier.value]),
    value: tier.value,
  }));

  // View mode
  if (!isEditing) {
    return (
      <QuestionBlockWrapper mode="view" selected={selected} onClick={onClick}>
        <QuestionCardHeader
          title={data.prompt || t('test_editor.question_prompt')}
          points={t('common.points_abbr', { count: data.points })}
          chip={lengthChip}
          index={index}
        />
        <div className="px-6 pb-4 sm:px-8">
          <CriteriaReadOnly criteria={data.criteria} />
        </div>
      </QuestionBlockWrapper>
    );
  }

  // Edit mode
  return (
    <QuestionBlockWrapper mode="edit" selected={selected} onClick={onClick}>
      {/* Mobile: row 1 = title + delete, row 2 = selector + points */}
      {/* Desktop: single row with flex-wrap */}
      <div className="flex flex-col gap-2 mb-4 sm:flex-row sm:flex-wrap sm:items-start">
        <AutoTextarea
          rows={1}
          placeholder={`${t('test_editor.question_prompt')} (${t('test_editor.question_prompt_example')})`}
          value={data.prompt}
          onChange={e => onChange({ ...data, prompt: e.target.value })}
          className="sm:flex-1"
        />
        <div className="flex items-center gap-2">
          <ButtonGroup
            value={data.lengthLimit}
            onChange={v => onChange({ ...data, lengthLimit: v })}
            items={lengthItems}
          />
          <Input
            type="number"
            min={0.5}
            step={0.5}
            value={data.points}
            onChange={e => onChange({ ...data, points: parseFloat(e.target.value) || 0.5 })}
            className="ml-auto w-15 shrink-0 text-center sm:ml-0"
            title={t('test_editor.points')}
          />
          <QuestionBlockAction onRemove={onRemove} />
        </div>
      </div>

      <div className="space-y-3 sm:space-y-2">
        <p className={cn('text-sm font-medium', isWeightValid ? 'text-muted-foreground' : 'text-destructive')}>
          {t('test_editor.rubric_criteria', { total: totalWeight.toFixed(2) })}
        </p>

        {data.criteria.map((criterion, ci) => (
          <div key={ci} className="flex flex-wrap items-center gap-2">
            <CategoryInput
              value={criterion.category}
              onChange={v => updateCriterion(ci, { category: v })}
              suggestions={uniqueCategories}
            />
            <AutoTextarea
              rows={1}
              placeholder={t('test_editor.criterion_placeholder')}
              value={criterion.point}
              onChange={e => updateCriterion(ci, { point: e.target.value })}
              className="order-last basis-full sm:order-0 sm:basis-auto sm:flex-1"
            />
            <Input
              type="number"
              min={0.05}
              max={1}
              step={0.05}
              value={criterion.weight}
              onChange={e => updateCriterion(ci, { weight: parseFloat(e.target.value) || 0.05 })}
              className="ml-auto w-15 shrink-0 text-center sm:ml-0 sm:w-20"
            />
            {data.criteria.length > 1 && (
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => removeCriterion(ci)}
                className="text-destructive hover:bg-destructive/10 hover:text-destructive"
              >
                <CircleMinus className="size-4" />
              </Button>
            )}
          </div>
        ))}
      </div>

      <Button
        variant="outline"
        size="sm"
        onClick={addCriterion}
        className="mt-5 border-primary/30 text-primary hover:bg-primary/10 hover:text-primary hover:border-primary/50"
      >
        <Plus className="size-3.5" />
        {t('test_editor.add_criterion')}
      </Button>
    </QuestionBlockWrapper>
  );
}

function CriteriaReadOnly({ criteria }: { criteria: Criterion[] }) {
  const grouped = useMemo(() => {
    const groups: { category: string; items: Criterion[] }[] = [];
    criteria.forEach(c => {
      const cat = c.category || '';
      const existing = groups.find(g => g.category === cat);
      if (existing) existing.items.push(c);
      else groups.push({ category: cat, items: [c] });
    });
    return groups;
  }, [criteria]);

  return (
    <div className="space-y-4">
      {grouped.map((group, gi) => (
        <div key={gi}>
          {group.category && (
            <span className="inline-block rounded bg-muted px-1.5 py-0.5 text-xs font-medium text-muted-foreground mb-1.5">
              {group.category}
            </span>
          )}
          <ul className="space-y-0.5">
            {group.items.map((c, ci) => (
              <li key={ci} className="flex items-baseline gap-4 text-[0.8rem]">
                <span className="shrink-0 tabular-nums text-xs text-muted-foreground w-5 text-right">
                  {(c.weight * 100).toFixed(0)}%
                </span>
                <span>{c.point || <span className="text-muted-foreground italic">—</span>}</span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

function CategoryInput({
  value,
  onChange,
  suggestions,
}: {
  value: string;
  onChange: (value: string) => void;
  suggestions: string[];
}) {
  const t = useTranslations();
  const [open, setOpen] = useState(false);
  // Highlighted suggestion; -1 means none. The input keeps the focus the whole time.
  const [activeIndex, setActiveIndex] = useState(-1);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const listboxId = useId();

  useEffect(
    () => () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    },
    []
  );

  const filtered = useMemo(() => {
    if (!value) return suggestions.slice(0, 5);
    const lower = value.toLowerCase();
    return suggestions.filter(s => s.toLowerCase().includes(lower) && s !== value).slice(0, 5);
  }, [value, suggestions]);

  // When the suggestions change (here or in another criterion), the old index can point past the end
  // of the new list. Reset it during render, as React advises, so Enter never picks a missing item.
  const listKey = filtered.join('\u0000');
  const [prevListKey, setPrevListKey] = useState(listKey);
  if (prevListKey !== listKey) {
    setPrevListKey(listKey);
    setActiveIndex(-1);
  }

  const showDropdown = open && filtered.length > 0;
  const optionId = (i: number): string => `${listboxId}-option-${i}`;

  function select(suggestion: string) {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    onChange(suggestion);
    setOpen(false);
    setActiveIndex(-1);
  }

  function closeList() {
    setOpen(false);
    setActiveIndex(-1);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      if (filtered.length === 0) return;
      e.preventDefault();
      if (!showDropdown) {
        setOpen(true);
        return;
      }
      const step = e.key === 'ArrowDown' ? 1 : -1;
      setActiveIndex(prev => (prev + step + filtered.length) % filtered.length);
    } else if (e.key === 'Enter' && showDropdown && activeIndex >= 0) {
      e.preventDefault();
      select(filtered[activeIndex]);
    } else if (e.key === 'Escape' && showDropdown) {
      // Close only the list, not a parent dialog.
      e.preventDefault();
      e.stopPropagation();
      closeList();
    }
  }

  return (
    <div className="relative w-32 shrink-0">
      <Input
        role="combobox"
        aria-expanded={showDropdown}
        aria-controls={listboxId}
        aria-autocomplete="list"
        aria-activedescendant={showDropdown && activeIndex >= 0 ? optionId(activeIndex) : undefined}
        placeholder={t('test_editor.category')}
        value={value}
        onChange={e => {
          onChange(e.target.value);
          setActiveIndex(-1);
          // Typing after Esc opens the list again.
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => {
          timeoutRef.current = setTimeout(closeList, 150);
        }}
        onKeyDown={handleKeyDown}
        className="w-full"
      />
      {showDropdown && (
        <div
          id={listboxId}
          role="listbox"
          className="absolute top-full left-0 z-10 mt-1 w-full rounded-md bg-popover py-1 ring-1 ring-foreground/10"
        >
          {filtered.map((s, i) => (
            <div
              key={s}
              id={optionId(i)}
              role="option"
              aria-selected={i === activeIndex}
              className={cn('w-full cursor-pointer px-2 py-1 text-left text-sm hover:bg-accent truncate', {
                'bg-accent': i === activeIndex,
              })}
              onMouseDown={() => select(s)}
            >
              {s}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
