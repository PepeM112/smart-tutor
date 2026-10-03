'use client';

// Menus of the table controls: table, column / row, and cell.
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
  Plus,
  Trash2,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useRef } from 'react';

import {
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuPortal,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from '@/components/ui/dropdown-menu';

import { ColorSwatch } from '../NoteBubbleMenu';
import { NOTE_COLORS, type NoteColor } from '../noteColor';

import { runTableCommand } from './runTableCommand';
import { parseTableLayout, type TableLayout } from './tableAttributes';
import {
  buildClearCellsTransaction,
  buildDeleteLineTransaction,
  buildDeleteTableTransaction,
  buildInsertTransaction,
  buildSetCellColorTransaction,
  buildSetLayoutTransaction,
  canDeleteLine,
  canInsertAt,
  readCommonCellColors,
  tableSize,
  type CellColorKey,
  type TableAxis,
  type TableTarget,
} from './tableCommands';

import type { Editor } from '@tiptap/core';

const PALETTE: (NoteColor | null)[] = [null, ...NOTE_COLORS];

// ─── shell ──────────────────────────────────────────────────────────────────

type ShellProps = {
  editor: Editor;
  side: 'bottom' | 'right';
  align: 'start' | 'center';
  children: React.ReactNode;
};

/** Menu box. When the menu closes, the focus goes back to the editor (not to the handle). */
function MenuShell({ editor, side, align, children }: ShellProps) {
  const closedByOutside = useRef(false);
  return (
    <DropdownMenuContent
      side={side}
      align={align}
      sideOffset={6}
      className="w-52"
      onInteractOutside={() => {
        closedByOutside.current = true;
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
      {PALETTE.map(color => (
        <DropdownMenuItem
          key={color ?? 'default'}
          onSelect={() => runTableCommand(editor, state => buildSetCellColorTransaction(state, target, key, color))}
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

// ─── table ──────────────────────────────────────────────────────────────────

type TableMenuProps = { editor: Editor; tablePos: number; layout: TableLayout };

export function TableMenu({ editor, tablePos, layout }: TableMenuProps) {
  const t = useTranslations('notes');
  const size = tableSize(editor.state, tablePos);

  return (
    <MenuShell editor={editor} side="bottom" align="start">
      <DropdownMenuRadioGroup
        value={layout}
        onValueChange={value =>
          runTableCommand(editor, state => buildSetLayoutTransaction(state, tablePos, parseTableLayout(value)))
        }
      >
        <DropdownMenuRadioItem value="compact">{t('table_layout_compact')}</DropdownMenuRadioItem>
        <DropdownMenuRadioItem value="full">{t('table_layout_full')}</DropdownMenuRadioItem>
      </DropdownMenuRadioGroup>
      <DropdownMenuSeparator />
      <DropdownMenuItem
        onSelect={() =>
          runTableCommand(editor, state => buildInsertTransaction(state, tablePos, 'row', size?.rows ?? 0))
        }
      >
        <Plus />
        {t('table_add_row')}
      </DropdownMenuItem>
      <DropdownMenuItem
        onSelect={() =>
          runTableCommand(editor, state => buildInsertTransaction(state, tablePos, 'column', size?.columns ?? 0))
        }
      >
        <Plus />
        {t('table_add_column')}
      </DropdownMenuItem>
      <DropdownMenuSeparator />
      <DropdownMenuItem
        variant="destructive"
        onSelect={() => runTableCommand(editor, state => buildDeleteTableTransaction(state, tablePos))}
      >
        <Trash2 />
        {t('table_delete')}
      </DropdownMenuItem>
    </MenuShell>
  );
}

// ─── column / row ───────────────────────────────────────────────────────────

type LineMenuProps = { editor: Editor; axis: TableAxis; tablePos: number; index: number };

export function LineMenu({ editor, axis, tablePos, index }: LineMenuProps) {
  const t = useTranslations('notes');
  const target: TableTarget = { kind: axis, tablePos, index };
  const isColumn = axis === 'column';

  const insert = (gap: number) => runTableCommand(editor, state => buildInsertTransaction(state, tablePos, axis, gap));
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
      <DropdownMenuItem onSelect={() => runTableCommand(editor, state => buildClearCellsTransaction(state, target))}>
        <Eraser />
        {t('table_clear')}
      </DropdownMenuItem>
      <DropdownMenuItem
        variant="destructive"
        disabled={!canDeleteLine(editor.state, target)}
        onSelect={() => runTableCommand(editor, state => buildDeleteLineTransaction(state, target))}
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
      <DropdownMenuItem onSelect={() => runTableCommand(editor, state => buildClearCellsTransaction(state, target))}>
        <Eraser />
        {t('table_clear')}
      </DropdownMenuItem>
    </MenuShell>
  );
}
