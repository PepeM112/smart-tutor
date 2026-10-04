'use client';

// Renders the block-specific sections of the block handle menu (see `blockActions.ts`). It knows the three
// kinds of action (item, toggle, submenu), not the kinds of block, so a new block type needs no change here.

import { Check } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Fragment } from 'react';

import {
  DropdownMenuCheckboxItem,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from '@/components/ui/dropdown-menu';

import type { BlockAction, BlockSection } from './blockActions';

/** One group per section: a small label, then its actions. */
export function BlockActionMenuItems({ sections }: { sections: BlockSection[] }) {
  const t = useTranslations('notes');

  return sections.map(section => (
    <Fragment key={section.id}>
      <DropdownMenuLabel>{t(section.labelKey)}</DropdownMenuLabel>
      {section.actions.map(action => (
        <ActionItem key={action.id} action={action} />
      ))}
    </Fragment>
  ));
}

function ActionItem({ action }: { action: BlockAction }) {
  const t = useTranslations('notes');

  switch (action.type) {
    case 'item':
      return (
        <DropdownMenuItem onSelect={action.onSelect}>
          <action.icon />
          {t(action.labelKey)}
        </DropdownMenuItem>
      );
    case 'toggle':
      return (
        <DropdownMenuCheckboxItem checked={action.checked} onCheckedChange={action.onCheckedChange}>
          {t(action.labelKey)}
        </DropdownMenuCheckboxItem>
      );
    case 'submenu':
      return (
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <action.icon />
            {t(action.labelKey)}
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            {action.options.map(option => (
              <DropdownMenuItem key={option.id} onSelect={option.onSelect}>
                <option.icon data-callout-icon={option.iconTint} />
                {t(option.labelKey)}
                {option.checked && <Check className="ml-auto" />}
              </DropdownMenuItem>
            ))}
          </DropdownMenuSubContent>
        </DropdownMenuSub>
      );
  }
}
