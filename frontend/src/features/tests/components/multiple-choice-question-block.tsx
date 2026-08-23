'use client';

import { Check, CircleMinus, Plus, X } from 'lucide-react';
import { useTranslations } from 'next-intl';

import type { QuestionType } from '@/client';
import { AutoTextarea } from '@/components/shared/auto-textarea';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

import { QuestionBlockAction } from './question-block-action';
import { QuestionBlockWrapper } from './question-block-wrapper';
import { QuestionCardHeader } from './question-card-header';

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
  index?: number;
  selected?: boolean;
  onClick?: (e: React.MouseEvent) => void;
  isEditing?: boolean;
};

export function MultipleChoiceQuestionBlock({
  data,
  onChange,
  onRemove,
  index,
  selected,
  onClick,
  isEditing = true,
}: Props) {
  const t = useTranslations();
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

  // View mode
  if (!isEditing) {
    return (
      <QuestionBlockWrapper mode="view" selected={selected} onClick={onClick}>
        <QuestionCardHeader
          title={data.prompt || t('test_editor.question_prompt')}
          points={t('common.points_abbr', { count: data.points })}
          index={index}
        />
        <div className="px-6 pb-4 space-y-1 sm:px-8">
          {data.choices.map((choice, i) => (
            <div key={i} className="flex items-center gap-2 text-[0.8rem]">
              {choice.isCorrect ? (
                <Check className="size-3.5 shrink-0 text-feedback-correct" />
              ) : (
                <X className="size-3.5 shrink-0 text-muted-foreground/40" />
              )}
              <span className={cn(choice.isCorrect && 'text-feedback-correct font-medium')}>
                {choice.text || <span className="text-muted-foreground italic">—</span>}
              </span>
            </div>
          ))}
        </div>
      </QuestionBlockWrapper>
    );
  }

  // Edit mode
  return (
    <QuestionBlockWrapper mode="edit" selected={selected} onClick={onClick}>
      <div className="flex items-start gap-2 mb-4">
        <AutoTextarea
          rows={2}
          placeholder={t('test_editor.question_prompt')}
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
          className="w-15 shrink-0 text-center"
          title={t('test_editor.points')}
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
              placeholder={t('test_editor.option', { n: ci + 1 })}
              value={choice.text}
              onChange={e => updateChoice(ci, { text: e.target.value })}
              className="flex-1"
            />
            {canRemoveChoice && (
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => removeChoice(ci)}
                className="text-destructive hover:bg-destructive/10 hover:text-destructive"
              >
                <CircleMinus className="size-4" />
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
          {t('test_editor.add_choice')}
        </Button>
      )}
    </QuestionBlockWrapper>
  );
}
