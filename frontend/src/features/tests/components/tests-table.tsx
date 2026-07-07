'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { type ColumnDef } from '@tanstack/react-table';
import { Copy, Dumbbell, Pencil, Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';

import { type QuestionRead, QuestionType, type TestRead } from '@/client';
import { DataTable } from '@/components/shared/data-table';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { getQuestionTypeInfo } from '@/features/tests/utils/question-icons';
import { sdk } from '@/lib/api-client';
import { Routes } from '@/lib/routes';

function countByType(questions: QuestionRead[], type: QuestionType): number {
  return questions.filter(q => q.questionType === type).length;
}

function QuestionTypeBadge({ type, count }: { type: QuestionType; count: number }) {
  if (count === 0) return null;
  const { icon: Icon, label } = getQuestionTypeInfo(type);
  return (
    <span
      title={`${count} ${label}`}
      className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground"
    >
      <Icon className="size-3.5" />
      {count}
    </span>
  );
}

const columns: ColumnDef<TestRead, unknown>[] = [
  {
    accessorKey: 'title',
    header: 'Title',
    cell: ({ row }) => {
      const { title, description } = row.original;
      return (
        <div className="min-w-0">
          <p className="font-medium text-foreground truncate">{title}</p>
          {description && <p className="mt-0.5 text-xs text-muted-foreground truncate max-w-xs">{description}</p>}
        </div>
      );
    },
  },
  {
    id: 'questions',
    header: 'Questions',
    cell: ({ row }) => {
      const questions = row.original.questions ?? [];
      return <span className="tabular-nums text-muted-foreground">{questions.length}</span>;
    },
  },
  {
    id: 'types',
    header: 'Types',
    cell: ({ row }) => {
      const questions = row.original.questions ?? [];
      const simple = countByType(questions, QuestionType.SIMPLE);
      const mc = countByType(questions, QuestionType.MULTIPLE_CHOICE);
      const longText = countByType(questions, QuestionType.LONG_TEXT);

      if (simple === 0 && mc === 0 && longText === 0) {
        return <span className="text-xs text-muted-foreground/60">--</span>;
      }

      return (
        <div className="flex items-center gap-1.5">
          <QuestionTypeBadge type={QuestionType.SIMPLE} count={simple} />
          <QuestionTypeBadge type={QuestionType.MULTIPLE_CHOICE} count={mc} />
          <QuestionTypeBadge type={QuestionType.LONG_TEXT} count={longText} />
        </div>
      );
    },
  },
  {
    id: 'actions',
    header: '',
    cell: function ActionsCell({ row }) {
      const router = useRouter();
      const queryClient = useQueryClient();
      const { mutate: deleteTest, isPending: isDeleting } = useMutation({
        mutationFn: () => sdk.testsDelete({ path: { test_id: row.original.id } }),
        onSuccess: () => {
          void queryClient.invalidateQueries({ queryKey: ['tests'] });
          toast.success('Test deleted');
        },
        onError: () => toast.error('Failed to delete test'),
      });

      return (
        <div className="flex justify-end gap-1">
          <Button
            variant="ghost"
            size="icon-lg"
            tooltip="Edit"
            onClick={e => {
              e.stopPropagation();
              router.push(Routes.TEST_EDIT(row.original.id));
            }}
            aria-label={`Edit ${row.original.title}`}
          >
            <Pencil className="size-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon-lg"
            tooltip="Copy ID"
            onClick={e => {
              e.stopPropagation();
              void navigator.clipboard.writeText(row.original.id);
              toast.success('Copied');
            }}
            aria-label={`Copy ID of ${row.original.title}`}
          >
            <Copy className="size-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon-lg"
            tooltip="Take test"
            onClick={e => {
              e.stopPropagation();
              router.push(Routes.TEST_DETAIL(row.original.id));
            }}
            aria-label={`Take test ${row.original.title}`}
          >
            <Dumbbell className="size-4" />
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
            title="Delete test"
            description={`Are you sure you want to delete "${row.original.title}"? This action cannot be undone.`}
            confirmLabel="Delete"
            confirmClassName="bg-destructive text-white hover:bg-destructive/90"
            onConfirm={() => deleteTest()}
          />
        </div>
      );
    },
  },
];

type Props = {
  data: TestRead[];
};

export function TestsTable({ data }: Props) {
  const router = useRouter();

  return (
    <DataTable
      columns={columns}
      data={data}
      emptyMessage="No tests yet. Create your first one!"
      onRowClick={row => router.push(Routes.TEST_EDIT(row.id))}
    />
  );
}
