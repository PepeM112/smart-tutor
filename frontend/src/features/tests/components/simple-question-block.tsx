'use client';

import { Trash2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export type SimpleQuestionData = {
  type: 'simple';
  prompt: string;
  answers: string;
};

type Props = {
  data: SimpleQuestionData;
  onChange: (data: SimpleQuestionData) => void;
  onRemove: () => void;
};

export function SimpleQuestionBlock({ data, onChange, onRemove }: Props) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-center gap-3">
        <div className="w-2/6">
          <Input
            placeholder="Prompt"
            value={data.prompt}
            onChange={e => onChange({ ...data, prompt: e.target.value })}
          />
        </div>
        <div className="w-2/6">
          <Input
            placeholder="Answers (comma-separated)"
            value={data.answers}
            onChange={e => onChange({ ...data, answers: e.target.value })}
          />
        </div>
        <div className="ml-auto">
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={onRemove}
            className="text-destructive hover:bg-destructive/10 hover:text-destructive"
          >
            <Trash2 className="size-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
