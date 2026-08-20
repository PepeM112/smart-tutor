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

  function updateAnswersFromCsv(rowIdx: number, csv: string) {
    const parts = csv.split(',').map(s => s.trimStart());
    updateRow(rowIdx, { answers: parts.length > 0 ? parts : [''] });
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
          'rounded-xl border border-border bg-card px-4 py-3 shadow-card transition-colors',
          selected && 'bg-muted/60'
        )}
      >
        <div className="flex items-start gap-3">
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">
              {row.prompt || <span className="text-muted-foreground italic">—</span>}
            </p>
            <p className="text-[0.8rem] text-muted-foreground mt-0.5 truncate">
              {row.answers.filter(Boolean).join(', ') || <span className="italic">—</span>}
            </p>
          </div>
          <span className="shrink-0 whitespace-nowrap text-xs tabular-nums text-muted-foreground">
            {formatPoints(data.points)}
          </span>
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
          'rounded-xl border border-border bg-card shadow-card overflow-hidden transition-colors',
          selected && 'bg-muted/60'
        )}
      >
        <QuestionCardHeader
          title={data.title || t('test_editor.group_title')}
          points={formatPoints(data.points)}
          expanded={expanded}
          onToggle={() => onToggleExpand?.()}
        />
        {expanded && (
          <div className="border-t border-border px-4 py-3">
            {isVocab ? (
              <table className="w-full text-[0.8rem]">
                <tbody>
                  {data.rows.map((row, i) => (
                    <tr key={i} className="border-b border-border/50 last:border-0">
                      <td className="py-1.5 pr-4 font-medium">
                        {row.prompt || <span className="text-muted-foreground italic">—</span>}
                      </td>
                      <td className="py-1.5 text-muted-foreground">
                        {row.answers.filter(Boolean).join(', ') || <span className="italic">—</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="space-y-2 text-[0.8rem]">
                {data.rows.map((row, i) => (
                  <div key={i} className="space-y-0.5">
                    <p className="font-medium">
                      {row.prompt || <span className="text-muted-foreground italic">—</span>}
                    </p>
                    <p className="text-muted-foreground pl-2">
                      {row.answers.filter(Boolean).join(', ') || <span className="italic">—</span>}
                    </p>
                  </div>
                ))}
              </div>
            )}
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
        selected && 'bg-muted/60'
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

      {isVocab ? (
        <table className="w-full">
          <tbody>
            {data.rows.map((row, i) => (
              <tr key={i} className="border-b border-border/50 last:border-0">
                <td className="py-1.5 pr-2 w-1/2">
                  <Input
                    placeholder={t('test_editor.prompt')}
                    value={row.prompt}
                    onChange={e => updateRow(i, { prompt: e.target.value })}
                  />
                </td>
                <td className="py-1.5 pl-2">
                  <div className="flex items-center gap-1.5">
                    <Input
                      placeholder={t('test_editor.answers_comma')}
                      value={row.answers.join(', ')}
                      onChange={e => updateAnswersFromCsv(i, e.target.value)}
                      className="flex-1"
                    />
                    {canRemoveRow && (
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        onClick={() => removeRow(i)}
                        className="text-destructive hover:bg-destructive/10 hover:text-destructive shrink-0"
                      >
                        <CircleMinus className="size-3.5" />
                      </Button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <div className="space-y-3">
          {data.rows.map((row, i) => (
            <div key={i} className="flex items-center gap-2 max-sm:flex-col max-sm:items-stretch">
              <Input
                placeholder={t('test_editor.prompt')}
                value={row.prompt}
                onChange={e => updateRow(i, { prompt: e.target.value })}
                className="flex-1"
              />
              <div className="flex items-center gap-1.5 flex-1">
                <Input
                  placeholder={t('test_editor.answers_comma')}
                  value={row.answers.join(', ')}
                  onChange={e => updateAnswersFromCsv(i, e.target.value)}
                  className="flex-1"
                />
                {canRemoveRow && (
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    onClick={() => removeRow(i)}
                    className="text-destructive hover:bg-destructive/10 hover:text-destructive shrink-0"
                  >
                    <CircleMinus className="size-3.5" />
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

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
