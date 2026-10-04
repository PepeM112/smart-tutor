'use client';

// Menus of the table controls: column / row, and cell. (The table-level actions are in the block handle menu.)
// Each menu runs commands from `tableCommands.ts` (one transaction each). The commands get a
// `TableTarget`, not the selection, so they act on the line the handle belongs to.

import {
  ArrowDownToLine,
  ArrowLeftToLine,
  ArrowRightToLine,
  ArrowUpToLine,
  Check,
  Eraser,
  Palette,
  Trash2,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useRef } from 'react';

import {
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuPortal,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from '@/components/ui/dropdown-menu';

import { ColorSwatch } from '../ColorSwatch';
import { runEditorCommand } from '../editorCommand';
import { NOTE_PALETTE } from '../noteColor';

import {
  buildClearCellsTransaction,
  buildDeleteLineTransaction,
  buildInsertTransaction,
  buildSetCellColorTransaction,
  canDeleteLine,
  canInsertAt,
  readCommonCellColors,
  type CellColorKey,
  type TableAxis,
  type TableTarget,
} from './tableCommands';

import type { Editor } from '@tiptap/core';

// ─── column / row ───────────────────────────────────────────────────────────

type LineMenuProps = { editor: Editor; axis: TableAxis; tablePos: number; index: number };

export function LineMenu({ editor, axis, tablePos, index }: LineMenuProps) {
  const t = useTranslations('notes');
  const target: TableTarget = { kind: axis, tablePos, index };
  const isColumn = axis === 'column';

  const insert = (gap: number) => runEditorCommand(editor, state => buildInsertTransaction(state, tablePos, axis, gap));
  const canInsert = (gap: number) => canInsertAt(editor.state, tablePos, axis, gap);

  return (
    <MenuShell editor={editor} side={isColumn ? 'bottom' : 'right'} align={isColumn ? 'center' : 'start'}>
      <ColorSubmenu editor={editor} target={target} />
      <DropdownMenuSeparator />
      <DropdownMenuItem disabled={!canInsert(index)} onSelect={() => insert(index)}>
        {isColumn ? <ArrowLeftToLine /> : <ArrowUpToLine />}
        {t(isColumn ? 'table_insert_left' : 'table_insert_above')}
      </DropdownMenuItem>
      <DropdownMenuItem disabled={!canInsert(index + 1)} onSelect={() => insert(index + 1)}>
        {isColumn ? <ArrowRightToLine /> : <ArrowDownToLine />}
        {t(isColumn ? 'table_insert_right' : 'table_insert_below')}
      </DropdownMenuItem>
      <DropdownMenuSeparator />
      <DropdownMenuItem onSelect={() => runEditorCommand(editor, state => buildClearCellsTransaction(state, target))}>
        <Eraser />
        {t('table_clear')}
      </DropdownMenuItem>
      <DropdownMenuItem
        variant="destructive"
        disabled={!canDeleteLine(editor.state, target)}
        onSelect={() => runEditorCommand(editor, state => buildDeleteLineTransaction(state, target))}
      >
        <Trash2 />
        {t(isColumn ? 'table_delete_column' : 'table_delete_row')}
      </DropdownMenuItem>
    </MenuShell>
  );
}

// ─── cell ───────────────────────────────────────────────────────────────────

type CellMenuProps = { editor: Editor; tablePos: number; row: number; col: number };

export function CellMenu({ editor, tablePos, row, col }: CellMenuProps) {
  const t = useTranslations('notes');
  const target: TableTarget = { kind: 'cell', tablePos, row, col };

  return (
    <MenuShell editor={editor} side="bottom" align="start">
      <ColorSubmenu editor={editor} target={target} />
      <DropdownMenuItem onSelect={() => runEditorCommand(editor, state => buildClearCellsTransaction(state, target))}>
        <Eraser />
        {t('table_clear')}
      </DropdownMenuItem>
    </MenuShell>
  );
}

// ─── shell ──────────────────────────────────────────────────────────────────

type ShellProps = {
  editor: Editor;
  side: 'bottom' | 'right';
  align: 'start' | 'center';
  children: React.ReactNode;
};

/**
 * Menu box. When the menu closes, the focus goes back to the editor (not to the handle). A click outside
 * leaves the focus where it lands, but a click on the menu's own handle closes it like Escape.
 */
function MenuShell({ editor, side, align, children }: ShellProps) {
  const closedByOutside = useRef(false);
  const contentRef = useRef<HTMLDivElement>(null);
  return (
    <DropdownMenuContent
      ref={contentRef}
      side={side}
      align={align}
      sideOffset={6}
      className="w-52"
      onInteractOutside={event => {
        const id = contentRef.current?.id;
        const target = event.target instanceof Element ? event.target : null;
        const isOwnTrigger = !!id && target?.closest('[aria-controls]')?.getAttribute('aria-controls') === id;
        closedByOutside.current = !isOwnTrigger;
      }}
      onCloseAutoFocus={event => {
        event.preventDefault();
        if (!closedByOutside.current) editor.view.focus();
        closedByOutside.current = false;
      }}
    >
      {children}
    </DropdownMenuContent>
  );
}

// ─── color ──────────────────────────────────────────────────────────────────

function ColorSubmenu({ editor, target }: { editor: Editor; target: TableTarget }) {
  const t = useTranslations('notes');
  // The content mounts when the menu opens, so this is read from the current document.
  const current = readCommonCellColors(editor.state, target);

  const renderSection = (title: string, key: CellColorKey) => (
    <>
      <DropdownMenuLabel>{title}</DropdownMenuLabel>
      {NOTE_PALETTE.map(color => (
        <DropdownMenuItem
          key={color ?? 'default'}
          onSelect={() => runEditorCommand(editor, state => buildSetCellColorTransaction(state, target, key, color))}
        >
          <ColorSwatch color={key === 'color' ? color : null} bg={key === 'bg' ? color : null} />
          {t(`color_${color ?? 'default'}`)}
          {current[key] === color && <Check className="ml-auto" />}
        </DropdownMenuItem>
      ))}
    </>
  );

  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger>
        <Palette />
        {t('table_color')}
      </DropdownMenuSubTrigger>
      <DropdownMenuPortal>
        <DropdownMenuSubContent className="max-h-[min(24rem,var(--radix-dropdown-menu-content-available-height))] w-48 overflow-y-auto">
          {renderSection(t('color_text'), 'color')}
          <DropdownMenuSeparator />
          {renderSection(t('color_background'), 'bg')}
        </DropdownMenuSubContent>
      </DropdownMenuPortal>
    </DropdownMenuSub>
  );
}
