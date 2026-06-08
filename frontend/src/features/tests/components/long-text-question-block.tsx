'use client';

import { Plus, Trash2 } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';

import type { QuestionType } from '@/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

import { LONG_TEXT_LENGTH_TIERS } from '../constants';

import { AutoTextarea } from './auto-textarea';

export type Criterion = {
  point: string;
  weight: number;
  category: string;
};

export type LongTextQuestionData = {
  type: QuestionType.LONG_TEXT;
  prompt: string;
  lengthLimit: number;
  criteria: Criterion[];
  points: number;
};

function CategoryInput({
  value,
  onChange,
  suggestions,
}: {
  value: string;
  onChange: (value: string) => void;
  suggestions: string[];
}) {
  const [open, setOpen] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const filtered = useMemo(() => {
    if (!value) return suggestions.slice(0, 5);
    const lower = value.toLowerCase();
    return suggestions.filter(s => s.toLowerCase().includes(lower) && s !== value).slice(0, 5);
  }, [value, suggestions]);

  const showDropdown = open && filtered.length > 0;

  return (
    <div className="relative w-32 shrink-0">
      <Input
        placeholder="Category"
        value={value}
        onChange={e => onChange(e.target.value)}
        onFocus={() => setOpen(true)}
        onBlur={() => {
          timeoutRef.current = setTimeout(() => setOpen(false), 150);
        }}
        className="w-full"
      />
      {showDropdown && (
        <div className="absolute top-full left-0 z-10 mt-1 w-full rounded-md border border-border bg-popover py-1 shadow-md">
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

type Props = {
  data: LongTextQuestionData;
  onChange: (data: LongTextQuestionData) => void;
  onRemove: () => void;
};

export function LongTextQuestionBlock({ data, onChange, onRemove }: Props) {
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
  const uniqueCategories = useMemo(
    () => [...new Set(data.criteria.map(c => c.category).filter(Boolean))],
    [data.criteria]
  );

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      {/* Prompt + length tier + delete */}
      <div className="flex items-start gap-2 mb-4">
        <AutoTextarea
          rows={2}
          placeholder="Question prompt (e.g. 'Describe the main events of the Roman Civil War')"
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
              {tier.label}
            </option>
          ))}
        </select>
        <Input
          type="number"
          min={0.5}
          step={0.5}
          value={data.points}
          onChange={e => onChange({ ...data, points: Number(e.target.value) })}
          className="w-20 shrink-0 text-center"
          title="Points"
        />
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={onRemove}
          className="text-destructive hover:bg-destructive/10 hover:text-destructive"
        >
          <Trash2 className="size-4" />
        </Button>
      </div>

      {/* Rubric criteria */}
      <div className="space-y-2">
        <p className="text-sm font-medium text-muted-foreground">
          Rubric criteria <span className="font-normal">(total: {totalWeight.toFixed(2)})</span>
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
              placeholder="What the student must mention..."
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
              onChange={e => updateCriterion(ci, { weight: Number(e.target.value) })}
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
        Add criterion
      </Button>
    </div>
  );
}
