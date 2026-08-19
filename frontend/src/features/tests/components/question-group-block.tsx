'use client';

import { CircleMinus, Plus } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useId } from 'react';

import { QuestionGroupType } from '@/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';

import { QuestionBlockAction } from './question-block-action';
import { QuestionCardHeader } from './question-card-header';

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
  expanded?: boolean;
  onToggleExpand?: () => void;
  isEditing?: boolean;
};

function formatPoints(points: number): string {
  return points === 1 ? '1pt' : `${points}pts`;
}

export function QuestionGroupBlock({
  data,
  onChange,
  onRemove,
  selected,
  onClick,
  expanded = true,
  onToggleExpand,
  isEditing = true,
}: Props) {
  const t = useTranslations();
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

  const isSingleQuestion = !data.title && data.rows.length === 1;

  // View mode: single standalone question — flat card, no expand/collapse
  if (!isEditing && isSingleQuestion) {
    const row = data.rows[0];
    return (
      <div
        onClick={onClick}
        className={cn(
          'rounded-xl border border-border bg-card px-4 py-3 shadow-card',
          selected && 'bg-accent ring-1 ring-primary'
        )}
      >
        <div className="flex items-start gap-3">
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">
              {row.prompt || <span className="text-muted-foreground italic">—</span>}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5 truncate">
              {row.answers.filter(Boolean).join(', ') || <span className="italic">—</span>}
            </p>
          </div>
          <span className="shrink-0 whitespace-nowrap text-xs tabular-nums text-muted-foreground">
            {formatPoints(data.points)}
          </span>
          <QuestionBlockAction onRemove={onRemove} />
        </div>
      </div>
    );
  }

  // View mode: group — collapsed or expanded read-only
  if (!isEditing) {
    return (
      <div
        onClick={onClick}
        className={cn(
          'rounded-xl border border-border bg-card shadow-card overflow-hidden',
          selected && 'bg-accent ring-1 ring-primary'
        )}
      >
        <QuestionCardHeader
          title={data.title || t('test_editor.group_title')}
          points={formatPoints(data.points)}
          expanded={expanded}
          onToggle={() => onToggleExpand?.()}
          onRemove={onRemove}
        />
        {expanded && (
          <div className="border-t border-border px-4 py-3 space-y-2">
            {data.rows.map((row, i) => (
              <div key={i} className="space-y-0.5">
                <p className="text-sm font-medium">
                  {row.prompt || <span className="text-muted-foreground italic">—</span>}
                </p>
                <p className="text-xs text-muted-foreground pl-2">
                  {row.answers.filter(Boolean).join(', ') || <span className="italic">—</span>}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  // Edit mode
  return (
    <div
      onClick={onClick}
      className={cn(
        'cursor-pointer rounded-xl border border-border bg-card p-4 shadow-card',
        selected && 'bg-accent ring-1 ring-primary'
      )}
    >
      <div className="flex items-start gap-2 mb-3">
        <Input
          placeholder={t('test_editor.group_title')}
          value={data.title}
          onChange={e => onChange({ ...data, title: e.target.value })}
          className="flex-1"
        />
        <Input
          type="number"
          min={0.5}
          step={0.5}
          value={data.points}
          onChange={e => onChange({ ...data, points: parseFloat(e.target.value) || 0.5 })}
          className="w-20 shrink-0 text-center"
          title={t('test_editor.points')}
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
              groupType: checked ? QuestionGroupType.VOCABULARY : QuestionGroupType.GENERIC,
            })
          }
        />
        <Label htmlFor={vocabId} className="text-sm text-muted-foreground cursor-pointer">
          {t('test_editor.vocabulary_mode')}
        </Label>
      </div>

      <div className="space-y-3">
        {data.rows.map((row, i) => (
          <div key={i} className="space-y-1.5">
            <div className="flex items-center gap-2">
              <Input
                placeholder={t('test_editor.prompt')}
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
                  <CircleMinus className="size-3.5" />
                </Button>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-1.5 pl-2">
              {row.answers.map((answer, ai) => (
                <div key={ai} className="flex items-center gap-1">
                  <Input
                    placeholder={t('test_editor.answer_n', { n: ai + 1 })}
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
                      <CircleMinus className="size-3" />
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
        {t('test_editor.add')}
      </Button>
    </div>
  );
}
