'use client';

import { useDndContext, useDraggable, useDroppable } from '@dnd-kit/core';
import { ChevronRight, Folder, NotepadText } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useRef, useState } from 'react';

import { type FileTreeFolder, type FileTreeNote } from '@/client';
import { InlineRename } from '@/components/shared/InlineRename';
import { formatShortDate } from '@/lib/format';
import { folderHref, noteHref } from '@/lib/routes';
import { cn } from '@/lib/utils';

import { type ChildrenIndex, canDrop, type DraggedItem } from '../lib/fileTree';

import { FolderRowActions, NoteRowActions } from './FileRowActions';

import type { useFileMutations } from '../hooks/useFileMutations';

// ─── Shared types ─────────────────────────────────────────────────────────────

type Mutations = ReturnType<typeof useFileMutations>;

// Unique ID prefixes for dnd-kit draggable / droppable instances.
const dragId = (kind: 'folder' | 'note', id: string) => `drag:${kind}:${id}`;
const dropId = (id: string) => `drop:folder:${id}`;

// How long (ms) the pointer must hover a collapsed folder during a drag before it auto-expands.
const HOVER_TO_OPEN_MS = 600;

// ─── FolderTreeRow ────────────────────────────────────────────────────────────

type FolderTreeRowProps = {
  folder: FileTreeFolder;
  depth: number;
  expanded: Set<string>;
  onToggleExpand: (id: string) => void;
  childrenIndex: ChildrenIndex;
  folders: FileTreeFolder[];
  onPreview: (noteId: string) => void;
  previewId: string | null;
  mutations: Mutations;
  /** Disable DnD entirely on non-desktop viewports. */
  isDesktop: boolean;
};

export function FolderTreeRow({
  folder,
  depth,
  expanded,
  onToggleExpand,
  childrenIndex,
  folders,
  onPreview,
  previewId,
  mutations,
  isDesktop,
}: FolderTreeRowProps) {
  const t = useTranslations();
  const isExpanded = expanded.has(folder.id);
  const [renaming, setRenaming] = useState(false);

  // ── DnD: this row is both draggable and droppable ─────────────────────────
  const dragData: DraggedItem = {
    kind: 'folder',
    id: folder.id,
    parentId: folder.parentId,
    name: folder.name,
  };

  const {
    setNodeRef: setDragRef,
    setActivatorNodeRef,
    attributes,
    listeners,
    isDragging,
  } = useDraggable({
    id: dragId('folder', folder.id),
    data: dragData,
    // No drag while renaming: a space typed in the input would start a keyboard drag.
    disabled: !isDesktop || renaming,
    // Keep the treegrid semantics (dnd-kit sets role="button" by default).
    attributes: { role: 'row' },
  });

  const { setNodeRef: setDropRef, isOver } = useDroppable({
    id: dropId(folder.id),
    data: { folderId: folder.id },
    disabled: !isDesktop,
  });

  // Combine drag and drop refs onto the same DOM element.
  const setRef = useCallback(
    (node: HTMLElement | null) => {
      setDragRef(node);
      setDropRef(node);
      setActivatorNodeRef(node);
    },
    [setDragRef, setDropRef, setActivatorNodeRef]
  );

  // Read the active drag from context to decide if this folder is a valid drop target.
  const { active } = useDndContext();
  const activeDrag = active?.data.current as DraggedItem | undefined;
  const isValidTarget = isDesktop && activeDrag ? canDrop(activeDrag, folder.id, folders) : false;
  // A boolean, not the drag object: dnd-kit gives a new object on renders, which would restart the timer.
  const isDragActive = active != null;

  // Hover-to-open: auto-expand a collapsed folder when the pointer stays over
  // it for HOVER_TO_OPEN_MS during a drag.
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (isOver && isDragActive && !isExpanded && isValidTarget) {
      hoverTimer.current = setTimeout(() => {
        onToggleExpand(folder.id);
      }, HOVER_TO_OPEN_MS);
    } else {
      if (hoverTimer.current) {
        clearTimeout(hoverTimer.current);
        hoverTimer.current = null;
      }
    }
    return () => {
      if (hoverTimer.current) clearTimeout(hoverTimer.current);
    };
  }, [isOver, isDragActive, isExpanded, isValidTarget, folder.id, onToggleExpand]);

  const children = childrenIndex.get(folder.id);
  const childFolders = children?.folders ?? [];
  const childNotes = children?.notes ?? [];

  return (
    <>
      {/* Row */}
      <div
        ref={setRef}
        role="row"
        {...(isDesktop ? attributes : {})}
        {...(isDesktop ? listeners : {})}
        className={cn(
          'group flex items-center gap-2 py-1.5 pr-2 text-sm rounded-md transition-colors cursor-pointer',
          isDragging ? 'opacity-50' : 'hover:bg-accent/30',
          isOver && isValidTarget && 'bg-primary/10 ring-1 ring-primary/40'
        )}
        style={{ paddingLeft: `${depth * 16 + 4}px` }}
        onClick={() => {
          if (!renaming) onToggleExpand(folder.id);
        }}
      >
        {/* Chevron — aria control; click also toggles but row click handles it */}
        <button
          type="button"
          aria-label={t('files.expand_folder')}
          aria-expanded={isExpanded}
          onClick={e => {
            e.stopPropagation();
            onToggleExpand(folder.id);
          }}
          className="flex size-5 shrink-0 items-center justify-center rounded text-muted-foreground hover:text-foreground transition-colors"
        >
          <ChevronRight className={cn('size-3.5 transition-transform duration-150', isExpanded && 'rotate-90')} />
        </button>

        {/* Folder icon */}
        <Folder className="size-4 shrink-0 text-primary/70" />

        {/* Name cell — Link navigates; click stops propagation so the row does not toggle */}
        <div className="flex min-w-0 flex-1 items-center">
          {renaming ? (
            <InlineRename
              initialValue={folder.name}
              maxLength={100}
              onSave={name => {
                setRenaming(false);
                mutations.renameFolder({ id: folder.id, name });
              }}
              onCancel={() => setRenaming(false)}
            />
          ) : (
            <Link
              href={folderHref(folder)}
              className="truncate font-medium text-foreground hover:underline"
              onClick={e => e.stopPropagation()}
            >
              {folder.name}
            </Link>
          )}
        </div>

        {/* Updated column */}
        <span className="hidden shrink-0 text-xs text-muted-foreground sm:block w-24 text-right">
          {formatShortDate(folder.updatedAt)}
        </span>

        {/* Inline actions */}
        <FolderRowActions folder={folder} onStartRename={() => setRenaming(true)} mutations={mutations} />
      </div>

      {/* Expanded children */}
      {isExpanded && (
        <>
          {childFolders.map(child => (
            <FolderTreeRow
              key={child.id}
              folder={child}
              depth={depth + 1}
              expanded={expanded}
              onToggleExpand={onToggleExpand}
              childrenIndex={childrenIndex}
              folders={folders}
              onPreview={onPreview}
              previewId={previewId}
              mutations={mutations}
              isDesktop={isDesktop}
            />
          ))}
          {childNotes.map(note => (
            <NoteTreeRow
              key={note.id}
              note={note}
              depth={depth + 1}
              onPreview={onPreview}
              previewId={previewId}
              mutations={mutations}
              isDesktop={isDesktop}
            />
          ))}
          {childFolders.length === 0 && childNotes.length === 0 && (
            <div className="py-1 text-xs text-muted-foreground" style={{ paddingLeft: `${(depth + 1) * 16 + 28}px` }}>
              {t('files.empty_folder')}
            </div>
          )}
        </>
      )}
    </>
  );
}

// ─── NoteTreeRow ──────────────────────────────────────────────────────────────

type NoteTreeRowProps = {
  note: FileTreeNote;
  depth: number;
  onPreview: (noteId: string) => void;
  previewId: string | null;
  mutations: Mutations;
  isDesktop: boolean;
};

export function NoteTreeRow({ note, depth, onPreview, previewId, mutations, isDesktop }: NoteTreeRowProps) {
  const t = useTranslations();
  const router = useRouter();
  const [renaming, setRenaming] = useState(false);
  const isPreviewed = previewId === note.id;
  const title = note.title.trim() || t('notes.untitled');
  const href = noteHref({ id: note.id, title: note.title });

  const dragData: DraggedItem = {
    kind: 'note',
    id: note.id,
    parentId: note.folderId,
    name: note.title,
  };

  const {
    setNodeRef: setDragRef,
    setActivatorNodeRef,
    attributes,
    listeners,
    isDragging,
  } = useDraggable({
    id: dragId('note', note.id),
    data: dragData,
    // No drag while renaming: a space typed in the input would start a keyboard drag.
    disabled: !isDesktop || renaming,
    // Keep the treegrid semantics (dnd-kit sets role="button" by default).
    attributes: { role: 'row' },
  });

  // The row is the activator node: the keyboard sensor then ignores Enter/Space from child elements.
  const setRef = useCallback(
    (node: HTMLElement | null) => {
      setDragRef(node);
      setActivatorNodeRef(node);
    },
    [setDragRef, setActivatorNodeRef]
  );

  return (
    <div
      ref={setRef}
      role="row"
      {...(isDesktop ? attributes : {})}
      {...(isDesktop ? listeners : {})}
      className={cn(
        'group flex items-center gap-2 py-1.5 pr-2 text-sm rounded-md transition-colors cursor-pointer',
        isDragging ? 'opacity-50' : isPreviewed ? 'bg-muted' : 'hover:bg-accent/30'
      )}
      style={{ paddingLeft: `${depth * 16 + 4}px` }}
      onClick={() => {
        if (!renaming) router.push(href);
      }}
    >
      {/* Spacer matching chevron width (notes have no expand control) */}
      <span className="size-5 shrink-0" />

      {/* Note icon */}
      <NotepadText className="size-4 shrink-0 text-muted-foreground" />

      {/* Name cell */}
      <div className="flex min-w-0 flex-1 items-center">
        {renaming ? (
          <InlineRename
            initialValue={note.title}
            maxLength={200}
            onSave={name => {
              setRenaming(false);
              // version is fetched inside the mutation to avoid needing NoteRead here.
              mutations.renameNote({ id: note.id, name });
            }}
            onCancel={() => setRenaming(false)}
          />
        ) : (
          <Link
            href={href}
            className="truncate font-medium text-foreground hover:underline"
            onClick={e => e.stopPropagation()}
          >
            {title}
          </Link>
        )}
      </div>

      {/* Updated column */}
      <span className="hidden shrink-0 text-xs text-muted-foreground sm:block w-24 text-right">
        {formatShortDate(note.updatedAt)}
      </span>

      <NoteRowActions note={note} onStartRename={() => setRenaming(true)} onPreview={onPreview} mutations={mutations} />
    </div>
  );
}
