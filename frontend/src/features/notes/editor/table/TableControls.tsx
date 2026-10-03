'use client';

/**
 * Overlay with the controls of the active table (editable editor only):
 *
 *   - table handle   left of the header row         → layout, add row / column, delete table
 *   - "+" bars       right and bottom edge          → add a column / row at the end
 *   - column handle  center of the top border       → click: select + menu, drag: move the column
 *   - row handle     middle of the left border      → click: select + menu, drag: move the row
 *   - cell handle    middle of the right border     → color, clear
 *
 * The column, row and cell handles are small bars (the look of the divider of `SplitPane`) that turn
 * into a grip / dots icon on hover. The button is bigger than the bar, so it is easy to hit.
 *
 * The cell handle sits ON the resize edge of the column. Where the two overlap, the bar wins the click.
 * The resize edge stays free above and below the bar, and in the other rows of the column.
 *
 * The overlay is positioned from the DOM of the table (`useTableOverlay`) and lives next to the
 * editor, so nothing here is part of the document or of the saved markdown.
 * Every action is one transaction, and the focus goes back to the editor after it.
 */

import { EllipsisVertical, GripHorizontal, GripVertical, Plus } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useCallback, useState, type CSSProperties, type RefObject } from 'react';

import { DropdownMenu, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { HoverHint } from '@/components/ui/hover-hint';
import { cn } from '@/lib/utils';

import { runTableCommand } from './runTableCommand';
import {
  buildInsertTransaction,
  buildSelectTransaction,
  minRowGap,
  moveTableLine,
  type TableAxis,
  type TableTarget,
} from './tableCommands';
import { gapOffset, type Band, type TableMeasure } from './tableGeometry';
import { CellMenu, LineMenu, TableMenu } from './TableMenus';
import { useGripDrag } from './useGripDrag';
import { useTableOverlay } from './useTableOverlay';

import type { Editor } from '@tiptap/core';

// ─── sizes (px) ──────────────────────────────────────────────────────────────

const TABLE_HANDLE = 32;
const TABLE_HANDLE_GAP = 12; // between the handle and the table
// Size of the button (the hit area) of the bar handles: bigger than the bar that is drawn.
const GRIP_HIT_LONG = 32;
const GRIP_HIT_SHORT = 18;
// The resize edge of prosemirror-tables is `handleWidth` (5px) on each side of the border: the cell handle
// covers the same width, so the edge is free above and below it.
const CELL_HIT_WIDTH = 10;
const CELL_HIT_HEIGHT = 28;
// The measured edges (`table.top`, `table.left`, the end of a column band) are the OUTER edge of a 1px border.
// The bars are centered on the middle of that border line, not on its outer edge.
const BORDER_CENTER = 0.5;
const BAR = 14;
const BAR_GAP = 4;

// ─── styles ──────────────────────────────────────────────────────────────────

/** Ghost look (the `ghost` variant of `Button`): no background and no ring at rest, muted background on hover and while the menu is open. */
const HANDLE_BASE =
  'pointer-events-auto absolute flex items-center justify-center rounded-md text-muted-foreground transition-colors duration-75 hover:bg-muted hover:text-foreground dark:hover:bg-muted/50 focus-visible:outline-2 focus-visible:outline-primary data-[active=true]:bg-muted data-[active=true]:text-foreground select-none touch-none';

/**
 * The three bar handles share one look. The button is the (transparent) hit area. Inside it, the `span`
 * is a thin pill at rest (tokens of the `SplitPane` divider) and becomes the overlay handle of the
 * design system (popover surface, foreground ring) with its icon on hover, on focus and while its menu is open.
 * The size per axis is in `BAR_*_SIZE`. The class names are written in full, so Tailwind can find them.
 */
const BAR_BUTTON =
  'group/bar pointer-events-auto absolute flex items-center justify-center select-none touch-none focus-visible:outline-none';

const BAR_VISUAL =
  'relative flex items-center justify-center overflow-visible rounded-full bg-background text-muted-foreground ring-1 ring-border transition-[width,height,border-radius,background-color,color,box-shadow] duration-[120ms] ease-out motion-reduce:transition-none group-focus-visible/bar:outline-2 group-focus-visible/bar:outline-primary group-[:is(:hover,:focus-visible,[data-active=true])]/bar:rounded-md group-[:is(:hover,:focus-visible,[data-active=true])]/bar:bg-muted group-[:is(:hover,:focus-visible,[data-active=true])]/bar:text-foreground group-[:is(:hover,:focus-visible,[data-active=true])]/bar:ring-foreground/10';

const BAR_ICON =
  'size-3 shrink-0 opacity-0 transition-opacity duration-[120ms] motion-reduce:transition-none group-[:is(:hover,:focus-visible,[data-active=true])]/bar:opacity-100';

const BAR_COLUMN_SIZE =
  'h-1 w-4 group-[:is(:hover,:focus-visible,[data-active=true])]/bar:h-3.5 group-[:is(:hover,:focus-visible,[data-active=true])]/bar:w-[22px]';
const BAR_ROW_SIZE =
  'h-4 w-1 group-[:is(:hover,:focus-visible,[data-active=true])]/bar:h-[22px] group-[:is(:hover,:focus-visible,[data-active=true])]/bar:w-3.5';
const BAR_CELL_SIZE =
  'h-4 w-1 group-[:is(:hover,:focus-visible,[data-active=true])]/bar:h-[22px] group-[:is(:hover,:focus-visible,[data-active=true])]/bar:w-4';

const BAR_BASE =
  'pointer-events-auto absolute flex items-center justify-center rounded-md bg-muted/70 text-muted-foreground opacity-0 transition-opacity duration-100 hover:bg-muted hover:text-foreground hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-primary pointer-coarse:opacity-100';

const keepEditorFocus = (event: React.MouseEvent) => event.preventDefault();

// ─── component ───────────────────────────────────────────────────────────────

type TableControlsProps = {
  editor: Editor;
  /** The element the editor is rendered in. The overlay is positioned relative to it. */
  containerRef: RefObject<HTMLElement | null>;
};

type DragIndicator = { axis: TableAxis; gap: number };

export function TableControls({ editor, containerRef }: TableControlsProps) {
  const t = useTranslations('notes');
  const { state, lock, unlock } = useTableOverlay(editor, containerRef);
  const [drag, setDrag] = useState<DragIndicator | null>(null);

  const addAtEnd = useCallback(
    (tablePos: number, axis: TableAxis, count: number) => {
      runTableCommand(editor, s => buildInsertTransaction(s, tablePos, axis, count));
      editor.view.focus();
    },
    [editor]
  );

  if (!state) return null;
  // While a column is being resized, the table changes size on every move: show nothing.
  if (state.resizing) return null;

  const { table, hover, selected } = state;
  const column = hover ? hover.col : (selected?.col ?? null);
  const row = hover ? hover.row : (selected?.row ?? null);
  const cell = hover ?? selected?.cell ?? null;
  const lines = !table.hasMergedCells;

  const isColumnVisible = (index: number): boolean => {
    const band = table.columns[index];
    if (!band) return false;
    const center = band.start + band.size / 2;
    return center >= table.clipLeft + GRIP_HIT_LONG / 2 && center <= table.clipRight - GRIP_HIT_LONG / 2;
  };

  const toOffset = (axis: TableAxis) => (event: { clientX: number; clientY: number }) => {
    const box = containerRef.current?.getBoundingClientRect();
    return axis === 'column' ? event.clientX - (box?.left ?? 0) : event.clientY - (box?.top ?? 0);
  };

  const gripProps = (axis: TableAxis) => ({
    editor,
    axis,
    tablePos: table.tablePos,
    lock,
    unlock,
    toOffset: toOffset(axis),
    getBands: (): Band[] => (axis === 'column' ? table.columns : table.rows),
    minGap: axis === 'row' ? minRowGap(editor.state, table.tablePos) : 0,
    onGapChange: (gap: number | null) => setDrag(gap === null ? null : { axis, gap }),
  });

  return (
    <div data-slot="table-controls" className="pointer-events-none absolute inset-0 z-20" contentEditable={false}>
      <TableHandle editor={editor} table={table} lock={lock} unlock={unlock} label={t('table_handle')} />

      <HoverHint label={t('table_add_column')} side="right">
        <button
          type="button"
          aria-label={t('table_add_column')}
          onMouseDown={keepEditorFocus}
          onClick={() => addAtEnd(table.tablePos, 'column', table.columns.length)}
          className={BAR_BASE}
          style={{
            left: Math.min(table.left + table.width, table.clipRight) + BAR_GAP,
            top: table.top,
            width: BAR,
            height: table.height,
          }}
        >
          <Plus className="size-3" />
        </button>
      </HoverHint>

      <HoverHint label={t('table_add_row')} side="bottom">
        <button
          type="button"
          aria-label={t('table_add_row')}
          onMouseDown={keepEditorFocus}
          onClick={() => addAtEnd(table.tablePos, 'row', table.rows.length)}
          className={BAR_BASE}
          style={{
            left: table.clipLeft,
            top: table.top + table.height + BAR_GAP,
            width: table.clipRight - table.clipLeft,
            height: BAR,
          }}
        >
          <Plus className="size-3" />
        </button>
      </HoverHint>

      {lines && column !== null && isColumnVisible(column) && (
        <LineGrip
          {...gripProps('column')}
          index={column}
          table={table}
          active={!!selected?.wholeColumn && selected.col === column}
          label={t('table_column_handle')}
        />
      )}

      {lines && row !== null && table.rows[row] && (
        <LineGrip
          {...gripProps('row')}
          index={row}
          table={table}
          active={!!selected?.wholeRow && selected.row === row}
          label={t('table_row_handle')}
        />
      )}

      {lines && cell && (
        <CellHandle
          editor={editor}
          table={table}
          row={cell.row}
          col={cell.col}
          lock={lock}
          unlock={unlock}
          label={t('table_cell_handle')}
        />
      )}

      {drag && <DropLine table={table} drag={drag} />}
    </div>
  );
}

// ─── table handle ────────────────────────────────────────────────────────────

type MenuLockProps = { lock: () => void; unlock: () => void };

type TableHandleProps = MenuLockProps & { editor: Editor; table: TableMeasure; label: string };

function TableHandle({ editor, table, lock, unlock, label }: TableHandleProps) {
  const [open, setOpen] = useState(false);

  // Left of the header row. On a narrow screen there is no room left of the table: go above it.
  const hasRoomLeft = table.viewportLeft - TABLE_HANDLE - TABLE_HANDLE_GAP >= 4;
  const header = table.rows[0];
  const style: CSSProperties = hasRoomLeft
    ? {
        left: table.left - TABLE_HANDLE - TABLE_HANDLE_GAP,
        top: (header?.start ?? table.top) + ((header?.size ?? TABLE_HANDLE) - TABLE_HANDLE) / 2,
      }
    : { left: table.left, top: table.top - TABLE_HANDLE - TABLE_HANDLE_GAP / 2 };

  return (
    <DropdownMenu
      modal={false}
      open={open}
      onOpenChange={next => {
        setOpen(next);
        if (next) lock();
        else unlock();
      }}
    >
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={label}
          data-active={open}
          onMouseDown={keepEditorFocus}
          className={HANDLE_BASE}
          style={{ ...style, width: TABLE_HANDLE, height: TABLE_HANDLE }}
        >
          <GripVertical className="size-5" />
        </button>
      </DropdownMenuTrigger>
      <TableMenu editor={editor} tablePos={table.tablePos} layout={table.layout} />
    </DropdownMenu>
  );
}

// ─── column / row grip ───────────────────────────────────────────────────────

type LineGripProps = MenuLockProps & {
  editor: Editor;
  axis: TableAxis;
  tablePos: number;
  index: number;
  table: TableMeasure;
  active: boolean;
  label: string;
  toOffset: (event: { clientX: number; clientY: number }) => number;
  getBands: () => Band[];
  minGap: number;
  onGapChange: (gap: number | null) => void;
};

function LineGrip({
  editor,
  axis,
  tablePos,
  index,
  table,
  active,
  label,
  lock,
  unlock,
  toOffset,
  getBands,
  minGap,
  onGapChange,
}: LineGripProps) {
  const [open, setOpen] = useState(false);
  const isColumn = axis === 'column';
  const target: TableTarget = { kind: axis, tablePos, index };
  // The header row stays on top: it is the one line that cannot be dragged.
  const draggable = isColumn ? table.columns.length > 1 : table.rows.length > 1 && !(index === 0 && table.hasHeaderRow);

  const select = useCallback(() => {
    runTableCommand(editor, state => buildSelectTransaction(state, target));
    lock();
    // `target` is rebuilt from `tablePos`, `axis` and `index` on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor, lock, tablePos, axis, index]);

  const changeOpen = (next: boolean) => {
    setOpen(next);
    if (next) select();
    else unlock();
  };

  const handlers = useGripDrag({
    axis,
    draggable,
    isOpen: open,
    getBands,
    minGap,
    toOffset,
    onStart: select,
    onEnd: unlock,
    onGapChange,
    onDrop: gap => {
      moveTableLine(editor.view, tablePos, axis, index, gap);
      editor.view.focus();
    },
    onClick: wasOpen => {
      if (!wasOpen) changeOpen(true);
    },
  });

  const band = (isColumn ? table.columns : table.rows)[index];
  const long = GRIP_HIT_LONG;
  const short = GRIP_HIT_SHORT;
  const style: CSSProperties = isColumn
    ? {
        left: band.start + band.size / 2 - long / 2,
        top: table.top + BORDER_CENTER - short / 2,
        width: long,
        height: short,
      }
    : {
        left: table.left + BORDER_CENTER - short / 2,
        top: band.start + band.size / 2 - long / 2,
        width: short,
        height: long,
      };

  return (
    <DropdownMenu modal={false} open={open} onOpenChange={changeOpen}>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={label}
          data-active={active || open}
          onMouseDown={keepEditorFocus}
          {...handlers}
          className={cn(BAR_BUTTON, draggable ? 'cursor-grab' : 'cursor-pointer')}
          style={style}
        >
          <span className={cn(BAR_VISUAL, isColumn ? BAR_COLUMN_SIZE : BAR_ROW_SIZE)}>
            {isColumn ? <GripHorizontal className={BAR_ICON} /> : <GripVertical className={BAR_ICON} />}
          </span>
        </button>
      </DropdownMenuTrigger>
      <LineMenu editor={editor} axis={axis} tablePos={tablePos} index={index} />
    </DropdownMenu>
  );
}

// ─── cell handle ─────────────────────────────────────────────────────────────

type CellHandleProps = MenuLockProps & {
  editor: Editor;
  table: TableMeasure;
  row: number;
  col: number;
  label: string;
};

function CellHandle({ editor, table, row, col, lock, unlock, label }: CellHandleProps) {
  const [open, setOpen] = useState(false);
  const columnBand = table.columns[col];
  const rowBand = table.rows[row];
  if (!columnBand || !rowBand) return null;

  // Centered on the right border of the cell. Hidden when that border is scrolled out of the wrapper.
  const border = columnBand.start + columnBand.size;
  if (border < table.clipLeft || border > table.clipRight + 1) return null;

  return (
    <DropdownMenu
      modal={false}
      open={open}
      onOpenChange={next => {
        setOpen(next);
        if (next) {
          // Select the cell, so it is highlighted like the column and the row of their handles.
          runTableCommand(editor, state =>
            buildSelectTransaction(state, { kind: 'cell', tablePos: table.tablePos, row, col })
          );
          lock();
        } else unlock();
      }}
    >
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={label}
          data-active={open}
          onMouseDown={keepEditorFocus}
          // The right half of the bar is on the next cell: freeze the hovered cell while the pointer is on the bar.
          onPointerEnter={lock}
          onPointerLeave={() => {
            if (!open) unlock();
          }}
          className={cn(BAR_BUTTON, 'cursor-pointer')}
          style={{
            left: border - BORDER_CENTER - CELL_HIT_WIDTH / 2,
            top: rowBand.start + (rowBand.size - CELL_HIT_HEIGHT) / 2,
            width: CELL_HIT_WIDTH,
            height: CELL_HIT_HEIGHT,
          }}
        >
          <span className={cn(BAR_VISUAL, BAR_CELL_SIZE)}>
            <EllipsisVertical className={BAR_ICON} />
          </span>
        </button>
      </DropdownMenuTrigger>
      <CellMenu editor={editor} tablePos={table.tablePos} row={row} col={col} />
    </DropdownMenu>
  );
}

// ─── drop line ───────────────────────────────────────────────────────────────

function DropLine({ table, drag }: { table: TableMeasure; drag: DragIndicator }) {
  const isColumn = drag.axis === 'column';
  const offset = gapOffset(isColumn ? table.columns : table.rows, drag.gap);
  const style: CSSProperties = isColumn
    ? { left: offset - 1, top: table.top, width: 2, height: table.height }
    : { left: table.left, top: offset - 1, width: table.width, height: 2 };

  return (
    <div data-slot="table-drop-line" className="pointer-events-none absolute rounded-full bg-primary" style={style} />
  );
}
