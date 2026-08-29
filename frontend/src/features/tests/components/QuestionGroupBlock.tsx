'use client';

import { CircleMinus, Plus } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useId } from 'react';

import { QuestionGroupType } from '@/client';
import { AutoTextarea } from '@/components/shared/AutoTextarea';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';

import { QuestionBlockAction } from './QuestionBlockAction';
import { QuestionBlockWrapper } from './QuestionBlockWrapper';
import { QuestionCardHeader } from './QuestionCardHeader';

export type SimpleRow = {
  /** Backend question ID. Undefined for newly-added, not-yet-saved rows. */
  id?: string;
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
  index?: number;
  selected?: boolean;
  onClick?: (e: React.MouseEvent) => void;
  isEditing?: boolean;
};

export function QuestionGroupBlock({ data, onChange, onRemove, index, selected, onClick, isEditing = true }: Props) {
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
    const prefix = index != null ? `${index + 1}. ` : '';
    return (
      <QuestionBlockWrapper mode="view" selected={selected} onClick={onClick} className="px-4 py-3 sm:px-6">
        <p className="text-sm font-medium">
          {prefix}
          {row.prompt || <span className="text-muted-foreground italic">—</span>}
          <span className="ml-1.5 text-sm font-normal tabular-nums text-muted-foreground">
            ({t('common.points_abbr', { count: data.points })})
          </span>
        </p>
        <p className="text-[0.8rem] text-muted-foreground mt-0.5 ml-2">
          {row.answers.filter(Boolean).join(', ') || <span className="italic">—</span>}
        </p>
      </QuestionBlockWrapper>
    );
  }

  // View mode: group — collapsed or expanded read-only
  if (!isEditing) {
    return (
      <QuestionBlockWrapper mode="view" selected={selected} onClick={onClick}>
        <QuestionCardHeader
          title={data.title || t('test_editor.group_title')}
          points={t('common.points_abbr', { count: data.points })}
          index={index}
        />
        <div className="px-6 pb-4 sm:px-8">
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
                  <p className="font-medium">{row.prompt || <span className="text-muted-foreground italic">—</span>}</p>
                  <p className="text-muted-foreground pl-2">
                    {row.answers.filter(Boolean).join(', ') || <span className="italic">—</span>}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      </QuestionBlockWrapper>
    );
  }

  // Edit mode
  return (
    <QuestionBlockWrapper mode="edit" selected={selected} onClick={onClick}>
      <div className="flex items-start gap-2 mb-3">
        <AutoTextarea
          rows={1}
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
          className="w-15 shrink-0 text-center"
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
                        size="icon-sm"
                        onClick={() => removeRow(i)}
                        className="text-destructive hover:bg-destructive/10 hover:text-destructive shrink-0"
                      >
                        <CircleMinus className="size-4" />
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
                    size="icon-sm"
                    onClick={() => removeRow(i)}
                    className="text-destructive hover:bg-destructive/10 hover:text-destructive shrink-0"
                  >
                    <CircleMinus className="size-4" />
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
    </QuestionBlockWrapper>
  );
}
