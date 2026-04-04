'use client';

import { type ColumnDef, flexRender, getCoreRowModel, useReactTable } from '@tanstack/react-table';
import { Copy, Dumbbell, ListChecks, Pencil, Text } from 'lucide-react';
import { useRouter } from 'next/navigation';

import { type QuestionRead, QuestionType, type TestRead } from '@/client';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Routes } from '@/lib/routes';

function countByType(questions: QuestionRead[], type: QuestionType): number {
  return questions.filter(q => q.questionType === type).length;
}

function QuestionTypeBadge({
  icon: Icon,
  count,
  label,
}: {
  icon: React.ComponentType<{ className?: string }>;
  count: number;
  label: string;
}) {
  if (count === 0) return null;
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

const columns: ColumnDef<TestRead>[] = [
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

      if (simple === 0 && mc === 0) {
        return <span className="text-xs text-muted-foreground/60">--</span>;
      }

      return (
        <div className="flex items-center gap-1.5">
          <QuestionTypeBadge icon={Text} count={simple} label="Simple" />
          <QuestionTypeBadge icon={ListChecks} count={mc} label="Multiple Choice" />
        </div>
      );
    },
  },
  {
    id: 'actions',
    header: '',
    cell: function ActionsCell({ row }) {
      const router = useRouter();
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
              navigator.clipboard.writeText(row.original.id);
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
        </div>
      );
    },
  },
];

type Props = {
  data: TestRead[];
};

export function TestsTable({ data }: Props) {
  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  const router = useRouter();
  const rows = table.getRowModel().rows;
  const isEmpty = rows.length === 0;

  return (
    <div className="rounded-xl ring-1 ring-foreground/10 bg-card overflow-hidden">
      <Table>
        <TableHeader>
          {table.getHeaderGroups().map(hg => (
            <TableRow key={hg.id} className="hover:bg-transparent">
              {hg.headers.map(header => (
                <TableHead key={header.id}>
                  {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
                </TableHead>
              ))}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          {isEmpty ? (
            <TableRow className="hover:bg-transparent">
              <TableCell colSpan={columns.length} className="h-24 text-center text-muted-foreground">
                No tests yet. Create your first one!
              </TableCell>
            </TableRow>
          ) : (
            rows.map(row => (
              <TableRow
                key={row.id}
                className="cursor-pointer"
                onClick={() => router.push(Routes.TEST_EDIT(row.original.id))}
              >
                {row.getVisibleCells().map(cell => (
                  <TableCell key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</TableCell>
                ))}
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}
