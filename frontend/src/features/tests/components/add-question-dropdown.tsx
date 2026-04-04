'use client';

import { Layers, ListChecks, Plus, Text } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

export type AddItemType = 'group' | 'mc';

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
        <DropdownMenuItem onSelect={() => onSelect('group')}>
          <Layers className="size-4" />
          Simple questions
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => onSelect('mc')}>
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
