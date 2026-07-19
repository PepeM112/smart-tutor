'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { type ColumnDef } from '@tanstack/react-table';
import { Copy, Dumbbell, Pencil, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';

import { type QuestionRead, QuestionType, type TestRead } from '@/client';
import { DataTable } from '@/components/shared/data-table';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { getQuestionTypeInfo } from '@/features/tests/utils/question-icons';
import { sdk } from '@/lib/api-client';
import { Routes } from '@/lib/routes';

type Props = {
  data: TestRead[];
};

export function TestsTable({ data }: Props) {
  const t = useTranslations('tests');
  const router = useRouter();
  const columns = useTestsColumns();

  return (
    <DataTable
      columns={columns}
      data={data}
      emptyMessage={t('no_tests_yet')}
      onRowClick={row => router.push(Routes.TEST_EDIT(row.id))}
    />
  );
}

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

function useTestsColumns(): ColumnDef<TestRead, unknown>[] {
  const t = useTranslations('tests');
  const tCommon = useTranslations('common');

  return [
    {
      accessorKey: 'title',
      header: t('column_title'),
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
      header: t('column_questions'),
      cell: ({ row }) => {
        const questions = row.original.questions ?? [];
        return <span className="tabular-nums text-muted-foreground">{questions.length}</span>;
      },
    },
    {
      id: 'types',
      header: t('column_types'),
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
        const t = useTranslations('tests');
        const tCommon = useTranslations('common');
        const router = useRouter();
        const queryClient = useQueryClient();
        const { mutate: deleteTest, isPending: isDeleting } = useMutation({
          mutationFn: () => sdk.testsDelete({ path: { test_id: row.original.id } }),
          onSuccess: () => {
            void queryClient.invalidateQueries({ queryKey: ['tests'] });
            toast.success(t('test_deleted'));
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
                router.push(Routes.TEST_EDIT(row.original.id));
              }}
              aria-label={`Edit ${row.original.title}`}
            >
              <Pencil className="size-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon-lg"
              tooltip={t('copy_id')}
              onClick={e => {
                e.stopPropagation();
                void navigator.clipboard.writeText(row.original.id);
                toast.success(tCommon('copied'));
              }}
              aria-label={`Copy ID of ${row.original.title}`}
            >
              <Copy className="size-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon-lg"
              tooltip={t('take_test_action')}
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
                  tooltip={tCommon('delete')}
                  onClick={e => e.stopPropagation()}
                  disabled={isDeleting}
                  aria-label={`Delete ${row.original.title}`}
                >
                  <Trash2 className="size-4" />
                </Button>
              }
              title={t('delete_test')}
              description={t('delete_test_confirm', { title: row.original.title })}
              confirmLabel={tCommon('delete')}
              confirmClassName="bg-destructive text-white hover:bg-destructive/90"
              onConfirm={() => deleteTest()}
            />
          </div>
        );
      },
    },
  ];
}
