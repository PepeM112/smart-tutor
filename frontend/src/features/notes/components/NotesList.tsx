'use client';

import { type ColumnDef } from '@tanstack/react-table';
import { Bot, Download, Pencil, Trash2, User } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';

import { NoteSource, type FileTreeFolder, type NoteRead } from '@/client';
import { DataTable, type MobileAction } from '@/components/shared/DataTable';
import { type SortDirection, type SortState } from '@/components/shared/SortableHeader';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { useFileMutations } from '@/features/files/hooks/useFileMutations';
import { useFolders } from '@/features/files/hooks/useFolders';
import { displayTitle } from '@/lib/displayTitle';
import { formatShortDate } from '@/lib/format';
import { folderHref, noteHref } from '@/lib/routes';

import { exportNote } from '../lib/exportNote';

type Props = {
  data: NoteRead[];
  sort?: SortState;
  onSort?: (column: string | null, order: SortDirection) => void;
};

export function NotesList({ data, sort, onSort }: Props) {
  const t = useTranslations();
  const noteTitle = useNoteTitle();
  const router = useRouter();

  const { foldersById } = useFolders();

  // No note editor is open on the notes list, so it is safe to refetch the list now.
  const { trashNote: deleteNote, isTrashingNote: isDeleting } = useFileMutations({ refetchNotes: true });

  const handleExport = (note: NoteRead) => {
    exportNote(noteTitle(note), note.content ?? '');
    toast.success(t('common.downloaded'));
  };

  const columns = useNotesColumns({ deleteNote, isDeleting, foldersById, onExport: handleExport });

  // No memoization: `noteTitle` is a new function on every render, so it would never hold.
  const renderPreview = (note: NoteRead) => (
    <div className="min-w-0">
      <p className="text-sm font-medium text-foreground truncate">{noteTitle(note)}</p>
    </div>
  );

  const renderActions = (note: NoteRead): MobileAction[] => [
    {
      label: t('common.edit'),
      icon: Pencil,
      onClick: () => router.push(noteHref(note)),
    },
    {
      label: t('common.export'),
      icon: Download,
      onClick: () => handleExport(note),
    },
    {
      label: t('files.move_to_trash'),
      icon: Trash2,
      onClick: () => deleteNote(note.id),
      confirm: {
        title: t('files.move_to_trash'),
        description: t('notes.move_to_trash_confirm', { title: noteTitle(note) }),
      },
    },
  ];

  return (
    <DataTable
      columns={columns}
      data={data}
      sort={sort}
      onSort={onSort}
      emptyMessage={t('notes.no_notes_yet')}
      onRowClick={row => router.push(noteHref(row))}
      renderPreview={renderPreview}
      expandable={false}
      renderActions={renderActions}
    />
  );
}

/** A new note has an empty title (the editor shows "Untitled" only as a placeholder). */
function useNoteTitle(): (note: NoteRead) => string {
  const t = useTranslations();
  return note => displayTitle(note.title, t);
}

function SourceBadge({ source }: { source: NoteSource }) {
  const t = useTranslations();
  const isAI = source === NoteSource.AI_GENERATED;
  const Icon = isAI ? Bot : User;
  const label = isAI ? t('notes.source_ai') : t('notes.source_manual');

  return (
    <span className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
      <Icon className="size-3.5" />
      {label}
    </span>
  );
}

type ColumnDeps = {
  deleteNote: (id: string) => void;
  isDeleting: boolean;
  foldersById: Map<string, FileTreeFolder>;
  onExport: (note: NoteRead) => void;
};

function useNotesColumns({
  deleteNote,
  isDeleting,
  foldersById,
  onExport,
}: ColumnDeps): ColumnDef<NoteRead, unknown>[] {
  const t = useTranslations();
  const noteTitle = useNoteTitle();
  const router = useRouter();

  return [
    {
      accessorKey: 'title',
      header: t('notes.column_title'),
      meta: { sortKey: 'title' },
      cell: ({ row }) => (
        <div className="min-w-0">
          <p className="font-medium text-foreground truncate">{noteTitle(row.original)}</p>
        </div>
      ),
    },
    {
      id: 'folder',
      header: t('files.folder_column'),
      cell: ({ row }) => {
        const folder = row.original.folderId ? foldersById.get(row.original.folderId) : null;
        if (!folder) return <span className="text-sm text-muted-foreground">{t('files.no_folder')}</span>;
        return (
          <Link
            href={folderHref(folder)}
            className="text-sm text-foreground hover:underline truncate max-w-[140px] block"
            onClick={e => e.stopPropagation()}
          >
            {folder.name}
          </Link>
        );
      },
    },
    {
      id: 'source',
      header: t('notes.column_source'),
      cell: ({ row }) => <SourceBadge source={row.original.source} />,
    },
    {
      id: 'updated',
      header: t('notes.column_updated'),
      meta: { sortKey: 'updated_at' },
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground">{formatShortDate(row.original.updatedAt)}</span>
      ),
    },
    {
      id: 'actions',
      header: '',
      cell: ({ row }) => (
        <div className="flex justify-end gap-1">
          <Button
            variant="ghost"
            size="icon-lg"
            tooltip={t('common.edit')}
            onClick={e => {
              e.stopPropagation();
              router.push(noteHref(row.original));
            }}
            aria-label={t('common.edit')}
          >
            <Pencil className="size-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon-lg"
            tooltip={t('common.export')}
            onClick={e => {
              e.stopPropagation();
              onExport(row.original);
            }}
            aria-label={t('common.export')}
          >
            <Download className="size-4" />
          </Button>
          <ConfirmDialog
            trigger={
              <Button
                variant="ghost"
                size="icon-lg"
                tooltip={t('files.move_to_trash')}
                onClick={e => e.stopPropagation()}
                disabled={isDeleting}
                aria-label={t('files.move_to_trash')}
              >
                <Trash2 className="size-4" />
              </Button>
            }
            title={t('files.move_to_trash')}
            description={t('notes.move_to_trash_confirm', { title: noteTitle(row.original) })}
            confirmLabel={t('files.move_to_trash')}
            onConfirm={() => deleteNote(row.original.id)}
          />
        </div>
      ),
    },
  ];
}
