'use client';

import { Plus, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useMemo, useRef, useState } from 'react';

import type { QuestionType } from '@/client';
import { AutoTextarea } from '@/components/shared/auto-textarea';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

import { LONG_TEXT_LENGTH_TIERS } from '../constants';

import { QuestionBlockAction } from './question-block-action';

export type Criterion = {
  point: string;
  weight: number;
  category: string;
};

export type LongTextQuestionData = {
  key: string;
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
  selected?: boolean;
  onClick?: (e: React.MouseEvent) => void;
};

export function LongTextQuestionBlock({ data, onChange, onRemove, selected, onClick }: Props) {
  const t = useTranslations('test_editor');

  function updateCriterion(idx: number, patch: Partial<Criterion>) {
    const updated = data.criteria.map((c, i) => (i === idx ? { ...c, ...patch } : c));
    onChange({ ...data, criteria: updated });
  }

  function addCriterion() {
    // Reuse the last category so new criteria stay grouped with it by default
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

  return (
    <div
      onClick={onClick}
      className={cn(
        'cursor-pointer rounded-xl border border-border bg-card p-4 shadow-card',
        selected && 'bg-accent ring-1 ring-primary'
      )}
    >
      {/* Prompt + length tier + delete */}
      <div className="flex flex-wrap items-start gap-2 mb-4">
        <AutoTextarea
          rows={2}
          placeholder={`${t('question_prompt')} (${t('question_prompt_example')})`}
          value={data.prompt}
          onChange={e => onChange({ ...data, prompt: e.target.value })}
          className="flex-1"
        />
        <select
          value={data.lengthLimit}
          onChange={e => onChange({ ...data, lengthLimit: Number(e.target.value) })}
          className="h-9 rounded-md border border-input bg-background px-3 text-sm"
        >
          {LONG_TEXT_LENGTH_TIERS.map(tier => (
            <option key={tier.value} value={tier.value}>
              {t(tier.labelKey)}
            </option>
          ))}
        </select>
        <Input
          type="number"
          min={0.5}
          step={0.5}
          value={data.points}
          onChange={e => onChange({ ...data, points: parseFloat(e.target.value) || 0.5 })}
          className="w-20 shrink-0 text-center"
          title={t('points')}
        />
        <QuestionBlockAction onRemove={onRemove} />
      </div>

      {/* Rubric criteria */}
      <div className="space-y-2">
        <p className={cn('text-sm font-medium', isWeightValid ? 'text-muted-foreground' : 'text-destructive')}>
          {t('rubric_criteria', { total: totalWeight.toFixed(2) })}
        </p>

        {data.criteria.map((criterion, ci) => (
          <div key={ci} className="flex items-center gap-2">
            <CategoryInput
              value={criterion.category}
              onChange={v => updateCriterion(ci, { category: v })}
              suggestions={uniqueCategories}
            />
            <AutoTextarea
              rows={1}
              placeholder={t('criterion_placeholder')}
              value={criterion.point}
              onChange={e => updateCriterion(ci, { point: e.target.value })}
              className="flex-1"
            />
            <Input
              type="number"
              min={0.05}
              max={1}
              step={0.05}
              value={criterion.weight}
              onChange={e => updateCriterion(ci, { weight: parseFloat(e.target.value) || 0.05 })}
              className="w-20 shrink-0 text-center"
            />
            {data.criteria.length > 1 && (
              <Button
                variant="ghost"
                size="icon-xs"
                onClick={() => removeCriterion(ci)}
                className="text-destructive hover:bg-destructive/10 hover:text-destructive"
              >
                <Trash2 className="size-3.5" />
              </Button>
            )}
          </div>
        ))}
      </div>

      {/* Add criterion button */}
      <Button
        variant="outline"
        size="sm"
        onClick={addCriterion}
        className="mt-5 border-primary/30 text-primary hover:bg-primary/10 hover:text-primary hover:border-primary/50"
      >
        <Plus className="size-3.5" />
        {t('add_criterion')}
      </Button>
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
  const t = useTranslations('test_editor');
  const [open, setOpen] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  const showDropdown = open && filtered.length > 0;

  return (
    <div className="relative w-32 shrink-0">
      <Input
        placeholder={t('category')}
        value={value}
        onChange={e => onChange(e.target.value)}
        onFocus={() => setOpen(true)}
        // Delay closing so a click on a suggestion can register before blur hides the list
        onBlur={() => {
          timeoutRef.current = setTimeout(() => setOpen(false), 150);
        }}
        className="w-full"
      />
      {showDropdown && (
        <div className="absolute top-full left-0 z-10 mt-1 w-full rounded-md bg-popover py-1 ring-1 ring-foreground/10">
          {filtered.map(s => (
            <button
              key={s}
              type="button"
              className="w-full px-2 py-1 text-left text-sm hover:bg-accent truncate"
              onMouseDown={() => {
                if (timeoutRef.current) clearTimeout(timeoutRef.current);
                onChange(s);
                setOpen(false);
              }}
            >
              {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
