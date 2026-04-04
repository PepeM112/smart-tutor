'use client';

import { Plus, Trash2 } from 'lucide-react';

import { QuestionGroupType } from '@/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';

export type SimpleRow = {
  prompt: string;
  answers: string;
};

export type QuestionGroupData = {
  type: 'group';
  groupType: QuestionGroupType;
  title: string;
  rows: SimpleRow[];
};

type Props = {
  data: QuestionGroupData;
  onChange: (data: QuestionGroupData) => void;
  onRemove: () => void;
};

export function newQuestionGroup(): QuestionGroupData {
  return {
    type: 'group',
    groupType: QuestionGroupType.UNKNOWN,
    title: '',
    rows: [{ prompt: '', answers: '' }],
  };
}

export function QuestionGroupBlock({ data, onChange, onRemove }: Props) {
  const canRemoveRow = data.rows.length > 1;

  function updateRow(idx: number, patch: Partial<SimpleRow>) {
    const updated = data.rows.map((r, i) => (i === idx ? { ...r, ...patch } : r));
    onChange({ ...data, rows: updated });
  }

  function addRow() {
    onChange({ ...data, rows: [...data.rows, { prompt: '', answers: '' }] });
  }

  function removeRow(idx: number) {
    if (!canRemoveRow) return;
    onChange({ ...data, rows: data.rows.filter((_, i) => i !== idx) });
  }

  const isVocab = data.groupType === QuestionGroupType.VOCABULARY;

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      {/* Title + delete button */}
      <div className="flex items-start gap-2 mb-3">
        <Input
          placeholder="Group title (optional)"
          value={data.title}
          onChange={e => onChange({ ...data, title: e.target.value })}
          className="flex-1"
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

      {/* Vocab mode toggle */}
      <div className="flex items-center gap-2 mb-4">
        <Switch
          id="vocab-toggle"
          checked={isVocab}
          onCheckedChange={checked =>
            onChange({
              ...data,
              groupType: checked ? QuestionGroupType.VOCABULARY : QuestionGroupType.UNKNOWN,
            })
          }
        />
        <Label htmlFor="vocab-toggle" className="text-sm text-muted-foreground cursor-pointer">
          Vocabulary mode
        </Label>
      </div>

      {/* Question rows */}
      <div className="space-y-2">
        {data.rows.map((row, i) => (
          <div key={i} className="flex items-center gap-2">
            <Input
              placeholder="Prompt"
              value={row.prompt}
              onChange={e => updateRow(i, { prompt: e.target.value })}
              className="flex-1"
            />
            <Input
              placeholder="Answers (comma-separated)"
              value={row.answers}
              onChange={e => updateRow(i, { answers: e.target.value })}
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
        ))}
      </div>

      {/* Add row button */}
      <Button
        variant="outline"
        size="sm"
        onClick={addRow}
        className="mt-5 border-primary/30 text-primary hover:bg-primary/10 hover:text-primary hover:border-primary/50"
      >
        <Plus className="size-3.5" />
        Add
      </Button>
    </div>
  );
}
