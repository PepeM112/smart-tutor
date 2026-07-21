'use client';

import { type ColumnDef } from '@tanstack/react-table';
import { Eye } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useCallback, useMemo } from 'react';

import type { TestResultListItem } from '@/client';
import { DataTable } from '@/components/shared/data-table';
import { Button } from '@/components/ui/button';
import { getScoreBadgeClasses } from '@/features/history/utils/score-colors';
import { Routes } from '@/lib/routes';

type Props = {
  data: TestResultListItem[];
};

export function HistoryTable({ data }: Props) {
  const router = useRouter();
  const t = useTranslations('history');
  const columns = useMemo(() => getColumns(t), [t]);

  const renderPreview = useCallback(
    (row: TestResultListItem) => (
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-foreground truncate">{row.testTitle}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">{formatShortDate(row.createdAt)}</p>
        </div>
        <ScoreBadge score={row.score ?? 0} />
      </div>
    ),
    []
  );

  return (
    <DataTable
      columns={columns}
      data={data}
      emptyMessage={t('no_history_yet')}
      onRowClick={row => router.push(Routes.RESULT_DETAIL(row.id))}
      renderPreview={renderPreview}
      expandable={false}
    />
  );
}

function formatDate(date: Date | string): string {
  return new Date(date).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatShortDate(date: Date | string): string {
  return new Date(date).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function ScoreBadge({ score }: { score: number }) {
  return (
    <span
      className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ${getScoreBadgeClasses(score)}`}
    >
      {score.toFixed(0)}%
    </span>
  );
}

function getColumns(t: ReturnType<typeof useTranslations<'history'>>): ColumnDef<TestResultListItem, unknown>[] {
  return [
    {
      accessorKey: 'testTitle',
      header: t('column_test'),
      cell: ({ row }) => <p className="font-medium text-foreground truncate max-w-xs">{row.original.testTitle}</p>,
    },
    {
      id: 'score',
      header: t('column_score'),
      cell: ({ row }) => (
        <div className="flex items-center gap-1.5">
          <ScoreBadge score={row.original.score ?? 0} />
          {(row.original.pendingAnswers ?? 0) > 0 && (
            <span className="inline-flex items-center rounded-md bg-feedback-partial-bg px-1.5 py-0.5 text-xs font-medium text-feedback-partial">
              {t('column_pending')}
            </span>
          )}
        </div>
      ),
    },
    {
      id: 'result',
      header: t('column_result'),
      cell: ({ row }) => (
        <span className="tabular-nums text-muted-foreground">
          {row.original.correctAnswers} / {row.original.totalQuestions}
        </span>
      ),
    },
    {
      accessorKey: 'createdAt',
      header: t('column_date'),
      cell: ({ row }) => <span className="text-sm text-muted-foreground">{formatDate(row.original.createdAt)}</span>,
    },
    {
      id: 'actions',
      header: '',
      cell: function ActionsCell({ row }) {
        const router = useRouter();
        return (
          <div className="flex justify-end">
            <Button
              variant="ghost"
              size="icon-lg"
              tooltip={t('view_details')}
              onClick={e => {
                e.stopPropagation();
                router.push(Routes.RESULT_DETAIL(row.original.id));
              }}
              aria-label={t('view_details')}
            >
              <Eye className="size-4" />
            </Button>
          </div>
        );
      },
    },
  ];
}
