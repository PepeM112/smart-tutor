'use client';

import { Plus } from 'lucide-react';

import { QuestionType } from '@/client';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { getQuestionTypeInfo } from '@/features/tests/utils/question-icons';

export type AddItemType = 'group' | 'mc' | 'long';

type Props = {
  onSelect: (type: AddItemType) => void;
};

export function AddQuestionDropdown({ onSelect }: Props) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline">
          <Plus data-icon="inline-start" />
          Add question
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-48">
        {(
          [
            { addType: 'group' as const, questionType: QuestionType.SIMPLE, label: 'Simple questions' },
            { addType: 'mc' as const, questionType: QuestionType.MULTIPLE_CHOICE, label: 'Multiple Choice' },
            { addType: 'long' as const, questionType: QuestionType.LONG_TEXT, label: 'Long Text' },
          ] as const
        ).map(({ addType, questionType, label }) => {
          const { icon: Icon } = getQuestionTypeInfo(questionType);
          return (
            <DropdownMenuItem key={addType} onSelect={() => onSelect(addType)}>
              <Icon className="size-4" />
              {label}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
