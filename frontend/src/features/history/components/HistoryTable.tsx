'use client';

import { type ColumnDef } from '@tanstack/react-table';
import { History } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useCallback, useMemo } from 'react';

import type { TestResultListItem } from '@/client';
import { DataTableV2 } from '@/components/shared/DataTableV2';
import { type SortDirection, type SortState } from '@/components/shared/SortableHeader';
import { Tooltip } from '@/components/ui/tooltip';
import { getScoreBadgeClasses } from '@/features/history/utils/scoreColors';
import { formatShortDate } from '@/lib/format';
import { Routes } from '@/lib/routes';

type Props = {
  data: TestResultListItem[];
  sort?: SortState;
  onSort?: (column: string | null, order: SortDirection) => void;
  onPreview: (id: string) => void;
  previewId: string | null;
};

export function HistoryTable({ data, sort, onSort, onPreview, previewId }: Props) {
  const router = useRouter();
  const t = useTranslations();
  const columns = useMemo(() => getColumns(t), [t]);

  const renderPreview = useCallback(
    (row: TestResultListItem) => (
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-2">
            <p className="truncate text-sm font-medium text-foreground">{row.testTitle}</p>
            <OlderVersionIcon isOlder={row.isOlderVersion} label={t('history.older_version')} />
            <CourseLabel title={row.spaceTitle} label={t('history.course_label', { title: row.spaceTitle ?? '' })} />
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">{formatShortDate(row.createdAt)}</p>
        </div>
        <ScoreBadge score={row.score ?? 0} />
      </div>
    ),
    [t]
  );

  return (
    <DataTableV2
      columns={columns}
      data={data}
      sort={sort}
      onSort={onSort}
      emptyMessage={t('history.no_history_yet')}
      onRowClick={row => router.push(Routes.RESULT_DETAIL(row.id))}
      renderPreview={renderPreview}
      expandable={false}
      getRowId={row => row.id}
      onPreview={row => onPreview(row.id)}
      previewId={previewId}
    />
  );
}

/** Names the course of a result taken in a course. Personal results have none. */
function CourseLabel({ title, label }: { title?: string | null; label: string }) {
  if (!title) return null;
  return (
    <span
      title={label}
      data-testid="course-label"
      className="inline-flex max-w-40 shrink-0 items-center truncate rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground"
    >
      {title}
    </span>
  );
}

/** Marks a result on a test that has a newer version. */
function OlderVersionIcon({ isOlder, label }: { isOlder?: boolean; label: string }) {
  if (!isOlder) return null;
  return (
    <Tooltip content={label}>
      <History aria-label={label} className="size-3.5 shrink-0 text-muted-foreground" data-testid="older-version" />
    </Tooltip>
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
      meta: { grow: true },
      cell: ({ row }) => (
        <div className="flex min-w-0 items-center gap-2">
          <p className="truncate font-medium text-foreground">{row.original.testTitle}</p>
          <OlderVersionIcon isOlder={row.original.isOlderVersion} label={t('history.older_version')} />
          <CourseLabel
            title={row.original.spaceTitle}
            label={t('history.course_label', { title: row.original.spaceTitle ?? '' })}
          />
        </div>
      ),
    },
    {
      id: 'score',
      header: t('history.column_score'),
      meta: { sortKey: 'score', widthClass: 'w-40' },
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
      meta: { widthClass: 'w-20 text-right' },
      cell: ({ row }) => (
        <span className="tabular-nums text-muted-foreground">
          {row.original.correctAnswers} / {row.original.totalQuestions}
        </span>
      ),
    },
    {
      accessorKey: 'createdAt',
      header: t('history.column_date'),
      meta: { sortKey: 'created_at', widthClass: 'w-24 text-right' },
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground">{formatShortDate(row.original.createdAt)}</span>
      ),
    },
  ];
}
