'use client';

import { Folder, NotepadText } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';

import { type FileTreeFolder, type FileTreeNote } from '@/client';
import { InlineRename } from '@/components/shared/InlineRename';
import { displayTitle } from '@/lib/displayTitle';
import { formatShortDate } from '@/lib/format';
import { NAME_LIMITS } from '@/lib/limits';
import { folderHref, noteHref } from '@/lib/routes';

import { useFilesTree } from '../context/FilesTreeContext';
import { useTreeRowDnd } from '../hooks/useTreeRowDnd';

import { FileRowActions } from './FileRowActions';
import { TreeChevron } from './TreeChevron';
import { TreeRowShell } from './TreeRowShell';

// How long (ms) the pointer must hover a collapsed folder during a drag before it auto-expands.
const HOVER_TO_OPEN_MS = 600;

// ─── FolderTreeRow ────────────────────────────────────────────────────────────

type FolderTreeRowProps = {
  folder: FileTreeFolder;
  depth: number;
};

export function FolderTreeRow({ folder, depth }: FolderTreeRowProps) {
  const { expanded, onToggleExpand, childrenIndex, mutations } = useFilesTree();
  const isExpanded = expanded.has(folder.id);
  const [renaming, setRenaming] = useState(false);

  const children = childrenIndex.get(folder.id);
  const childFolders = children?.folders ?? [];
  const childNotes = children?.notes ?? [];
  // A folder with nothing inside cannot open: no chevron and no toggle on a row click.
  const hasChildren = childFolders.length + childNotes.length > 0;

  // This row is both draggable and droppable.
  const dnd = useTreeRowDnd(
    { kind: 'folder', id: folder.id, parentId: folder.parentId, name: folder.name },
    { droppable: true, renaming }
  );
  const { isOver, isValidTarget, isDragActive } = dnd;

  // Hover-to-open: auto-expand a collapsed folder when the pointer stays over
  // it for HOVER_TO_OPEN_MS during a drag.
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (isOver && isDragActive && !isExpanded && isValidTarget && hasChildren) {
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
  }, [isOver, isDragActive, isExpanded, isValidTarget, hasChildren, folder.id, onToggleExpand]);

  return (
    <>
      <TreeRowShell
        depth={depth}
        dnd={dnd}
        expanded={hasChildren ? isExpanded : undefined}
        onClick={() => {
          if (!renaming && hasChildren) onToggleExpand(folder.id);
        }}
      >
        {/* Chevron — aria control; click also toggles but row click handles it */}
        <TreeChevron hasChildren={hasChildren} expanded={isExpanded} onToggle={() => onToggleExpand(folder.id)} />

        {/* Folder icon */}
        <Folder className="size-4 shrink-0 text-primary/70" />

        {/* Name cell — Link navigates; click stops propagation so the row does not toggle */}
        <div className="flex min-w-0 flex-1 items-center">
          {renaming ? (
            <InlineRename
              initialValue={folder.name}
              maxLength={NAME_LIMITS.folder}
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
        <FileRowActions item={{ kind: 'folder', folder }} onStartRename={() => setRenaming(true)} />
      </TreeRowShell>

      {/* Expanded children */}
      {isExpanded && hasChildren && (
        <>
          {childFolders.map(child => (
            <FolderTreeRow key={child.id} folder={child} depth={depth + 1} />
          ))}
          {childNotes.map(note => (
            <NoteTreeRow key={note.id} note={note} depth={depth + 1} />
          ))}
        </>
      )}
    </>
  );
}

// ─── NoteTreeRow ──────────────────────────────────────────────────────────────

type NoteTreeRowProps = {
  note: FileTreeNote;
  depth: number;
};

export function NoteTreeRow({ note, depth }: NoteTreeRowProps) {
  const t = useTranslations();
  const router = useRouter();
  const { previewId, mutations } = useFilesTree();
  const [renaming, setRenaming] = useState(false);
  const isPreviewed = previewId === note.id;
  const title = displayTitle(note.title, t);
  const href = noteHref({ id: note.id, title: note.title });

  const dnd = useTreeRowDnd(
    { kind: 'note', id: note.id, parentId: note.folderId, name: note.title },
    { droppable: false, renaming }
  );

  return (
    <TreeRowShell
      depth={depth}
      dnd={dnd}
      selected={isPreviewed}
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
            maxLength={NAME_LIMITS.note}
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

      <FileRowActions item={{ kind: 'note', note }} onStartRename={() => setRenaming(true)} />
    </TreeRowShell>
  );
}
