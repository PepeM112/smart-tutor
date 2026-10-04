'use client';

// React NodeView for callouts: the colored box, an icon button that changes the type, and the content.
// Colors are in `note-editor.css` (`.note-callout[data-callout]`), not here.

import { NodeViewContent, NodeViewWrapper, type NodeViewProps } from '@tiptap/react';
import { Info, Lightbulb, MessageSquareWarning, OctagonAlert, TriangleAlert, type LucideIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

import { CALLOUT_TYPES, toCalloutType, type CalloutType } from './calloutTypes';

const CALLOUT_ICONS: Record<CalloutType, LucideIcon> = {
  note: Info,
  tip: Lightbulb,
  important: MessageSquareWarning,
  warning: TriangleAlert,
  caution: OctagonAlert,
};

export function CalloutView({ node, editor, updateAttributes }: NodeViewProps) {
  const t = useTranslations('notes');
  const type = toCalloutType(node.attrs.type);
  const Icon = CALLOUT_ICONS[type];

  return (
    <NodeViewWrapper data-slot="note-callout" data-callout={type} className="note-callout">
      <div contentEditable={false} className="note-callout-icon">
        {editor.isEditable ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                aria-label={t('callout_change_type')}
                // Keep the editor selection while the menu opens.
                onMouseDown={e => e.preventDefault()}
                className="flex size-6 items-center justify-center rounded-md hover:bg-foreground/10"
              >
                <Icon className="size-4" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-40">
              {CALLOUT_TYPES.map(option => {
                const OptionIcon = CALLOUT_ICONS[option];
                return (
                  <DropdownMenuItem key={option} onSelect={() => updateAttributes({ type: option })}>
                    <OptionIcon data-callout-icon={option} className="note-callout-menu-icon" />
                    {t(`callout_${option}`)}
                  </DropdownMenuItem>
                );
              })}
            </DropdownMenuContent>
          </DropdownMenu>
        ) : (
          <Icon className="size-4" />
        )}
      </div>
      <NodeViewContent className="note-callout-body" />
    </NodeViewWrapper>
  );
}
