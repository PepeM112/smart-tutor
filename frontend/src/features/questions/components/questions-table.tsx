'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { type ColumnDef } from '@tanstack/react-table';
import { Archive, BookOpen, Copy, Layers, Pencil, Send, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useCallback, useState } from 'react';
import { toast } from 'sonner';

import { type QuestionType, type QuestionListRead } from '@/client';
import { DataTable, type MobileAction } from '@/components/shared/data-table';
import { SortableHeader } from '@/components/shared/sortable-header';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Tooltip } from '@/components/ui/tooltip';
import { getQuestionTypeInfo } from '@/features/tests/utils/question-icons';
import { sdk } from '@/lib/api-client';
import { Routes } from '@/lib/routes';

import { AssignDialog } from './assign-dialog';

type SortState = {
  column: string | null;
  order: 'asc' | 'desc' | null;
};

type Props = {
  data: QuestionListRead[];
  sort: SortState;
  onSort: (column: string, order: 'asc' | 'desc') => void;
  selectedIds: Set<string>;
  onSelectionChange: (ids: Set<string>) => void;
};

export function QuestionsTable({ data, sort, onSort, selectedIds, onSelectionChange }: Props) {
  const t = useTranslations('questions');
  const tCommon = useTranslations('common');
  const router = useRouter();
  const queryClient = useQueryClient();
  const [assignQuestionId, setAssignQuestionId] = useState<string | null>(null);

  const { mutate: deleteQuestion, isPending: deleteIsPending } = useMutation({
    mutationFn: (id: string) => sdk.questionsDelete({ path: { question_id: id } }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['questions'] });
      toast.success(t('question_deleted'));
    },
    onError: () => toast.error(t('failed_to_delete')),
  });

  const { mutate: duplicateQuestion } = useMutation({
    mutationFn: (id: string) => sdk.questionsDuplicate({ path: { question_id: id } }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['questions'] });
      toast.success(t('question_duplicated'));
    },
    onError: () => toast.error(t('failed_to_duplicate')),
  });

  function toggleSelect(id: string) {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onSelectionChange(next);
  }

  function toggleAll() {
    if (selectedIds.size === data.length) {
      onSelectionChange(new Set());
    } else {
      onSelectionChange(new Set(data.map(q => q.id)));
    }
  }

  const columns = useQuestionsColumns({
    deleteQuestion,
    isDeleting: deleteIsPending,
    onAssign: setAssignQuestionId,
    onDuplicate: (id: string) => {
      duplicateQuestion(id);
    },
    sort,
    onSort,
    selectedIds,
    onToggleSelect: toggleSelect,
    onToggleAll: toggleAll,
    allSelected: data.length > 0 && selectedIds.size === data.length,
  });

  const renderPreview = useCallback(
    (question: QuestionListRead) => (
      <div className="min-w-0">
        <div className="flex items-center gap-1.5 mb-0.5">
          <QuestionTypeBadge type={question.questionType} />
          {question.testTitle ? (
            <Tooltip content={question.testTitle} side="bottom">
              <span className="text-[10px] font-medium bg-muted px-1.5 py-0.5 rounded-full text-muted-foreground truncate max-w-30">
                {question.testTitle}
              </span>
            </Tooltip>
          ) : (
            <span className="text-[10px] font-medium bg-primary/10 px-1.5 py-0.5 rounded-full text-primary">
              {t('bank')}
            </span>
          )}
          {question.groupTitle && (
            <Tooltip content={question.groupTitle} side="bottom">
              <span className="text-[10px] font-medium bg-muted px-1.5 py-0.5 rounded-full text-muted-foreground truncate max-w-24">
                {question.groupTitle}
              </span>
            </Tooltip>
          )}
        </div>
        <p className="text-sm font-medium text-foreground truncate">{question.prompt}</p>
      </div>
    ),
    [t]
  );

  const renderActions = useCallback(
    (question: QuestionListRead): MobileAction[] => [
      {
        label: tCommon('edit'),
        icon: Pencil,
        onClick: () => router.push(Routes.QUESTION_EDIT(question.id)),
      },
      {
        label: t('duplicate'),
        icon: Copy,
        onClick: () => {
          duplicateQuestion(question.id);
        },
      },
      {
        label: t('assign_to_test'),
        icon: Send,
        onClick: () => setAssignQuestionId(question.id),
      },
      {
        label: tCommon('delete'),
        icon: Trash2,
        variant: 'destructive',
        onClick: () => deleteQuestion(question.id),
        confirm: {
          title: t('delete_question'),
          description: t('delete_question_confirm'),
        },
      },
    ],
    [t, tCommon, router, deleteQuestion, duplicateQuestion]
  );

  return (
    <>
      <DataTable
        columns={columns}
        data={data}
        emptyMessage={t('no_questions_yet')}
        onRowClick={row => router.push(Routes.QUESTION_EDIT(row.id))}
        renderPreview={renderPreview}
        renderActions={renderActions}
      />
      {assignQuestionId && (
        <AssignDialog
          questionIds={[assignQuestionId]}
          open={!!assignQuestionId}
          onOpenChange={open => {
            if (!open) setAssignQuestionId(null);
          }}
        />
      )}
    </>
  );
}

function QuestionTypeBadge({ type }: { type: QuestionType }) {
  const { icon: Icon, label } = getQuestionTypeInfo(type);
  return (
    <span className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
      <Icon className="size-3.5" />
      {label}
    </span>
  );
}

function LocationCell({ question }: { question: QuestionListRead }) {
  const t = useTranslations('questions');

  if (!question.testId) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
        <Archive className="size-3" />
        {t('bank')}
      </span>
    );
  }

  return (
    <div className="flex items-center gap-1.5">
      <Tooltip content={question.testTitle} side="bottom">
        <Link
          href={Routes.TEST_EDIT(question.testId)}
          onClick={e => e.stopPropagation()}
          className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground hover:bg-muted/80 transition-colors max-w-32"
        >
          <BookOpen className="size-3 shrink-0" />
          <span className="truncate">{question.testTitle}</span>
        </Link>
      </Tooltip>
      {question.groupTitle && (
        <Tooltip content={question.groupTitle} side="bottom">
          <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground max-w-28">
            <Layers className="size-3 shrink-0" />
            <span className="truncate">{question.groupTitle}</span>
          </span>
        </Tooltip>
      )}
    </div>
  );
}

type ColumnDeps = {
  deleteQuestion: (id: string) => void;
  isDeleting: boolean;
  onAssign: (questionId: string) => void;
  onDuplicate: (questionId: string) => void;
  sort: SortState;
  onSort: (column: string, order: 'asc' | 'desc') => void;
  selectedIds: Set<string>;
  onToggleSelect: (id: string) => void;
  onToggleAll: () => void;
  allSelected: boolean;
};

function useQuestionsColumns({
  deleteQuestion,
  isDeleting,
  onAssign,
  onDuplicate,
  sort,
  onSort,
  selectedIds,
  onToggleSelect,
  onToggleAll,
  allSelected,
}: ColumnDeps): ColumnDef<QuestionListRead, unknown>[] {
  const t = useTranslations('questions');
  const tCommon = useTranslations('common');
  const router = useRouter();

  return [
    {
      id: 'select',
      header: () => (
        <Checkbox
          checked={allSelected}
          onCheckedChange={onToggleAll}
          aria-label={allSelected ? t('deselect_all') : t('select_all')}
        />
      ),
      cell: ({ row }) => (
        <Checkbox
          checked={selectedIds.has(row.original.id)}
          onCheckedChange={() => onToggleSelect(row.original.id)}
          onClick={e => e.stopPropagation()}
          aria-label={`Select ${row.original.prompt}`}
        />
      ),
    },
    {
      accessorKey: 'prompt',
      header: () => (
        <SortableHeader
          label={t('column_prompt')}
          column="prompt"
          currentSort={sort.column}
          currentOrder={sort.order}
          onSort={onSort}
        />
      ),
      cell: ({ row }) => (
        <div className="min-w-0">
          <p className="font-medium text-foreground truncate max-w-md">{row.original.prompt}</p>
        </div>
      ),
    },
    {
      id: 'type',
      header: () => (
        <SortableHeader
          label={t('column_type')}
          column="question_type"
          currentSort={sort.column}
          currentOrder={sort.order}
          onSort={onSort}
        />
      ),
      cell: ({ row }) => <QuestionTypeBadge type={row.original.questionType} />,
    },
    {
      id: 'location',
      header: t('column_location'),
      cell: ({ row }) => <LocationCell question={row.original} />,
    },
    {
      id: 'points',
      header: () => (
        <SortableHeader
          label={t('column_points')}
          column="points"
          currentSort={sort.column}
          currentOrder={sort.order}
          onSort={onSort}
        />
      ),
      cell: ({ row }) => <span className="tabular-nums text-muted-foreground">{row.original.points ?? 1}</span>,
    },
    {
      id: 'actions',
      header: '',
      cell: ({ row }) => (
        <div className="flex justify-end gap-1">
          <Button
            variant="ghost"
            size="icon-lg"
            tooltip={tCommon('edit')}
            onClick={e => {
              e.stopPropagation();
              router.push(Routes.QUESTION_EDIT(row.original.id));
            }}
            aria-label={tCommon('edit')}
          >
            <Pencil className="size-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon-lg"
            tooltip={t('duplicate')}
            onClick={e => {
              e.stopPropagation();
              onDuplicate(row.original.id);
            }}
            aria-label={t('duplicate')}
          >
            <Copy className="size-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon-lg"
            tooltip={t('assign_to_test')}
            onClick={e => {
              e.stopPropagation();
              onAssign(row.original.id);
            }}
            aria-label={t('assign_to_test')}
          >
            <Send className="size-4" />
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
            title={t('delete_question')}
            description={t('delete_question_confirm')}
            confirmLabel={tCommon('delete')}
            confirmClassName="bg-destructive text-white hover:bg-destructive/90"
            onConfirm={() => deleteQuestion(row.original.id)}
          />
        </div>
      ),
    },
  ];
}
