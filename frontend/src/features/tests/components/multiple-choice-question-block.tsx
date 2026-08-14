'use client';

import { Plus, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';

import type { QuestionType } from '@/client';
import { AutoTextarea } from '@/components/shared/auto-textarea';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

import { QuestionBlockAction } from './question-block-action';

export type Choice = {
  text: string;
  isCorrect: boolean;
};

export type MultipleChoiceQuestionData = {
  key: string;
  type: QuestionType.MULTIPLE_CHOICE;
  prompt: string;
  choices: Choice[];
  points: number;
};

const MIN_CHOICES = 2;
const MAX_CHOICES = 6;

type Props = {
  data: MultipleChoiceQuestionData;
  onChange: (data: MultipleChoiceQuestionData) => void;
  onRemove: () => void;
  selected?: boolean;
  onClick?: (e: React.MouseEvent) => void;
};

export function MultipleChoiceQuestionBlock({ data, onChange, onRemove, selected, onClick }: Props) {
  const t = useTranslations('test_editor');
  const canRemoveChoice = data.choices.length > MIN_CHOICES;
  const canAddChoice = data.choices.length < MAX_CHOICES;

  function updateChoice(choiceIdx: number, patch: Partial<Choice>) {
    const updated = data.choices.map((c, i) => (i === choiceIdx ? { ...c, ...patch } : c));
    onChange({ ...data, choices: updated });
  }

  function addChoice() {
    if (!canAddChoice) return;
    onChange({ ...data, choices: [...data.choices, { text: '', isCorrect: false }] });
  }

  function removeChoice(choiceIdx: number) {
    if (!canRemoveChoice) return;
    onChange({ ...data, choices: data.choices.filter((_, i) => i !== choiceIdx) });
  }

  return (
    <div
      onClick={onClick}
      className={cn(
        'cursor-pointer rounded-xl border border-border bg-card p-4 shadow-card',
        selected && 'bg-accent ring-1 ring-primary'
      )}
    >
      <div className="flex items-start gap-2 mb-4">
        <AutoTextarea
          rows={2}
          placeholder={t('question_prompt')}
          value={data.prompt}
          onChange={e => onChange({ ...data, prompt: e.target.value })}
          className="flex-1"
        />
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

      <div className="space-y-2">
        {data.choices.map((choice, ci) => (
          <div key={ci} className="flex items-center gap-2">
            <Checkbox
              checked={choice.isCorrect}
              onCheckedChange={checked => updateChoice(ci, { isCorrect: checked === true })}
            />
            <AutoTextarea
              rows={1}
              placeholder={t('option', { n: ci + 1 })}
              value={choice.text}
              onChange={e => updateChoice(ci, { text: e.target.value })}
              className="flex-1"
            />
            {canRemoveChoice && (
              <Button
                variant="ghost"
                size="icon-xs"
                onClick={() => removeChoice(ci)}
                className="text-destructive hover:bg-destructive/10 hover:text-destructive"
              >
                <Trash2 className="size-3.5" />
              </Button>
            )}
          </div>
        ))}
      </div>

      {canAddChoice && (
        <Button
          variant="outline"
          size="sm"
          onClick={addChoice}
          className="mt-5 border-primary/30 text-primary hover:bg-primary/10 hover:text-primary hover:border-primary/50"
        >
          <Plus className="size-3.5" />
          {t('add_choice')}
        </Button>
      )}
    </div>
  );
}
