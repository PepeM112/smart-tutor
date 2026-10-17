'use client';

import { Archive, ArchiveRestore, Link2, RefreshCw, Share2, Trash2, UserPlus } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

import { SpaceStatus, type SpaceDetail, type SpaceVisibility } from '@/client';
import { ActionsMenu, type MobileAction } from '@/components/shared/ActionsMenu';
import { CopyChip } from '@/components/shared/CopyChip';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { TagInput } from '@/features/notes/components/TagInput';
import { SettingsSection } from '@/features/settings/components/SettingsSection';
import { copyText } from '@/lib/copyText';
import { Routes } from '@/lib/routes';

import { type useCourseActions } from '../hooks/useCourseActions';
import { COURSE_LIMITS } from '../lib/limits';

import { DuplicateCourseDialog } from './DuplicateCourseDialog';
import { InviteUserDialog } from './InviteUserDialog';
import { VisibilitySelect } from './VisibilitySelect';

type Actions = ReturnType<typeof useCourseActions>;

type Props = {
  course: SpaceDetail;
  actions: Actions;
};

/** The owner page: details, join code, Duplicate, archive and delete. Only the owner reaches it. */
export function CourseSettings({ course, actions }: Props) {
  return (
    // Flat sections, not cards: they are parts of one settings page (design.md).
    <div className="flex flex-col gap-8">
      {course.canEdit && <DetailsForm course={course} actions={actions} />}
      {course.joinCode && <JoinCodeCard course={course} joinCode={course.joinCode} actions={actions} />}
      <DuplicateCard course={course} actions={actions} />
      <DangerZone course={course} actions={actions} />
    </div>
  );
}

function DetailsForm({ course, actions }: Props) {
  const t = useTranslations();
  const [title, setTitle] = useState(course.title);
  const [description, setDescription] = useState(course.description);
  const [tags, setTags] = useState(course.tags);
  const [visibility, setVisibility] = useState<SpaceVisibility>(course.visibility);

  function handleSubmit(e: React.SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    actions.updateCourse.mutate({ title: title.trim(), description, tags, visibility });
  }

  return (
    <SettingsSection title={t('courses.details_title')}>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div className="space-y-2">
          <Label htmlFor="course-title">{t('courses.title_label')}</Label>
          <Input
            id="course-title"
            value={title}
            onChange={e => setTitle(e.target.value)}
            maxLength={COURSE_LIMITS.title}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="course-description">{t('courses.description_label')}</Label>
          <Textarea
            id="course-description"
            value={description}
            onChange={e => setDescription(e.target.value)}
            maxLength={COURSE_LIMITS.description}
            rows={4}
          />
        </div>
        <div className="space-y-2">
          <Label>{t('courses.tags_label')}</Label>
          <TagInput tags={tags} onChange={setTags} />
        </div>
        <VisibilitySelect value={visibility} onChange={setVisibility} />
        <div>
          <Button type="submit" disabled={!title.trim()} loading={actions.updateCourse.isPending}>
            {t('common.save')}
          </Button>
        </div>
      </form>
    </SettingsSection>
  );
}

function JoinCodeCard({ course, joinCode, actions }: Props & { joinCode: string }) {
  const t = useTranslations();
  const [isInviteOpen, setIsInviteOpen] = useState(false);
  const canManage = course.canEdit;

  const shareActions: MobileAction[] = [
    {
      label: t('courses.copy_link'),
      icon: Link2,
      // Read the origin on click, not on render: the server has no `window`.
      onClick: () =>
        void copyText(`${window.location.origin}${Routes.COURSE_JOIN(joinCode)}`, {
          copied: t('common.copied'),
          failed: t('common.failed_to_copy'),
        }),
    },
    // An archived course takes no new members, so there is no invite.
    ...(canManage ? [{ label: t('courses.invite'), icon: UserPlus, onClick: () => setIsInviteOpen(true) }] : []),
  ];

  return (
    <SettingsSection title={t('courses.join_code_title')} description={t('courses.join_code_hint')}>
      <div className="flex flex-wrap items-center gap-2">
        <CopyChip text={joinCode} label={t('courses.copy_code')} />
        <ActionsMenu
          actions={shareActions}
          trigger={
            <Button variant="outline" icon={Share2}>
              {t('courses.share')}
            </Button>
          }
        />
        {canManage && (
          <Button
            variant="ghost"
            icon={RefreshCw}
            loading={actions.regenerateJoinCode.isPending}
            onClick={() => actions.regenerateJoinCode.mutate()}
          >
            {t('courses.regenerate_code')}
          </Button>
        )}
      </div>
      <InviteUserDialog open={isInviteOpen} onOpenChange={setIsInviteOpen} actions={actions} />
    </SettingsSection>
  );
}

function DuplicateCard({ course, actions }: Props) {
  const t = useTranslations();

  return (
    <SettingsSection title={t('courses.duplicate_title')} description={t('courses.duplicate_hint')}>
      <div>
        <DuplicateCourseDialog course={course} actions={actions} />
      </div>
    </SettingsSection>
  );
}

function DangerZone({ course, actions }: Props) {
  const t = useTranslations();
  const [confirmTitle, setConfirmTitle] = useState('');
  const isArchived = course.status === SpaceStatus.ARCHIVED;

  return (
    <SettingsSection title={t('courses.danger_zone')}>
      <div className="flex flex-wrap gap-2">
        {isArchived ? (
          <Button
            variant="outline"
            icon={ArchiveRestore}
            loading={actions.unarchive.isPending}
            onClick={() => actions.unarchive.mutate()}
          >
            {t('courses.unarchive')}
          </Button>
        ) : (
          <ConfirmDialog
            trigger={
              <Button variant="outline" icon={Archive}>
                {t('courses.archive')}
              </Button>
            }
            title={t('courses.archive')}
            description={t('courses.archive_description')}
            confirmLabel={t('courses.archive')}
            onConfirm={() => actions.archive.mutate()}
          />
        )}

        {/* Typing the title is the safeguard: the backend checks it too. */}
        <ConfirmDialog
          trigger={
            <Button variant="destructive" icon={Trash2}>
              {t('courses.delete_forever')}
            </Button>
          }
          title={t('courses.delete_forever')}
          description={t('courses.delete_forever_description', { title: course.title })}
          confirmLabel={t('courses.delete_forever')}
          confirmClassName="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          disableConfirm={confirmTitle !== course.title || actions.deleteForever.isPending}
          onOpenChange={open => !open && setConfirmTitle('')}
          onConfirm={() => actions.deleteForever.mutate(confirmTitle)}
        >
          <Input
            value={confirmTitle}
            onChange={e => setConfirmTitle(e.target.value)}
            placeholder={course.title}
            aria-label={t('courses.delete_forever_confirm_label')}
          />
        </ConfirmDialog>
      </div>
    </SettingsSection>
  );
}
