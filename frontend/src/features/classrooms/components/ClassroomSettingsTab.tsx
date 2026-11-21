'use client';

import { useTranslations } from 'next-intl';

import { FeedPermission, type SpaceDetail } from '@/client';
import { QueryState } from '@/components/shared/QueryState';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CourseSettings } from '@/features/courses/components/CourseSettings';
import { type useCourseActions } from '@/features/courses/hooks/useCourseActions';
import { SettingsSection } from '@/features/settings/components/SettingsSection';

import { useClassroomSettings, useUpdateClassroomSettings } from '../hooks/useClassrooms';

import { ClassKeySection } from './ClassKeySection';
import { ClassSpendTable } from './ClassSpendTable';

const FEED_OPTIONS: { value: FeedPermission; label: string }[] = [
  { value: FeedPermission.TEACHERS_ONLY, label: 'classrooms.feed_teachers_only' },
  { value: FeedPermission.STUDENTS_COMMENT, label: 'classrooms.feed_students_comment' },
  { value: FeedPermission.STUDENTS_POST_AND_COMMENT, label: 'classrooms.feed_students_post' },
];

type Props = {
  classroom: SpaceDetail;
  actions: ReturnType<typeof useCourseActions>;
};

/** Owner only: the course settings (details, join code, archive, delete) plus the classroom settings. */
export function ClassroomSettingsTab({ classroom, actions }: Props) {
  return (
    <CourseSettings
      course={classroom}
      actions={actions}
      extra={
        <>
          {/* An archived classroom refuses every settings write, except removing the Class key. */}
          <FeedPermissionSection classroomId={classroom.id} readOnly={!classroom.canEdit} />
          <ClassKeySection classroomId={classroom.id} readOnly={!classroom.canEdit} />
          <ClassSpendTable classroomId={classroom.id} />
        </>
      }
    />
  );
}

function FeedPermissionSection({ classroomId, readOnly }: { classroomId: string; readOnly: boolean }) {
  const t = useTranslations();
  const { data: settings, isLoading, isError } = useClassroomSettings(classroomId);
  const { mutate: updateSettings, isPending: isSaving } = useUpdateClassroomSettings(classroomId);

  return (
    <SettingsSection title={t('classrooms.feed_title')} description={t('classrooms.feed_hint')}>
      <QueryState isLoading={isLoading} isError={isError} errorMessage={t('classrooms.failed_to_load_settings')}>
        <div className="space-y-2">
          <Label htmlFor="feed-permission">{t('classrooms.feed_label')}</Label>
          <Select
            value={String(settings?.feedPermission ?? FeedPermission.TEACHERS_ONLY)}
            disabled={readOnly || isSaving}
            onValueChange={value => updateSettings({ feedPermission: Number(value) })}
          >
            <SelectTrigger id="feed-permission" className="max-w-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {FEED_OPTIONS.map(option => (
                <SelectItem key={option.value} value={String(option.value)}>
                  {t(option.label)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </QueryState>
    </SettingsSection>
  );
}
