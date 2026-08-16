'use client';

import { type ColumnDef } from '@tanstack/react-table';
import { Eye } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useCallback, useMemo } from 'react';

import type { TestResultListItem } from '@/client';
import { DataTable } from '@/components/shared/data-table';
import { type SortDirection, type SortState } from '@/components/shared/sortable-header';
import { Button } from '@/components/ui/button';
import { getScoreBadgeClasses } from '@/features/history/utils/score-colors';
import { formatShortDate } from '@/lib/format';
import { Routes } from '@/lib/routes';

type Props = {
  data: TestResultListItem[];
  sort?: SortState;
  onSort?: (column: string | null, order: SortDirection) => void;
};

export function HistoryTable({ data, sort, onSort }: Props) {
  const router = useRouter();
  const t = useTranslations();
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
      sort={sort}
      onSort={onSort}
      emptyMessage={t('history.no_history_yet')}
      onRowClick={row => router.push(Routes.RESULT_DETAIL(row.id))}
      renderPreview={renderPreview}
      expandable={false}
    />
  );
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

function getColumns(t: ReturnType<typeof useTranslations>): ColumnDef<TestResultListItem, unknown>[] {
  return [
    {
      accessorKey: 'testTitle',
      header: t('history.column_test'),
      cell: ({ row }) => <p className="font-medium text-foreground truncate max-w-xs">{row.original.testTitle}</p>,
    },
    {
      id: 'score',
      header: t('history.column_score'),
      meta: { sortKey: 'score' },
      cell: ({ row }) => (
        <div className="flex items-center gap-1.5">
          <ScoreBadge score={row.original.score ?? 0} />
          {(row.original.pendingAnswers ?? 0) > 0 && (
            <span className="inline-flex items-center rounded-md bg-feedback-partial-bg px-1.5 py-0.5 text-xs font-medium text-feedback-partial">
              {t('history.column_pending')}
            </span>
          )}
        </div>
      ),
    },
    {
      id: 'result',
      header: t('history.column_result'),
      cell: ({ row }) => (
        <span className="tabular-nums text-muted-foreground">
          {row.original.correctAnswers} / {row.original.totalQuestions}
        </span>
      ),
    },
    {
      accessorKey: 'createdAt',
      header: t('history.column_date'),
      meta: { sortKey: 'created_at' },
      cell: ({ row }) => <span className="text-sm text-muted-foreground">{formatShortDate(row.original.createdAt)}</span>,
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
              tooltip={t('history.view_details')}
              onClick={e => {
                e.stopPropagation();
                router.push(Routes.RESULT_DETAIL(row.original.id));
              }}
              aria-label={t('history.view_details')}
            >
              <Eye className="size-4" />
            </Button>
          </div>
        );
      },
    },
  ];
}
