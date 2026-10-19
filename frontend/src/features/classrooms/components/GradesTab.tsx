'use client';

import { EyeOff, PencilLine } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';

import { type GradebookCell, type GradebookRead, type GradebookRow, type SpaceDetail } from '@/client';
import { QueryState } from '@/components/shared/QueryState';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Tooltip } from '@/components/ui/tooltip';
import { classroomHref } from '@/lib/routes';
import { cn } from '@/lib/utils';

import { useGradebook, useRemoveCompletion } from '../hooks/useClassrooms';
import {
  CELL_STATUS_STYLES,
  canOpenCell,
  findCourseProgress,
  formatAttempts,
  formatBestScore,
  groupColumns,
  resultHrefFromGrades,
  studentName,
  type GradebookGroup,
} from '../lib/gradebook';

// Sticky first column: the name stays in view while the matrix scrolls sideways.
const STICKY_CELL = 'sticky left-0 z-10 bg-card';
const HEAD_CELL = 'px-3 py-2 text-left text-xs font-medium text-muted-foreground align-bottom';

/** Teachers: students × tests (loose tests first, then one group per course with its % column). */
export function GradesTab({ classroom }: { classroom: SpaceDetail }) {
  const t = useTranslations();
  const { data: gradebook, isLoading, isError } = useGradebook(classroom.id);

  return (
    <QueryState isLoading={isLoading} isError={isError} errorMessage={t('classrooms.grades_failed_to_load')}>
      {gradebook && <GradebookMatrix gradebook={gradebook} classroom={classroom} />}
    </QueryState>
  );
}

function GradebookMatrix({ gradebook, classroom }: { gradebook: GradebookRead; classroom: SpaceDetail }) {
  const t = useTranslations();
  const groups = groupColumns(gradebook);
  const hasTests = gradebook.columns.length > 0;

  if (gradebook.rows.length === 0 || (!hasTests && gradebook.courses.length === 0)) {
    return (
      <div className="rounded-xl border border-border bg-card px-4 py-12 text-center text-sm text-muted-foreground shadow-card">
        {gradebook.rows.length === 0 ? t('classrooms.grades_no_students') : t('classrooms.grades_no_tests')}
      </div>
    );
  }

  return (
    // The card scrolls sideways, not the page.
    <div className="overflow-x-auto rounded-xl border border-border bg-card shadow-card" data-testid="gradebook">
      <table className="w-max min-w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-border">
            <th className={cn(HEAD_CELL, STICKY_CELL, 'min-w-44')} rowSpan={2}>
              {t('classrooms.grades_student')}
            </th>
            {groups.map(group => (
              <th
                key={group.course?.courseId ?? 'loose'}
                className={cn(HEAD_CELL, 'border-l border-border text-foreground')}
                colSpan={group.columns.length + (group.course ? 1 : 0)}
              >
                <GroupTitle group={group} />
              </th>
            ))}
          </tr>
          <tr className="border-b border-border">
            {groups.map(group => (
              <GroupColumnHeads key={group.course?.courseId ?? 'loose'} group={group} />
            ))}
          </tr>
        </thead>
        <tbody>
          {gradebook.rows.map(row => (
            <StudentRow key={row.userId} row={row} groups={groups} classroom={classroom} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function GroupTitle({ group }: { group: GradebookGroup }) {
  const t = useTranslations();
  if (!group.course) return <>{t('classrooms.grades_group_classroom')}</>;
  return (
    <span className="inline-flex items-center gap-1.5">
      {group.course.title}
      {group.course.hidden && <HiddenMark />}
    </span>
  );
}

function HiddenMark() {
  const t = useTranslations();
  return (
    <Tooltip content={t('classrooms.grades_hidden')}>
      <EyeOff className="size-3.5 text-muted-foreground" aria-label={t('classrooms.grades_hidden')} />
    </Tooltip>
  );
}

function GroupColumnHeads({ group }: { group: GradebookGroup }) {
  const t = useTranslations();
  return (
    <>
      {group.columns.map(({ column }, position) => (
        <th key={column.itemId} className={cn(HEAD_CELL, 'min-w-36', position === 0 && 'border-l border-border')}>
          <span className="inline-flex items-center gap-1.5">
            <span className="max-w-40 truncate" title={column.title}>
              {column.title}
            </span>
            {column.hidden && <HiddenMark />}
          </span>
        </th>
      ))}
      {group.course && (
        <th className={cn(HEAD_CELL, 'min-w-24', group.columns.length === 0 && 'border-l border-border')}>
          {t('classrooms.grades_course_percent')}
        </th>
      )}
    </>
  );
}

function StudentRow({
  row,
  groups,
  classroom,
}: {
  row: GradebookRow;
  groups: GradebookGroup[];
  classroom: SpaceDetail;
}) {
  const backHref = classroomHref(classroom);

  return (
    <tr className="border-b border-border last:border-0">
      <th scope="row" className={cn(STICKY_CELL, 'px-3 py-2 text-left font-medium text-foreground')}>
        <span className="block max-w-56 truncate" title={row.username}>
          {studentName(row)}
        </span>
      </th>
      {groups.map(group => (
        <GroupCells
          key={group.course?.courseId ?? 'loose'}
          group={group}
          row={row}
          backHref={backHref}
          classroomId={classroom.id}
        />
      ))}
    </tr>
  );
}

function GroupCells({
  group,
  row,
  backHref,
  classroomId,
}: {
  group: GradebookGroup;
  row: GradebookRow;
  backHref: string;
  classroomId: string;
}) {
  const progress = group.course ? findCourseProgress(row.courses, group.course.courseId) : undefined;

  return (
    <>
      {group.columns.map(({ column, index }, position) => (
        <td key={column.itemId} className={cn('px-3 py-2 align-middle', position === 0 && 'border-l border-border')}>
          <GradeCell
            cell={row.cells[index]}
            maxAttempts={column.maxAttempts}
            backHref={backHref}
            undo={{ classroomId, itemId: column.itemId, userId: row.userId, studentLabel: studentName(row) }}
          />
        </td>
      ))}
      {group.course && (
        <td
          className={cn('px-3 py-2 align-middle tabular-nums', group.columns.length === 0 && 'border-l border-border')}
        >
          {progress ? (
            <span title={`${progress.completedItems}/${group.course.totalItems}`}>{progress.percent}%</span>
          ) : (
            <span className="text-muted-foreground">-</span>
          )}
        </td>
      )}
    </>
  );
}

type UndoTarget = { classroomId: string; itemId: string; userId: string; studentLabel: string };

function GradeCell({
  cell,
  maxAttempts,
  backHref,
  undo,
}: {
  cell: GradebookCell | undefined;
  maxAttempts: number | null;
  backHref: string;
  undo: UndoTarget;
}) {
  const t = useTranslations();
  if (!cell) return <span className="text-muted-foreground">-</span>;

  const style = CELL_STATUS_STYLES[cell.status];
  const score = formatBestScore(cell.bestScore);
  const attempts = formatAttempts(cell.attemptsUsed, maxAttempts);

  const content = (
    <span className="flex flex-col gap-0.5">
      <span className="flex items-center gap-1.5">
        <span className={cn('rounded-full px-2 py-0.5 text-xs font-medium', style.bgClass, style.textClass)}>
          {t(`classrooms.${style.labelKey}`)}
        </span>
        {score && <span className="font-medium tabular-nums text-foreground">{score}</span>}
        {cell.overridden && (
          <Tooltip content={t('classrooms.grades_overridden')}>
            <PencilLine className="size-3.5 text-feedback-partial" aria-label={t('classrooms.grades_overridden')} />
          </Tooltip>
        )}
      </span>
      {attempts && (
        <span className="text-xs text-muted-foreground tabular-nums">
          {t('classrooms.grades_attempts', { attempts })}
        </span>
      )}
    </span>
  );

  const body =
    !canOpenCell(cell) || cell.bestResultId === null ? (
      content
    ) : (
      <Link
        href={resultHrefFromGrades(cell.bestResultId, backHref)}
        className="-mx-1.5 block rounded-md px-1.5 py-1 transition-colors hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      >
        {content}
      </Link>
    );

  if (!cell.canUndoPass) return body;
  // The button sits outside the link: a click on it must not open the result.
  return (
    <div className="flex flex-col items-start gap-1">
      {body}
      <RemoveCompletionButton target={undo} />
    </div>
  );
}

/** Only for a completion that a lower grade left behind (`canUndoPass`). It asks first. */
function RemoveCompletionButton({ target }: { target: UndoTarget }) {
  const t = useTranslations();
  const { mutate: removeCompletion, isPending: isRemoving } = useRemoveCompletion(target.classroomId);

  return (
    <ConfirmDialog
      trigger={
        <Button type="button" variant="outline" size="xs" disabled={isRemoving}>
          {t('classrooms.completion_remove')}
        </Button>
      }
      title={t('classrooms.completion_remove_title')}
      description={t('classrooms.completion_remove_description', { student: target.studentLabel })}
      confirmLabel={t('classrooms.completion_remove')}
      onConfirm={() => removeCompletion({ itemId: target.itemId, userId: target.userId })}
    />
  );
}
