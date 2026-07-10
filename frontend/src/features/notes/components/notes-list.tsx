'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { type ColumnDef } from '@tanstack/react-table';
import { Bot, Download, Pencil, Trash2, User } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';

import { NoteSource, type NoteRead } from '@/client';
import { DataTable } from '@/components/shared/data-table';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { sdk } from '@/lib/api-client';
import { Routes } from '@/lib/routes';

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
  const isAI = source === NoteSource.AI_GENERATED;
  const Icon = isAI ? Bot : User;
  const label = isAI ? 'AI' : 'Manual';

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

const columns: ColumnDef<NoteRead, unknown>[] = [
  {
    accessorKey: 'title',
    header: 'Title',
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
    header: 'Source',
    cell: ({ row }) => <SourceBadge source={row.original.source} />,
  },
  {
    id: 'updated',
    header: 'Updated',
    cell: ({ row }) => <span className="text-sm text-muted-foreground">{formatDate(row.original.updatedAt)}</span>,
  },
  {
    id: 'actions',
    header: '',
    cell: function ActionsCell({ row }) {
      const router = useRouter();
      const queryClient = useQueryClient();
      const { mutate: deleteNote, isPending: isDeleting } = useMutation({
        mutationFn: () => sdk.notesDelete({ path: { note_id: row.original.id } }),
        onSuccess: () => {
          void queryClient.invalidateQueries({ queryKey: ['notes'] });
          toast.success('Note deleted');
        },
        onError: () => toast.error('Failed to delete note'),
      });

      return (
        <div className="flex justify-end gap-1">
          <Button
            variant="ghost"
            size="icon-lg"
            tooltip="Edit"
            onClick={e => {
              e.stopPropagation();
              router.push(Routes.NOTE_DETAIL(row.original.id));
            }}
            aria-label={`Edit ${row.original.title}`}
          >
            <Pencil className="size-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon-lg"
            tooltip="Export"
            onClick={e => {
              e.stopPropagation();
              downloadMarkdown(row.original.title, row.original.content ?? '');
              toast.success('Downloaded');
            }}
            aria-label={`Export ${row.original.title}`}
          >
            <Download className="size-4" />
          </Button>
          <ConfirmDialog
            trigger={
              <Button
                variant="ghost"
                size="icon-lg"
                tooltip="Delete"
                onClick={e => e.stopPropagation()}
                disabled={isDeleting}
                aria-label={`Delete ${row.original.title}`}
              >
                <Trash2 className="size-4" />
              </Button>
            }
            title="Delete note"
            description={`Are you sure you want to delete "${row.original.title}"? This action cannot be undone.`}
            confirmLabel="Delete"
            confirmClassName="bg-destructive text-white hover:bg-destructive/90"
            onConfirm={() => deleteNote()}
          />
        </div>
      );
    },
  },
];

type Props = {
  data: NoteRead[];
};

export function NotesList({ data }: Props) {
  const router = useRouter();

  return (
    <DataTable
      columns={columns}
      data={data}
      emptyMessage="No notes yet. Create your first one!"
      onRowClick={row => router.push(Routes.NOTE_DETAIL(row.id))}
    />
  );
}
