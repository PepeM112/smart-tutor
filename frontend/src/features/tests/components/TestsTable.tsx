'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { type ColumnDef } from '@tanstack/react-table';
import { Copy, Dumbbell, Pencil, Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useCallback } from 'react';
import { toast } from 'sonner';

import { type QuestionRead, QuestionType, type TestRead } from '@/client';
import { DataTableV2, type MobileAction } from '@/components/shared/DataTableV2';
import { type SortDirection, type SortState } from '@/components/shared/SortableHeader';
import { getAllQuestions } from '@/features/tests/utils/questionCounts';
import { getQuestionTypeInfo } from '@/features/tests/utils/questionIcons';
import { sdk } from '@/lib/apiClient';
import { formatShortDate } from '@/lib/format';
import { Routes } from '@/lib/routes';

type Props = {
  data: TestRead[];
  sort?: SortState;
  onSort?: (column: string | null, order: SortDirection) => void;
  onPreview: (id: string) => void;
  previewId: string | null;
};

export function TestsTable({ data, sort, onSort, onPreview, previewId }: Props) {
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

  const columns = useTestsColumns();

  const renderPreview = useCallback((test: TestRead) => {
    const questions = getAllQuestions(test);
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
    (test: TestRead): MobileAction[][] => [
      [
        {
          label: t('common.edit'),
          icon: Pencil,
          onClick: () => router.push(Routes.TEST_EDIT(test.id)),
        },
        {
          label: t('tests.take_test_action'),
          icon: Dumbbell,
          className: 'text-feedback-partial',
          onClick: () => router.push(Routes.TEST_DETAIL(test.id)),
        },
        {
          label: t('tests.copy_id'),
          icon: Copy,
          onClick: () => {
            void navigator.clipboard.writeText(test.id);
            toast.success(t('common.copied'));
          },
        },
      ],
      [
        {
          label: t('common.delete'),
          icon: Trash2,
          variant: 'destructive',
          disabled: deleteIsPending,
          onClick: () => deleteTest(test.id),
          confirm: {
            title: t('tests.delete_test'),
            description: t('tests.delete_test_confirm', { title: test.title }),
          },
        },
      ],
    ],
    [t, router, deleteTest, deleteIsPending]
  );

  return (
    <DataTableV2
      columns={columns}
      data={data}
      sort={sort}
      onSort={onSort}
      emptyMessage={t('tests.no_tests_yet')}
      onRowClick={row => router.push(Routes.TEST_EDIT(row.id))}
      renderPreview={renderPreview}
      renderActions={renderActions}
      getRowId={test => test.id}
      onPreview={test => onPreview(test.id)}
      previewId={previewId}
      renderDescription={test =>
        test.description ? { label: t('tests.column_description'), value: test.description } : undefined
      }
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

function useTestsColumns(): ColumnDef<TestRead, unknown>[] {
  const t = useTranslations();

  return [
    {
      accessorKey: 'title',
      header: t('tests.column_title'),
      meta: { sortKey: 'title', hideOnMobile: true, grow: true },
      cell: ({ row }) => {
        const { title, description } = row.original;
        return (
          <div className="min-w-0">
            <p className="font-medium text-foreground truncate">{title}</p>
            {description && <p className="mt-0.5 text-xs text-muted-foreground truncate">{description}</p>}
          </div>
        );
      },
    },
    {
      id: 'questions',
      header: t('tests.column_questions'),
      meta: { widthClass: 'w-24 text-right' },
      cell: ({ row }) => {
        const questions = getAllQuestions(row.original);
        return <span className="tabular-nums text-muted-foreground">{questions.length}</span>;
      },
    },
    {
      id: 'types',
      header: t('tests.column_types'),
      meta: { widthClass: 'w-40' },
      cell: ({ row }) => {
        const questions = getAllQuestions(row.original);
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
      meta: { sortKey: 'created_at', widthClass: 'w-24 text-right' },
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground">{formatShortDate(row.original.createdAt)}</span>
      ),
    },
  ];
}
