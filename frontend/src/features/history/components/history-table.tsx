'use client';

import { type ColumnDef } from '@tanstack/react-table';
import { Eye } from 'lucide-react';
import { useRouter } from 'next/navigation';

import type { TestResultListItem } from '@/client';
import { DataTable } from '@/components/shared/data-table';
import { Button } from '@/components/ui/button';
import { getScoreBadgeClasses } from '@/features/history/utils/score-colors';
import { Routes } from '@/lib/routes';

function formatDate(date: Date | string): string {
  return new Date(date).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
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

const columns: ColumnDef<TestResultListItem, unknown>[] = [
  {
    accessorKey: 'testTitle',
    header: 'Test',
    cell: ({ row }) => <p className="font-medium text-foreground truncate max-w-xs">{row.original.testTitle}</p>,
  },
  {
    id: 'score',
    header: 'Score',
    cell: ({ row }) => (
      <div className="flex items-center gap-1.5">
        <ScoreBadge score={row.original.score ?? 0} />
        {(row.original.pendingAnswers ?? 0) > 0 && (
          <span className="inline-flex items-center rounded-md bg-feedback-partial-bg px-1.5 py-0.5 text-xs font-medium text-feedback-partial">
            Pending
          </span>
        )}
      </div>
    ),
  },
  {
    id: 'result',
    header: 'Result',
    cell: ({ row }) => (
      <span className="tabular-nums text-muted-foreground">
        {row.original.correctAnswers} / {row.original.totalQuestions}
      </span>
    ),
  },
  {
    accessorKey: 'createdAt',
    header: 'Date',
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
            tooltip="View details"
            onClick={e => {
              e.stopPropagation();
              router.push(Routes.RESULT_DETAIL(row.original.id));
            }}
            aria-label="View result details"
          >
            <Eye className="size-4" />
          </Button>
        </div>
      );
    },
  },
];

type Props = {
  data: TestResultListItem[];
};

export function HistoryTable({ data }: Props) {
  const router = useRouter();

  return (
    <DataTable
      columns={columns}
      data={data}
      emptyMessage="No test history yet. Take your first test!"
      onRowClick={row => router.push(Routes.RESULT_DETAIL(row.id))}
    />
  );
}
