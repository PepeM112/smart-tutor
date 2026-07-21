'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { type ColumnDef } from '@tanstack/react-table';
import { Bot, Download, Pencil, Trash2, User } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useCallback } from 'react';
import { toast } from 'sonner';

import { NoteSource, type NoteRead } from '@/client';
import { DataTable, type MobileAction } from '@/components/shared/data-table';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { sdk } from '@/lib/api-client';
import { Routes } from '@/lib/routes';

type Props = {
  data: NoteRead[];
};

export function NotesList({ data }: Props) {
  const t = useTranslations('notes');
  const tCommon = useTranslations('common');
  const router = useRouter();
  const queryClient = useQueryClient();
  const columns = useNotesColumns();

  const { mutate: deleteNote } = useMutation({
    mutationFn: (id: string) => sdk.notesDelete({ path: { note_id: id } }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['notes'] });
      toast.success(t('note_deleted'));
    },
    onError: () => toast.error(t('failed_to_delete')),
  });

  const renderPreview = useCallback((note: NoteRead) => {
    const preview =
      note.description && note.description.length > 80 ? `${note.description.slice(0, 80)}...` : note.description;
    return (
      <div className="min-w-0">
        <p className="text-sm font-medium text-foreground truncate">{note.title}</p>
        {preview && <p className="mt-0.5 text-xs text-muted-foreground truncate">{preview}</p>}
      </div>
    );
  }, []);

  const renderActions = useCallback(
    (note: NoteRead): MobileAction[] => [
      {
        label: tCommon('edit'),
        icon: Pencil,
        onClick: () => router.push(Routes.NOTE_DETAIL(note.id)),
      },
      {
        label: tCommon('export'),
        icon: Download,
        onClick: () => {
          downloadMarkdown(note.title, note.content ?? '');
          toast.success(tCommon('downloaded'));
        },
      },
      {
        label: tCommon('delete'),
        icon: Trash2,
        variant: 'destructive',
        onClick: () => deleteNote(note.id),
        confirm: {
          title: t('delete_note'),
          description: t('delete_note_confirm', { title: note.title }),
        },
      },
    ],
    [t, tCommon, router, deleteNote]
  );

  return (
    <DataTable
      columns={columns}
      data={data}
      emptyMessage={t('no_notes_yet')}
      onRowClick={row => router.push(Routes.NOTE_DETAIL(row.id))}
      renderPreview={renderPreview}
      expandable={false}
      renderActions={renderActions}
    />
  );
}

function downloadMarkdown(title: string, content: string) {
  const blob = new Blob([content], { type: 'text/markdown' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${title.replace(/[^a-zA-Z0-9-_ ]/g, '')}.md`;
  a.click();
  URL.revokeObjectURL(url);
}

function SourceBadge({ source }: { source: NoteSource }) {
  const t = useTranslations('notes');
  const isAI = source === NoteSource.AI_GENERATED;
  const Icon = isAI ? Bot : User;
  const label = isAI ? t('source_ai') : t('source_manual');

  return (
    <span className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
      <Icon className="size-3.5" />
      {label}
    </span>
  );
}

function formatDate(date: Date): string {
  return new Date(date).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function useNotesColumns(): ColumnDef<NoteRead, unknown>[] {
  const t = useTranslations('notes');

  return [
    {
      accessorKey: 'title',
      header: t('column_title'),
      cell: ({ row }) => {
        const { title, description } = row.original;
        const preview = description && description.length > 80 ? `${description.slice(0, 80)}...` : description;
        return (
          <div className="min-w-0">
            <p className="font-medium text-foreground truncate">{title}</p>
            {preview && <p className="mt-0.5 text-xs text-muted-foreground max-w-xs">{preview}</p>}
          </div>
        );
      },
    },
    {
      id: 'source',
      header: t('column_source'),
      cell: ({ row }) => <SourceBadge source={row.original.source} />,
    },
    {
      id: 'updated',
      header: t('column_updated'),
      cell: ({ row }) => <span className="text-sm text-muted-foreground">{formatDate(row.original.updatedAt)}</span>,
    },
    {
      id: 'actions',
      header: '',
      cell: function ActionsCell({ row }) {
        const t = useTranslations('notes');
        const tCommon = useTranslations('common');
        const router = useRouter();
        const queryClient = useQueryClient();
        const { mutate: deleteNote, isPending: isDeleting } = useMutation({
          mutationFn: () => sdk.notesDelete({ path: { note_id: row.original.id } }),
          onSuccess: () => {
            void queryClient.invalidateQueries({ queryKey: ['notes'] });
            toast.success(t('note_deleted'));
          },
          onError: () => toast.error(t('failed_to_delete')),
        });

        return (
          <div className="flex justify-end gap-1">
            <Button
              variant="ghost"
              size="icon-lg"
              tooltip={tCommon('edit')}
              onClick={e => {
                e.stopPropagation();
                router.push(Routes.NOTE_DETAIL(row.original.id));
              }}
              aria-label={tCommon('edit')}
            >
              <Pencil className="size-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon-lg"
              tooltip={tCommon('export')}
              onClick={e => {
                e.stopPropagation();
                downloadMarkdown(row.original.title, row.original.content ?? '');
                toast.success(tCommon('downloaded'));
              }}
              aria-label={tCommon('export')}
            >
              <Download className="size-4" />
            </Button>
            <ConfirmDialog
              trigger={
                <Button
                  variant="ghost"
                  size="icon-lg"
                  className="text-destructive hover:text-destructive"
                  tooltip={tCommon('delete')}
                  onClick={e => e.stopPropagation()}
                  disabled={isDeleting}
                  aria-label={tCommon('delete')}
                >
                  <Trash2 className="size-4" />
                </Button>
              }
              title={t('delete_note')}
              description={t('delete_note_confirm', { title: row.original.title })}
              confirmLabel={tCommon('delete')}
              confirmClassName="bg-destructive text-white hover:bg-destructive/90"
              onConfirm={() => deleteNote()}
            />
          </div>
        );
      },
    },
  ];
}
