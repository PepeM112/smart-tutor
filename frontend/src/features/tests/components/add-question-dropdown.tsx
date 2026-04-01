'use client';

import { ListChecks, Plus, Text } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

type QuestionType = 'simple' | 'multiple_choice';

type Props = {
  onSelect: (type: QuestionType) => void;
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
        <DropdownMenuItem onSelect={() => onSelect('simple')}>
          <Text className="size-4" />
          Simple
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => onSelect('multiple_choice')}>
          <ListChecks className="size-4" />
          Multiple Choice
        </DropdownMenuItem>
        <DropdownMenuItem disabled className="opacity-40">
          <Text className="size-4" />
          Long Text
          <span className="ml-auto text-[10px] font-medium bg-muted-foreground/20 px-1.5 py-0.5 rounded-full">
            Soon
          </span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
