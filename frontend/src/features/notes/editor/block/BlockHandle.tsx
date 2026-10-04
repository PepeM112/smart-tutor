'use client';

/**
 * Overlay with the block handle (editable editor only, desktop only): a "+" and a 6-dot grip left of the
 * top-level block under the pointer.
 *
 *   - "+"    adds an empty paragraph below the block and opens the slash menu in it
 *   - grip   click: menu. Drag: move the block, a line shows where it drops.
 *
 * The menu has two groups: the actions of this kind of block (a table, a code block, a callout: see
 * `blockActions.ts`), then the common ones (Turn into, Duplicate, Delete).
 *
 * "Top-level" = a direct child of the document. A list, a quote, a callout, a toggle or a table is one block:
 * it moves as a whole.
 *
 * The overlay is positioned from the DOM (`useBlockOverlay`) and lives next to the editor, so nothing here is part
 * of the document or of the saved Markdown. Every action is one transaction, and the focus goes back to the editor.
 */

import { Selection } from '@tiptap/pm/state';
import {
  Code,
  Copy,
  GripVertical,
  Heading1,
  Heading2,
  Heading3,
  Info,
  List,
  ListCollapse,
  ListOrdered,
  ListTodo,
  Pilcrow,
  Plus,
  Quote,
  Repeat2,
  Trash2,
  type LucideIcon,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useId, useRef, useState, type CSSProperties, type RefObject } from 'react';

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { HoverHint } from '@/components/ui/hover-hint';
import { cn } from '@/lib/utils';

import { useGripDrag } from '../table/useGripDrag';

import { BlockActionMenuItems } from './BlockActionMenuItems';
import { getBlockSections, hasTurnInto } from './blockActions';
import {
  buildDeleteBlockTransaction,
  buildDuplicateBlockTransaction,
  buildInsertSlashBelowTransaction,
  buildMoveBlockTransaction,
  buildSelectBlockTransaction,
  buildTurnIntoTransaction,
  canTurnInto,
  type TurnIntoKind,
} from './blockCommands';
import { gapLineOffset } from './blockGeometry';
import { useBlockOverlay, type BlockOverlay, type BlockState } from './useBlockOverlay';

import type { Editor } from '@tiptap/core';
import type { EditorState, Transaction } from '@tiptap/pm/state';

// ─── sizes (px) ──────────────────────────────────────────────────────────────

const BUTTON = 24;
const HANDLE_WIDTH = BUTTON * 2;
const HANDLE_GAP = 8; // between the handle and the block
const VIEWPORT_MARGIN = 4;

// ─── styles ──────────────────────────────────────────────────────────────────

/** Ghost look (the `ghost` variant of `Button`), the same as the table handle. */
const HANDLE_BUTTON =
  'flex size-6 items-center justify-center rounded-md text-muted-foreground transition-colors duration-75 hover:bg-muted hover:text-foreground dark:hover:bg-muted/50 focus-visible:outline-2 focus-visible:outline-primary data-[active=true]:bg-muted data-[active=true]:text-foreground select-none touch-none';

const keepEditorFocus = (event: React.MouseEvent) => event.preventDefault();

// ─── turn into ───────────────────────────────────────────────────────────────

/** The labels are the ones of the slash menu: the same blocks, the same names. */
const TURN_INTO_ITEMS: { kind: TurnIntoKind; labelKey: string; icon: LucideIcon }[] = [
  { kind: 'paragraph', labelKey: 'slash_text', icon: Pilcrow },
  { kind: 'heading1', labelKey: 'slash_h1', icon: Heading1 },
  { kind: 'heading2', labelKey: 'slash_h2', icon: Heading2 },
  { kind: 'heading3', labelKey: 'slash_h3', icon: Heading3 },
  { kind: 'bulletList', labelKey: 'slash_bullet', icon: List },
  { kind: 'orderedList', labelKey: 'slash_ordered', icon: ListOrdered },
  { kind: 'taskList', labelKey: 'slash_todo', icon: ListTodo },
  { kind: 'blockquote', labelKey: 'slash_quote', icon: Quote },
  { kind: 'codeBlock', labelKey: 'slash_code', icon: Code },
  { kind: 'callout', labelKey: 'slash_callout', icon: Info },
  { kind: 'toggle', labelKey: 'slash_toggle', icon: ListCollapse },
];

/** Dispatch the transaction of a command. A command that has nothing to do returns `null`. */
function runBlockCommand(editor: Editor, build: (state: EditorState) => Transaction | null): void {
  if (editor.isDestroyed) return;
  const tr = build(editor.state);
  if (tr) editor.view.dispatch(tr);
}

// ─── component ───────────────────────────────────────────────────────────────

type BlockHandleProps = {
  editor: Editor;
  /** The element the editor is rendered in. The overlay is positioned relative to it. */
  containerRef: RefObject<HTMLElement | null>;
};

type DropLine = { top: number; left: number; width: number };

export function BlockHandle({ editor, containerRef }: BlockHandleProps) {
  const overlay = useBlockOverlay(editor, containerRef);
  const [dropLine, setDropLine] = useState<DropLine | null>(null);

  return (
    // Desktop only: touch has no hover, and below `md` the margin left of the text is too narrow.
    <div
      data-slot="block-handle"
      className="pointer-events-none absolute inset-0 z-20 hidden md:block pointer-coarse:hidden"
      contentEditable={false}
    >
      {overlay.state && (
        <HandleControls
          editor={editor}
          containerRef={containerRef}
          overlay={overlay}
          state={overlay.state}
          onDropLineChange={setDropLine}
        />
      )}
      {dropLine && (
        <div
          aria-hidden
          className="absolute h-0.5 -translate-y-1/2 rounded-full bg-primary"
          style={{ top: dropLine.top, left: dropLine.left, width: dropLine.width }}
        />
      )}
    </div>
  );
}

// ─── handle: "+" and grip ────────────────────────────────────────────────────

type HandleControlsProps = {
  editor: Editor;
  containerRef: RefObject<HTMLElement | null>;
  overlay: BlockOverlay;
  state: BlockState;
  onDropLineChange: (line: DropLine | null) => void;
};

function HandleControls({ editor, containerRef, overlay, state, onDropLineChange }: HandleControlsProps) {
  const t = useTranslations('notes');
  const { lock, unlock } = overlay;
  const owner = useId();
  // Hover lock: the handle can be taller than a short block (a divider), so the pointer on the handle would
  // otherwise move to the block next to it.
  const [menuOpen, setMenuOpen] = useState(false);
  const gestureActive = useRef(false);

  const containerViewportLeft = state.viewportLeft - state.left;
  const left = Math.max(state.left - HANDLE_GAP - HANDLE_WIDTH, VIEWPORT_MARGIN - containerViewportLeft);
  const style: CSSProperties = { left, top: state.centerY - BUTTON / 2, width: HANDLE_WIDTH, height: BUTTON };

  return (
    <div
      className="pointer-events-auto absolute flex"
      style={style}
      onPointerEnter={() => lock(owner, { ifFree: true })}
      onPointerLeave={() => {
        if (!menuOpen && !gestureActive.current) unlock(owner);
      }}
    >
      <HoverHint label={t('block_add')} side="top">
        <button
          type="button"
          aria-label={t('block_add')}
          onMouseDown={keepEditorFocus}
          onClick={() => {
            runBlockCommand(editor, s => buildInsertSlashBelowTransaction(s, state.pos));
            editor.view.focus();
          }}
          className={HANDLE_BUTTON}
        >
          <Plus className="size-4" />
        </button>
      </HoverHint>
      <BlockGrip
        editor={editor}
        containerRef={containerRef}
        overlay={overlay}
        state={state}
        owner={owner}
        open={menuOpen}
        onOpenChange={setMenuOpen}
        onGestureChange={active => {
          gestureActive.current = active;
        }}
        onDropLineChange={onDropLineChange}
        label={t('block_handle')}
      />
    </div>
  );
}

// ─── grip ────────────────────────────────────────────────────────────────────

type BlockGripProps = {
  editor: Editor;
  containerRef: RefObject<HTMLElement | null>;
  overlay: BlockOverlay;
  state: BlockState;
  owner: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onGestureChange: (active: boolean) => void;
  onDropLineChange: (line: DropLine | null) => void;
  label: string;
};

function BlockGrip({
  editor,
  containerRef,
  overlay,
  state,
  owner,
  open,
  onOpenChange,
  onGestureChange,
  onDropLineChange,
  label,
}: BlockGripProps) {
  const { lock, unlock, getBands } = overlay;
  // The menu closed without an action: the selection that the menu changed goes back.
  const actionRan = useRef(false);
  const savedSelection = useRef<unknown>(null);

  const changeOpen = (next: boolean) => {
    onOpenChange(next);
    if (next) {
      actionRan.current = false;
      savedSelection.current = editor.state.selection.toJSON();
      // The whole block is selected while its menu is open, so it is clear which block the menu acts on.
      runBlockCommand(editor, s => buildSelectBlockTransaction(s, state.pos));
      lock(owner);
      return;
    }
    // A pointer down on the grip of an open menu makes Radix close it. That must not unlock during a gesture:
    // `onEnd` unlocks.
    if (!isGestureActive()) unlock(owner);
    restoreSelection();
  };

  const restoreSelection = () => {
    const saved = savedSelection.current;
    savedSelection.current = null;
    if (!saved || actionRan.current || editor.isDestroyed) return;
    try {
      editor.view.dispatch(editor.state.tr.setSelection(Selection.fromJSON(editor.state.doc, saved)));
    } catch {
      // The document changed under the saved selection: leave the block selection.
    }
  };

  const toOffset = (event: { clientX: number; clientY: number }) =>
    event.clientY - (containerRef.current?.getBoundingClientRect().top ?? 0);

  const { handlers, isActive: isGestureActive } = useGripDrag({
    axis: 'row',
    draggable: true,
    isOpen: open,
    getBands,
    minGap: 0,
    toOffset,
    onStart: () => {
      onGestureChange(true);
      lock(owner);
    },
    onEnd: () => {
      onGestureChange(false);
      unlock(owner);
    },
    onGapChange: gap => {
      const box = containerRef.current?.getBoundingClientRect();
      const content = editor.view.dom.getBoundingClientRect();
      onDropLineChange(
        gap === null || !box
          ? null
          : { top: gapLineOffset(getBands(), gap), left: content.left - box.left, width: content.width }
      );
    },
    onDrop: gap => {
      runBlockCommand(editor, s => buildMoveBlockTransaction(s, state.pos, gap));
      editor.view.focus();
    },
    onClick: wasOpen => {
      if (!wasOpen) changeOpen(true);
    },
  });

  return (
    <DropdownMenu modal={false} open={open} onOpenChange={changeOpen}>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={label}
          data-active={open}
          onMouseDown={keepEditorFocus}
          {...handlers}
          className={cn(HANDLE_BUTTON, 'cursor-grab')}
        >
          <GripVertical className="size-4" />
        </button>
      </DropdownMenuTrigger>
      <BlockMenu
        editor={editor}
        pos={state.pos}
        onAction={() => {
          actionRan.current = true;
        }}
      />
    </DropdownMenu>
  );
}

// ─── menu ────────────────────────────────────────────────────────────────────

type BlockMenuProps = { editor: Editor; pos: number; onAction: () => void };

function BlockMenu({ editor, pos, onAction }: BlockMenuProps) {
  const t = useTranslations('notes');
  const closedByOutside = useRef(false);
  const contentRef = useRef<HTMLDivElement>(null);
  const node = editor.state.doc.nodeAt(pos);

  const run = (build: (state: EditorState) => Transaction | null) => {
    onAction();
    runBlockCommand(editor, build);
  };

  // Group 1: the actions of this kind of block. Group 2: the common ones.
  const sections = node ? getBlockSections({ editor, node, pos, run, t }) : [];

  return (
    <DropdownMenuContent
      ref={contentRef}
      side="bottom"
      align="start"
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
      {sections.length > 0 && (
        <>
          <BlockActionMenuItems sections={sections} />
          <DropdownMenuSeparator />
        </>
      )}
      {node && hasTurnInto(node) && (
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <Repeat2 />
            {t('block_turn_into')}
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            {TURN_INTO_ITEMS.map(({ kind, labelKey, icon: Icon }) => (
              <DropdownMenuItem
                key={kind}
                disabled={!canTurnInto(node, kind)}
                onSelect={() => run(s => buildTurnIntoTransaction(s, pos, kind))}
              >
                <Icon />
                {t(labelKey)}
              </DropdownMenuItem>
            ))}
          </DropdownMenuSubContent>
        </DropdownMenuSub>
      )}
      <DropdownMenuItem onSelect={() => run(s => buildDuplicateBlockTransaction(s, pos))}>
        <Copy />
        {t('block_duplicate')}
      </DropdownMenuItem>
      <DropdownMenuSeparator />
      <DropdownMenuItem variant="destructive" onSelect={() => run(s => buildDeleteBlockTransaction(s, pos))}>
        <Trash2 />
        {t('block_delete')}
      </DropdownMenuItem>
    </DropdownMenuContent>
  );
}
