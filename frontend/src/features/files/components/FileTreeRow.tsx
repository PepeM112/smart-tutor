'use client';

import { useQuery } from '@tanstack/react-query';
import { ChevronRight, Folder, NotepadText } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

import { type FolderRead, type NoteRead } from '@/client';
import { InlineRename } from '@/components/shared/InlineRename';
import { sdk } from '@/lib/apiClient';
import { formatShortDate } from '@/lib/format';
import { folderHref, noteHref } from '@/lib/routes';
import { cn } from '@/lib/utils';

import { FolderActionsMenu } from './FolderActionsMenu';
import { NoteActionsMenu } from './NoteActionsMenu';

import type { useFileMutations } from '../hooks/useFileMutations';

// ─── shared types ─────────────────────────────────────────────────────────────

type Mutations = ReturnType<typeof useFileMutations>;

type SharedRowProps = {
  depth: number;
  /** IDs of the expanded folders. */
  expanded: Set<string>;
  onToggleExpand: (id: string) => void;
  onPreview: (noteId: string) => void;
  previewId: string | null;
  mutations: Mutations;
};

// ─── FolderTreeRow ────────────────────────────────────────────────────────────

type FolderTreeRowProps = SharedRowProps & { folder: FolderRead };

export function FolderTreeRow({
  folder,
  depth,
  expanded,
  onToggleExpand,
  onPreview,
  previewId,
  mutations,
}: FolderTreeRowProps) {
  const t = useTranslations();
  const isExpanded = expanded.has(folder.id);
  const [renaming, setRenaming] = useState(false);

  // Lazily fetch children when the row is expanded.
  const { data: contentsRes, isLoading: isLoadingChildren } = useQuery({
    queryKey: ['folders', 'contents', folder.id],
    queryFn: () => sdk.foldersContents({ query: { folder_id: folder.id } }),
    enabled: isExpanded,
  });

  const childFolders = contentsRes?.data?.folders ?? [];
  const childNotes = contentsRes?.data?.notes ?? [];

  return (
    <>
      {/* Row */}
      <div
        role="row"
        className="group flex items-center gap-2 py-1.5 pr-2 text-sm rounded-md hover:bg-accent/30 transition-colors"
        style={{ paddingLeft: `${depth * 16 + 4}px` }}
      >
        {/* Chevron — toggles expansion */}
        <button
          type="button"
          aria-label={t('files.expand_folder')}
          aria-expanded={isExpanded}
          onClick={() => onToggleExpand(folder.id)}
          className="flex size-5 shrink-0 items-center justify-center rounded text-muted-foreground hover:text-foreground transition-colors"
        >
          <ChevronRight className={cn('size-3.5 transition-transform duration-150', isExpanded && 'rotate-90')} />
        </button>

        {/* Folder icon */}
        <Folder className="size-4 shrink-0 text-primary/70" />

        {/* Name cell — either inline rename input or a link */}
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

        {/* Actions: fixed width, so the Updated column lines up in folder and note rows */}
        <div className="flex w-16 shrink-0 items-center justify-end gap-1">
          <FolderActionsMenu
            folder={folder}
            onStartRename={() => setRenaming(true)}
            onTrash={id => mutations.trashFolder(id)}
            isTrashingFolder={mutations.isTrashingFolder}
            moveFolder={mutations.moveFolder}
            isMovingFolder={mutations.isMovingFolder}
          />
        </div>
      </div>

      {/* Expanded children */}
      {isExpanded && (
        <>
          {isLoadingChildren && (
            <div className="py-1 text-xs text-muted-foreground" style={{ paddingLeft: `${(depth + 1) * 16 + 28}px` }}>
              {t('common.loading')}
            </div>
          )}
          {childFolders.map(child => (
            <FolderTreeRow
              key={child.id}
              folder={child}
              depth={depth + 1}
              expanded={expanded}
              onToggleExpand={onToggleExpand}
              onPreview={onPreview}
              previewId={previewId}
              mutations={mutations}
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
            />
          ))}
          {!isLoadingChildren && childFolders.length === 0 && childNotes.length === 0 && (
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
// Notes have no children, so they do not need expanded/onToggleExpand.

type NoteTreeRowProps = {
  note: NoteRead;
  depth: number;
  onPreview: (noteId: string) => void;
  previewId: string | null;
  mutations: Mutations;
};

export function NoteTreeRow({ note, depth, onPreview, previewId, mutations }: NoteTreeRowProps) {
  const t = useTranslations();
  const [renaming, setRenaming] = useState(false);
  const isPreviewed = previewId === note.id;
  const title = note.title.trim() || t('notes.untitled');

  return (
    <div
      role="row"
      className={cn(
        'group flex items-center gap-2 py-1.5 pr-2 text-sm rounded-md transition-colors',
        isPreviewed ? 'bg-muted' : 'hover:bg-accent/30'
      )}
      style={{ paddingLeft: `${depth * 16 + 4}px` }}
    >
      {/* Spacer matching the chevron width for notes (no expand button) */}
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
              mutations.renameNote({ id: note.id, name, version: note.version });
            }}
            onCancel={() => setRenaming(false)}
          />
        ) : (
          <Link href={noteHref(note)} className="truncate font-medium text-foreground hover:underline">
            {title}
          </Link>
        )}
      </div>

      {/* Updated column */}
      <span className="hidden shrink-0 text-xs text-muted-foreground sm:block w-24 text-right">
        {formatShortDate(note.updatedAt)}
      </span>

      <div className="flex w-16 shrink-0 items-center justify-end gap-1">
        <NoteActionsMenu
          note={note}
          onStartRename={() => setRenaming(true)}
          onPreview={onPreview}
          onTrash={id => mutations.trashNote(id)}
          isTrashingNote={mutations.isTrashingNote}
          moveNote={mutations.moveNote}
          isMovingNote={mutations.isMovingNote}
        />
      </div>
    </div>
  );
}
