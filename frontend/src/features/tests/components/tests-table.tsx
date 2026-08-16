'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { type ColumnDef } from '@tanstack/react-table';
import { Copy, Dumbbell, Pencil, Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useCallback } from 'react';
import { toast } from 'sonner';

import { type QuestionRead, QuestionType, type TestRead } from '@/client';
import { DataTable, type MobileAction } from '@/components/shared/data-table';
import { type SortDirection, type SortState } from '@/components/shared/sortable-header';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { getQuestionTypeInfo } from '@/features/tests/utils/question-icons';
import { sdk } from '@/lib/api-client';
import { formatShortDate } from '@/lib/format';
import { Routes } from '@/lib/routes';

type Props = {
  data: TestRead[];
  sort?: SortState;
  onSort?: (column: string | null, order: SortDirection) => void;
};

export function TestsTable({ data, sort, onSort }: Props) {
  const t = useTranslations();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { mutate: deleteTest, isPending: deleteIsPending } = useMutation({
    mutationFn: (id: string) => sdk.testsDelete({ path: { test_id: id } }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['tests'] });
      toast.success(t('tests.test_deleted'));
    },
    onError: () => toast.error(t('tests.failed_to_delete')),
  });

  const columns = useTestsColumns({ deleteTest, isDeleting: deleteIsPending });

  const renderPreview = useCallback((test: TestRead) => {
    const questions = test.questions ?? [];
    const simple = countByType(questions, QuestionType.SIMPLE);
    const mc = countByType(questions, QuestionType.MULTIPLE_CHOICE);
    const longText = countByType(questions, QuestionType.LONG_TEXT);

    return (
      <div className="min-w-0">
        <p className="text-sm font-medium text-foreground truncate">{test.title}</p>
        {test.description && <p className="mt-0.5 text-xs text-muted-foreground truncate">{test.description}</p>}
        {questions.length > 0 && (
          <div className="flex items-center gap-1.5 mt-1.5">
            <QuestionTypeBadge type={QuestionType.SIMPLE} count={simple} />
            <QuestionTypeBadge type={QuestionType.MULTIPLE_CHOICE} count={mc} />
            <QuestionTypeBadge type={QuestionType.LONG_TEXT} count={longText} />
          </div>
        )}
      </div>
    );
  }, []);

  const renderActions = useCallback(
    (test: TestRead): MobileAction[] => [
      {
        label: t('common.edit'),
        icon: Pencil,
        onClick: () => router.push(Routes.TEST_EDIT(test.id)),
      },
      {
        label: t('tests.copy_id'),
        icon: Copy,
        onClick: () => {
          void navigator.clipboard.writeText(test.id);
          toast.success(t('common.copied'));
        },
      },
      {
        label: t('tests.take_test_action'),
        icon: Dumbbell,
        onClick: () => router.push(Routes.TEST_DETAIL(test.id)),
      },
      {
        label: t('common.delete'),
        icon: Trash2,
        variant: 'destructive',
        onClick: () => deleteTest(test.id),
        confirm: {
          title: t('tests.delete_test'),
          description: t('tests.delete_test_confirm', { title: test.title }),
        },
      },
    ],
    [t, router, deleteTest]
  );

  return (
    <DataTable
      columns={columns}
      data={data}
      sort={sort}
      onSort={onSort}
      emptyMessage={t('tests.no_tests_yet')}
      onRowClick={row => router.push(Routes.TEST_EDIT(row.id))}
      renderPreview={renderPreview}
      renderActions={renderActions}
    />
  );
}

function countByType(questions: QuestionRead[], type: QuestionType): number {
  return questions.filter(q => q.questionType === type).length;
}

function QuestionTypeBadge({ type, count }: { type: QuestionType; count: number }) {
  const t = useTranslations();
  if (count === 0) return null;
  const { icon: Icon, labelKey } = getQuestionTypeInfo(type);
  return (
    <span
      title={`${count} ${t(labelKey)}`}
      className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground"
    >
      <Icon className="size-3.5" />
      {count}
    </span>
  );
}

type ColumnDeps = {
  deleteTest: (id: string) => void;
  isDeleting: boolean;
};

function useTestsColumns({ deleteTest, isDeleting }: ColumnDeps): ColumnDef<TestRead, unknown>[] {
  const t = useTranslations();
  const router = useRouter();

  return [
    {
      accessorKey: 'title',
      header: t('tests.column_title'),
      meta: { sortKey: 'title' },
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
      header: t('tests.column_questions'),
      cell: ({ row }) => {
        const questions = row.original.questions ?? [];
        return <span className="tabular-nums text-muted-foreground">{questions.length}</span>;
      },
    },
    {
      id: 'types',
      header: t('tests.column_types'),
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
      id: 'created',
      header: t('tests.column_created'),
      meta: { sortKey: 'created_at' },
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground">{formatShortDate(row.original.createdAt)}</span>
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
              router.push(Routes.TEST_EDIT(row.original.id));
            }}
            aria-label={t('common.edit')}
          >
            <Pencil className="size-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon-lg"
            tooltip={t('tests.copy_id')}
            onClick={e => {
              e.stopPropagation();
              void navigator.clipboard.writeText(row.original.id);
              toast.success(t('common.copied'));
            }}
            aria-label={t('tests.copy_id')}
          >
            <Copy className="size-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon-lg"
            className="text-feedback-partial hover:text-feedback-partial"
            tooltip={t('tests.take_test_action')}
            onClick={e => {
              e.stopPropagation();
              router.push(Routes.TEST_DETAIL(row.original.id));
            }}
            aria-label={t('tests.take_test_action')}
          >
            <Dumbbell className="size-4" />
          </Button>
          <ConfirmDialog
            trigger={
              <Button
                variant="ghost"
                size="icon-lg"
                className="text-destructive hover:text-destructive"
                tooltip={t('common.delete')}
                onClick={e => e.stopPropagation()}
                disabled={isDeleting}
                aria-label={t('common.delete')}
              >
                <Trash2 className="size-4" />
              </Button>
            }
            title={t('tests.delete_test')}
            description={t('tests.delete_test_confirm', { title: row.original.title })}
            confirmLabel={t('common.delete')}
            confirmClassName="bg-destructive text-white hover:bg-destructive/90"
            onConfirm={() => deleteTest(row.original.id)}
          />
        </div>
      ),
    },
  ];
}
