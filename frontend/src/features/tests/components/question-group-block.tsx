'use client';

import { Plus, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useId } from 'react';

import { QuestionGroupType } from '@/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';

import { QuestionBlockAction } from './question-block-action';

export type SimpleRow = {
  prompt: string;
  answers: string[];
};

export type QuestionGroupData = {
  key: string;
  type: 'group';
  groupType: QuestionGroupType;
  title: string;
  rows: SimpleRow[];
  points: number;
};

type Props = {
  data: QuestionGroupData;
  onChange: (data: QuestionGroupData) => void;
  onRemove: () => void;
  selected?: boolean;
  onClick?: (e: React.MouseEvent) => void;
};

export function QuestionGroupBlock({ data, onChange, onRemove, selected, onClick }: Props) {
  const t = useTranslations('test_editor');
  const vocabId = useId();
  const canRemoveRow = data.rows.length > 1;

  function updateRow(idx: number, patch: Partial<SimpleRow>) {
    const updated = data.rows.map((r, i) => (i === idx ? { ...r, ...patch } : r));
    onChange({ ...data, rows: updated });
  }

  function updateAnswer(rowIdx: number, answerIdx: number, value: string) {
    const row = data.rows[rowIdx];
    const updatedAnswers = row.answers.map((a, i) => (i === answerIdx ? value : a));
    updateRow(rowIdx, { answers: updatedAnswers });
  }

  function addAnswer(rowIdx: number) {
    const row = data.rows[rowIdx];
    updateRow(rowIdx, { answers: [...row.answers, ''] });
  }

  function removeAnswer(rowIdx: number, answerIdx: number) {
    const row = data.rows[rowIdx];
    if (row.answers.length <= 1) return;
    updateRow(rowIdx, { answers: row.answers.filter((_, i) => i !== answerIdx) });
  }

  function addRow() {
    onChange({ ...data, rows: [...data.rows, { prompt: '', answers: [''] }] });
  }

  function removeRow(idx: number) {
    if (!canRemoveRow) return;
    onChange({ ...data, rows: data.rows.filter((_, i) => i !== idx) });
  }

  const isVocab = data.groupType === QuestionGroupType.VOCABULARY;

  return (
    <div
      onClick={onClick}
      className={cn(
        'cursor-pointer rounded-xl border border-primary/90 bg-card p-4',
        selected && 'bg-accent ring-1 ring-primary'
      )}
    >
      <div className="flex items-start gap-2 mb-3">
        <Input
          placeholder={t('group_title')}
          value={data.title}
          onChange={e => onChange({ ...data, title: e.target.value })}
          className="flex-1"
        />
        <Input
          type="number"
          min={0.5}
          step={0.5}
          value={data.points}
          onChange={e => onChange({ ...data, points: Number(e.target.value) })}
          className="w-20 shrink-0 text-center"
          title={t('points')}
        />
        <QuestionBlockAction onRemove={onRemove} />
      </div>

      <div className="flex items-center gap-2 mb-4">
        <Switch
          id={vocabId}
          checked={isVocab}
          onCheckedChange={checked =>
            onChange({
              ...data,
              groupType: checked ? QuestionGroupType.VOCABULARY : QuestionGroupType.UNKNOWN,
            })
          }
        />
        <Label htmlFor={vocabId} className="text-sm text-muted-foreground cursor-pointer">
          {t('vocabulary_mode')}
        </Label>
      </div>

      <div className="space-y-3">
        {data.rows.map((row, i) => (
          <div key={i} className="space-y-1.5">
            <div className="flex items-center gap-2">
              <Input
                placeholder={t('prompt')}
                value={row.prompt}
                onChange={e => updateRow(i, { prompt: e.target.value })}
                className="flex-1"
              />
              {canRemoveRow && (
                <Button
                  variant="ghost"
                  size="icon-xs"
                  onClick={() => removeRow(i)}
                  className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                >
                  <Trash2 className="size-3.5" />
                </Button>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-1.5 pl-2">
              {row.answers.map((answer, ai) => (
                <div key={ai} className="flex items-center gap-1">
                  <Input
                    placeholder={t('answer_n', { n: ai + 1 })}
                    value={answer}
                    onChange={e => updateAnswer(i, ai, e.target.value)}
                    className="w-36"
                  />
                  {row.answers.length > 1 && (
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      onClick={() => removeAnswer(i, ai)}
                      className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                    >
                      <Trash2 className="size-3" />
                    </Button>
                  )}
                </div>
              ))}
              <Button
                variant="ghost"
                size="icon-xs"
                onClick={() => addAnswer(i)}
                className="text-primary hover:bg-primary/10 hover:text-primary"
              >
                <Plus className="size-3.5" />
              </Button>
            </div>
          </div>
        ))}
      </div>

      <Button
        variant="outline"
        size="sm"
        onClick={addRow}
        className="mt-5 border-primary/30 text-primary hover:bg-primary/10 hover:text-primary hover:border-primary/50"
      >
        <Plus className="size-3.5" />
        {t('add')}
      </Button>
    </div>
  );
}
