'use client';

import { UserX } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { KeySource, type StudentTokenUsage } from '@/client';
import { QueryState } from '@/components/shared/QueryState';
import { SettingsSection } from '@/features/settings/components/SettingsSection';
import { formatCost, formatTokens } from '@/lib/format';

import { useClassroomTokenUsage } from '../hooks/useClassrooms';
import { usageForSource } from '../lib/classKey';
import { studentName } from '../lib/gradebook';

const SOURCES: { source: KeySource; label: string }[] = [
  { source: KeySource.CLASS, label: 'classrooms.spend_source_class' },
  { source: KeySource.STUDENT, label: 'classrooms.spend_source_student' },
];

/** Owner only: AI spend of each student, this month and in total, split by the key that paid. */
export function ClassSpendTable({ classroomId }: { classroomId: string }) {
  const t = useTranslations();
  const { data, isLoading, isError } = useClassroomTokenUsage(classroomId);
  const students = data?.students ?? [];

  return (
    <SettingsSection title={t('classrooms.spend_title')} description={t('classrooms.spend_hint')}>
      <QueryState isLoading={isLoading} isError={isError} errorMessage={t('classrooms.spend_failed_to_load')}>
        {students.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('classrooms.spend_empty')}</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full min-w-[34rem] text-sm">
              <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 font-medium">{t('classrooms.grades_student')}</th>
                  <th className="px-3 py-2 text-right font-medium">{t('classrooms.spend_month')}</th>
                  <th className="px-3 py-2 text-right font-medium">{t('classrooms.spend_total')}</th>
                  <th className="px-3 py-2 font-medium">{t('classrooms.spend_by_source')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {students.map(student => (
                  <SpendRow key={student.userId} student={student} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </QueryState>
    </SettingsSection>
  );
}

function SpendRow({ student }: { student: StudentTokenUsage }) {
  const t = useTranslations();
  return (
    <tr className={student.isActive ? undefined : 'text-muted-foreground'}>
      <td className="px-3 py-2">
        <span className="flex items-center gap-1.5">
          {studentName(student)}
          {!student.isActive && (
            <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs">
              <UserX className="size-3" aria-hidden />
              {t('classrooms.spend_inactive')}
            </span>
          )}
        </span>
      </td>
      <td className="px-3 py-2 text-right tabular-nums">
        {formatTokens(student.monthTokens)}{' '}
        <span className="text-muted-foreground">{costOrDash(student.monthCost)}</span>
      </td>
      <td className="px-3 py-2 text-right tabular-nums">
        {formatTokens(student.totalTokens)}{' '}
        <span className="text-muted-foreground">{costOrDash(student.totalCost)}</span>
      </td>
      <td className="px-3 py-2 text-xs text-muted-foreground">
        {SOURCES.map(({ source, label }) => {
          const usage = usageForSource(student.bySource, source);
          return (
            <div key={source}>
              {t(label)}: {formatTokens(usage?.monthTokens ?? 0)} / {formatTokens(usage?.totalTokens ?? 0)}
            </div>
          );
        })}
      </td>
    </tr>
  );
}

function costOrDash(cost: string | null): string {
  return cost == null ? '-' : formatCost(cost);
}
