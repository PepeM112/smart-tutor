'use client';

import {
  type CollisionDetection,
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  type DragEndEvent,
  type DragStartEvent,
  pointerWithin,
  rectIntersection,
  useDndContext,
  useDroppable,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import { Folder, NotepadText } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { type ReactNode, useCallback, useMemo, useState } from 'react';

import { QueryState } from '@/components/shared/QueryState';
import { TreeHeaderRow } from '@/components/shared/tree/TreeHeaderRow';
import { ACTIONS_CELL_WIDTH_CLASS } from '@/components/shared/tree/treeLayout';
import { useBreakpoint } from '@/hooks/useBreakpoint';
import { displayTitle } from '@/lib/displayTitle';
import { cn } from '@/lib/utils';

import { FilesTreeContext, type FilesTreeContextValue } from '../context/FilesTreeContext';
import { useFileMutations } from '../hooks/useFileMutations';
import { useFileTree } from '../hooks/useFileTree';
import { FOLDER_DROP_PREFIX } from '../hooks/useTreeRowDnd';
import { canDrop, type DraggedItem, isDraggedItem, isDropTargetData, type TreeFilter } from '../lib/fileTree';

import { FilesContentResults } from './FilesContentResults';
import { FolderTreeRow, NoteTreeRow } from './FileTreeRow';

/**
 * The view drop zone contains the folder rows, so the pointer is often inside both.
 * A folder row always wins; the view zone ("move out of any folder") is the fallback.
 * The keyboard sensor has no pointer, so it uses the dragged rect instead.
 */
const preferFolderRows: CollisionDetection = args => {
  const hits = args.pointerCoordinates ? pointerWithin(args) : rectIntersection(args);
  const folderHits = hits.filter(hit => String(hit.id).startsWith(FOLDER_DROP_PREFIX));
  return folderHits.length > 0 ? folderHits : hits;
};

// ─── Props ───────────────────────────────────────────────────────────────────

type Props = {
  currentFolderId: string | null;
  onPreview: (noteId: string) => void;
  previewId: string | null;
  /** The search text. Empty = no search. */
  query: string;
  /** The result of `filterTree` for `query` (null = no search). The page computes it once. */
  filter: TreeFilter | null;
};

// ─── FilesTable ───────────────────────────────────────────────────────────────

/**
 * Notion-style tree table for the Files page.
 * Root-level items are taken from `childrenIndex.get(currentFolderId)`.
 * Expanded state is a local immutable Set that never escapes this component. A search opens the folders
 * on the path to a match through `isExpanded`, and never writes them into that Set.
 * DnD (desktop only) uses the full folder list for `canDrop` validation.
 */
export function FilesTable({ currentFolderId, onPreview, previewId, query, filter }: Props) {
  const t = useTranslations();
  const { isDesktop } = useBreakpoint();

  const { folders, childrenIndex, isLoading, isError } = useFileTree();
  const mutations = useFileMutations();

  // Immutable set of expanded folder IDs — toggled by FolderTreeRow through the tree context.
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  // Stable identity: rows use it in the hover-to-open effect deps, so a new function would restart the timer.
  const handleToggleExpand = useCallback((id: string) => {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const forcedExpanded = filter?.forcedExpanded;
  const visibleIds = filter?.visibleIds;
  const isExpanded = useCallback(
    (id: string) => expanded.has(id) || (forcedExpanded?.has(id) ?? false),
    [expanded, forcedExpanded]
  );
  const isVisible = useCallback((id: string) => visibleIds === undefined || visibleIds.has(id), [visibleIds]);

  // Active drag item — tracked to render the DragOverlay and compute valid targets.
  const [activeDrag, setActiveDrag] = useState<DraggedItem | null>(null);

  // ── dnd-kit sensors (desktop only; clicks still work via distance constraint) ──
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor)
  );

  function handleDragStart(event: DragStartEvent) {
    const data: unknown = event.active.data.current;
    setActiveDrag(isDraggedItem(data) ? data : null);
  }

  // Esc (or a lost drag) fires cancel, not end: without this the overlay would stay.
  function handleDragCancel() {
    setActiveDrag(null);
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveDrag(null);
    const { active, over } = event;
    if (!over) return;

    const dragged: unknown = active.data.current;
    const target: unknown = over.data.current;
    if (!isDraggedItem(dragged) || !isDropTargetData(target)) return;
    const targetFolderId = target.folderId;

    if (!canDrop(dragged, targetFolderId, folders)) return;

    if (dragged.kind === 'folder') {
      mutations.moveFolder({ id: dragged.id, targetFolderId });
    } else {
      mutations.moveNote({ id: dragged.id, folderId: targetFolderId });
    }
  }

  // Memoised: rows re-render only when something they read changes.
  const treeContext = useMemo<FilesTreeContextValue>(
    () => ({
      isExpanded,
      isVisible,
      onToggleExpand: handleToggleExpand,
      childrenIndex,
      folders,
      onPreview,
      previewId,
      mutations,
      isDesktop,
    }),
    [isExpanded, isVisible, handleToggleExpand, childrenIndex, folders, onPreview, previewId, mutations, isDesktop]
  );

  // ── Root children ─────────────────────────────────────────────────────────
  const rootChildren = childrenIndex.get(currentFolderId);
  const rootFolders = (rootChildren?.folders ?? []).filter(folder => isVisible(folder.id));
  const rootNotes = (rootChildren?.notes ?? []).filter(note => isVisible(note.id));
  // The view itself is empty (not "the search found nothing").
  const isEmpty = (rootChildren?.folders.length ?? 0) + (rootChildren?.notes.length ?? 0) === 0;
  const hasNoMatches = filter !== null && rootFolders.length === 0 && rootNotes.length === 0;

  // ── Layout ────────────────────────────────────────────────────────────────
  const tableContent = (
    <ViewDropZone currentFolderId={currentFolderId} folders={folders}>
      {/* Tree rows */}
      <div className="py-1">
        {rootFolders.map(folder => (
          <FolderTreeRow key={folder.id} folder={folder} depth={0} />
        ))}
        {rootNotes.map(note => (
          <NoteTreeRow key={note.id} note={note} depth={0} />
        ))}
        {hasNoMatches && (
          <p className="px-2 py-8 text-center text-sm text-muted-foreground">
            {t('files.no_search_results', { query: query.trim() })}
          </p>
        )}
      </div>
      {/* Below the rows, so a late response never moves them. */}
      {filter && <FilesContentResults query={query} folderId={currentFolderId} />}
    </ViewDropZone>
  );

  // Wrap with DndContext; on non-desktop the sensors are no-ops because each
  // row disables useDraggable/useDroppable via the `disabled` prop.
  const content = isEmpty ? (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <Folder className="mb-3 size-10 text-muted-foreground/40" />
      <p className="text-sm text-muted-foreground">
        {currentFolderId ? t('files.empty_folder') : t('files.empty_root')}
      </p>
    </div>
  ) : (
    <DndContext
      sensors={sensors}
      collisionDetection={preferFolderRows}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
    >
      <FilesTreeContext.Provider value={treeContext}>{tableContent}</FilesTreeContext.Provider>

      {/* Drag overlay — shows icon + name of the item being dragged */}
      <DragOverlay>
        {activeDrag && (
          <div className="flex items-center gap-2 rounded-md border border-border bg-card px-2 py-1 text-sm shadow-card">
            {activeDrag.kind === 'folder' ? (
              <Folder className="size-4 shrink-0 text-primary/70" />
            ) : (
              <NotepadText className="size-4 shrink-0 text-muted-foreground" />
            )}
            <span className="max-w-[200px] truncate font-medium">{displayTitle(activeDrag.name, t)}</span>
          </div>
        )}
      </DragOverlay>
    </DndContext>
  );

  return (
    <QueryState className="h-full" isLoading={isLoading} isError={isError} errorMessage={t('files.failed_to_load')}>
      {content}
    </QueryState>
  );
}

// ─── ViewDropZone ─────────────────────────────────────────────────────────────
// The whole table (header, rows and the empty space below) is a drop zone for the folder
// that the view shows (root on /files). A drop anywhere that is not a folder row moves the
// item "out of any folder" to the view level, as if the view was a folder.

type ViewDropZoneProps = {
  currentFolderId: string | null;
  folders: ReturnType<typeof useFileTree>['folders'];
  children: ReactNode;
};

function ViewDropZone({ currentFolderId, folders, children }: ViewDropZoneProps) {
  const t = useTranslations();

  const { setNodeRef, isOver } = useDroppable({
    id: `drop:view:${currentFolderId ?? 'root'}`,
    data: { folderId: currentFolderId },
  });

  // Read the active drag from DnD context to validate the drop target.
  const { active } = useDndContext();
  const dragData: unknown = active?.data.current;
  const isValid = isDraggedItem(dragData) ? canDrop(dragData, currentFolderId, folders) : false;
  const highlight = isOver && isValid;

  return (
    <div
      ref={setNodeRef}
      role="treegrid"
      aria-label={t('files.title')}
      // min-h-full: the empty space below the rows is part of the drop zone too.
      className={cn(
        'min-h-full w-full rounded-md transition-colors',
        highlight && 'bg-primary/5 ring-1 ring-primary/40'
      )}
    >
      <TreeHeaderRow actionsWidthClass={ACTIONS_CELL_WIDTH_CLASS}>
        <span className="flex-1">{highlight ? t('files.drop_here') : t('files.col_name')}</span>
        <span className="hidden w-24 text-right sm:block">{t('notes.column_updated')}</span>
      </TreeHeaderRow>
      {children}
    </div>
  );
}
