'use client';

import { EllipsisVertical, EyeOff, PencilLine, Undo2 } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

import { type GradebookCell, type GradebookRead, type GradebookRow, type SpaceDetail } from '@/client';
import { ActionsMenu, type MobileAction } from '@/components/shared/ActionsMenu';
import { QueryState } from '@/components/shared/QueryState';
import { SearchInput } from '@/components/shared/SearchInput';
import { Button } from '@/components/ui/button';
import { Tooltip } from '@/components/ui/tooltip';
import { classroomHref } from '@/lib/routes';
import { cn } from '@/lib/utils';

import { useGradebook, useRemoveCompletion } from '../hooks/useClassrooms';
import {
  CELL_STATUS_STYLES,
  findCourseProgress,
  formatAttempts,
  formatBestScore,
  groupColumns,
  resultHrefFromGrades,
  studentName,
  type GradebookGroup,
} from '../lib/gradebook';

type RemoveCompletion = (target: { itemId: string; userId: string }) => void;

// Sticky first column: the name stays in view while the matrix scrolls sideways. It needs an opaque ground.
const STICKY_CELL = 'sticky left-0 z-10';
const HEAD_CELL = 'px-3 py-2 text-left text-xs font-medium text-muted-foreground align-bottom';
// The groups alternate in tint: the change of ground marks where a group starts, so no cell needs a one-sided border.
const groupHeadTint = (groupIndex: number): string => (groupIndex % 2 === 0 ? 'bg-muted' : 'bg-muted/60');
const groupBodyTint = (groupIndex: number): string => (groupIndex % 2 === 0 ? '' : 'bg-muted/30');
// A cell target (link or button) grows its hover ground by 6 px each side and keeps the text aligned with the column.
const CELL_TARGET =
  '-mx-1.5 block rounded-md px-1.5 py-1 transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none';
const groupKey = (group: GradebookGroup): string => group.course?.courseId ?? 'loose';

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
  const [search, setSearch] = useState('');
  const { mutate: removeCompletion, isPending: isRemovingCompletion } = useRemoveCompletion(classroom.id);
  const groups = groupColumns(gradebook);
  const hasTests = gradebook.columns.length > 0;

  if (gradebook.rows.length === 0 || (!hasTests && gradebook.courses.length === 0)) {
    return (
      <div className="rounded-xl border border-border bg-card px-4 py-12 text-center text-sm text-muted-foreground shadow-card">
        {gradebook.rows.length === 0 ? t('classrooms.grades_no_students') : t('classrooms.grades_no_tests')}
      </div>
    );
  }

  const query = search.trim().toLowerCase();
  const rows = gradebook.rows.filter(
    row => query === '' || `${studentName(row)} ${row.username}`.toLowerCase().includes(query)
  );

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder={t('classrooms.grades_search')}
          className="max-w-64"
        />
        <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
          <PencilLine aria-hidden className="size-3.5 text-feedback-partial" />
          {t('classrooms.grades_overridden')}
        </span>
      </div>

      {/* The card scrolls sideways, not the page. */}
      <div className="overflow-x-auto rounded-xl border border-border bg-card shadow-card" data-testid="gradebook">
        <table className="w-max min-w-full border-collapse text-sm">
          <thead>
            <tr>
              <th className={cn(HEAD_CELL, STICKY_CELL, 'min-w-44 bg-muted')} rowSpan={2}>
                {t('classrooms.grades_student')}
              </th>
              {groups.map((group, groupIndex) => (
                <th
                  key={groupKey(group)}
                  className={cn(HEAD_CELL, 'text-foreground', groupHeadTint(groupIndex))}
                  colSpan={group.columns.length + (group.course ? 1 : 0)}
                >
                  <GroupTitle group={group} />
                </th>
              ))}
            </tr>
            <tr>
              {groups.map((group, groupIndex) => (
                <GroupColumnHeads key={groupKey(group)} group={group} tint={groupHeadTint(groupIndex)} />
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-hairline">
            {rows.map(row => (
              <StudentRow
                key={row.userId}
                row={row}
                groups={groups}
                classroom={classroom}
                onRemoveCompletion={removeCompletion}
                isRemovingCompletion={isRemovingCompletion}
              />
            ))}
          </tbody>
        </table>
        {rows.length === 0 && (
          <p className="px-4 py-8 text-center text-sm text-muted-foreground">{t('classrooms.grades_no_match')}</p>
        )}
      </div>
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

function GroupColumnHeads({ group, tint }: { group: GradebookGroup; tint: string }) {
  const t = useTranslations();
  return (
    <>
      {group.course && <th className={cn(HEAD_CELL, 'min-w-32', tint)}>{t('classrooms.grades_course_percent')}</th>}
      {group.columns.map(({ column }) => (
        <th key={column.itemId} className={cn(HEAD_CELL, 'min-w-36', tint)}>
          <span className="inline-flex items-center gap-1.5">
            <span className="max-w-40 truncate" title={column.title}>
              {column.title}
            </span>
            {column.hidden && <HiddenMark />}
          </span>
        </th>
      ))}
    </>
  );
}

interface StudentRowProps {
  row: GradebookRow;
  groups: GradebookGroup[];
  classroom: SpaceDetail;
  onRemoveCompletion: RemoveCompletion;
  isRemovingCompletion: boolean;
}

function StudentRow({ row, groups, classroom, onRemoveCompletion, isRemovingCompletion }: StudentRowProps) {
  const backHref = classroomHref(classroom);

  return (
    <tr>
      <th scope="row" className={cn(STICKY_CELL, 'bg-card px-3 py-2 text-left font-medium text-foreground')}>
        <span className="block max-w-56 truncate" title={row.username}>
          {studentName(row)}
        </span>
      </th>
      {groups.map((group, groupIndex) => (
        <GroupCells
          key={groupKey(group)}
          group={group}
          row={row}
          backHref={backHref}
          tint={groupBodyTint(groupIndex)}
          onRemoveCompletion={onRemoveCompletion}
          isRemovingCompletion={isRemovingCompletion}
        />
      ))}
    </tr>
  );
}

interface GroupCellsProps {
  group: GradebookGroup;
  row: GradebookRow;
  backHref: string;
  tint: string;
  onRemoveCompletion: RemoveCompletion;
  isRemovingCompletion: boolean;
}

function GroupCells({ group, row, backHref, tint, onRemoveCompletion, isRemovingCompletion }: GroupCellsProps) {
  const progress = group.course ? findCourseProgress(row.courses, group.course.courseId) : undefined;

  return (
    <>
      {group.course && (
        <td className={cn('px-3 py-2 align-middle', tint)}>
          {progress ? (
            <CourseProgressCell
              percent={progress.percent}
              done={progress.completedItems}
              total={group.course.totalItems}
            />
          ) : (
            <span className="text-muted-foreground">-</span>
          )}
        </td>
      )}
      {group.columns.map(({ column, index }) => (
        <td key={column.itemId} className={cn('px-3 py-2 align-middle', tint)}>
          <GradeCell
            cell={row.cells[index]}
            maxAttempts={column.maxAttempts}
            backHref={backHref}
            studentLabel={studentName(row)}
            onRemoveCompletion={() => onRemoveCompletion({ itemId: column.itemId, userId: row.userId })}
            isRemovingCompletion={isRemovingCompletion}
          />
        </td>
      ))}
    </>
  );
}

function CourseProgressCell({ percent, done, total }: { percent: number; done: number; total: number }) {
  const t = useTranslations();

  return (
    <div className="flex w-24 flex-col gap-1" title={`${done}/${total}`}>
      <span className="text-xs font-medium text-foreground tabular-nums">{percent}%</span>
      <div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        aria-label={t('classrooms.grades_course_percent')}
        className="h-1.5 overflow-hidden rounded-full bg-track"
      >
        <div className="h-full rounded-full bg-primary" style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}

interface GradeCellProps {
  cell: GradebookCell | undefined;
  maxAttempts: number | null;
  backHref: string;
  studentLabel: string;
  onRemoveCompletion: () => void;
  isRemovingCompletion: boolean;
}

/**
 * The state of a test for one student: mark, word, then score and attempts.
 * With a best result the cell is a link to the result page (the grade is set per answer there), so it opens in a
 * new tab too. Remove completion stays in a menu beside it.
 */
function GradeCell({
  cell,
  maxAttempts,
  backHref,
  studentLabel,
  onRemoveCompletion,
  isRemovingCompletion,
}: GradeCellProps) {
  const t = useTranslations();
  if (!cell) return <span className="text-muted-foreground">-</span>;

  const style = CELL_STATUS_STYLES[cell.status];
  const StatusIcon = style.icon;
  const score = formatBestScore(cell.bestScore);
  const attempts = formatAttempts(cell.attemptsUsed, maxAttempts);
  const detail = [score, attempts && t('classrooms.grades_attempts', { attempts })].filter(Boolean).join(' · ');

  const content = (
    <span className="flex flex-col gap-0.5">
      <span className={cn('inline-flex items-center gap-1 text-xs font-medium', style.textClass)}>
        <StatusIcon aria-hidden className="size-3.5 shrink-0" />
        {t(`classrooms.${style.labelKey}`)}
        {cell.overridden && (
          <Tooltip content={t('classrooms.grades_overridden')}>
            <PencilLine className="size-3.5 text-feedback-partial" aria-label={t('classrooms.grades_overridden')} />
          </Tooltip>
        )}
      </span>
      {detail && <span className="text-xs text-muted-foreground tabular-nums">{detail}</span>}
    </span>
  );

  const removeActions: MobileAction[][] = cell.canUndoPass
    ? [
        [
          {
            label: t('classrooms.completion_remove'),
            icon: Undo2,
            onClick: onRemoveCompletion,
            disabled: isRemovingCompletion,
            confirm: {
              title: t('classrooms.completion_remove_title'),
              description: t('classrooms.completion_remove_description', { student: studentLabel }),
            },
          },
        ],
      ]
    : [];

  if (cell.bestResultId === null) {
    if (removeActions.length === 0) return content;
    return (
      <ActionsMenu
        actions={removeActions}
        trigger={
          <button type="button" className={cn(CELL_TARGET, 'text-left')}>
            {content}
          </button>
        }
      />
    );
  }

  const link = (
    <Link
      href={resultHrefFromGrades(cell.bestResultId, backHref)}
      title={t('classrooms.grade_open_result')}
      className={CELL_TARGET}
    >
      {content}
    </Link>
  );
  if (removeActions.length === 0) return link;

  return (
    <div className="flex items-center gap-1">
      {link}
      <ActionsMenu
        actions={removeActions}
        trigger={
          <Button
            variant="ghost"
            size="icon-sm"
            icon={EllipsisVertical}
            aria-label={t('common.more_actions')}
            className="text-muted-foreground"
          />
        }
      />
    </div>
  );
}
