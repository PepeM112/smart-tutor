'use client';

import { Archive, ArchiveRestore, Copy, Link2, RefreshCw, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

import { SpaceStatus, type SpaceDetail, type SpaceVisibility } from '@/client';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { TagInput } from '@/features/notes/components/TagInput';
import { copyText } from '@/features/notes/editor/copyText';
import { Routes } from '@/lib/routes';

import { type useCourseActions } from '../hooks/useCourseActions';
import { COURSE_LIMITS } from '../lib/limits';

import { VisibilitySelect } from './VisibilitySelect';

type Actions = ReturnType<typeof useCourseActions>;

type Props = {
  course: SpaceDetail;
  actions: Actions;
};

/** Authors see the join code and Duplicate. The owner also edits the details, archives and deletes. */
export function CourseSettings({ course, actions }: Props) {
  return (
    <div className="flex flex-col gap-6">
      {course.isOwner && course.canEdit && <DetailsForm course={course} actions={actions} />}
      {course.joinCode && <JoinCodeCard course={course} joinCode={course.joinCode} actions={actions} />}
      <DuplicateCard actions={actions} />
      {course.isOwner && <DangerZone course={course} actions={actions} />}
    </div>
  );
}

function SettingsCard({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-4 rounded-xl border border-border bg-card p-4 shadow-card">
      <div>
        <h3 className="font-medium text-foreground">{title}</h3>
        {hint && <p className="text-sm text-muted-foreground">{hint}</p>}
      </div>
      {children}
    </section>
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
    <SettingsCard title={t('courses.details_title')}>
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
    </SettingsCard>
  );
}

function JoinCodeCard({ course, joinCode, actions }: Props & { joinCode: string }) {
  const t = useTranslations();
  const messages = { copied: t('courses.copied'), failed: t('courses.copy_failed') };

  return (
    <SettingsCard title={t('courses.join_code_title')} hint={t('courses.join_code_hint')}>
      <div className="flex flex-wrap items-center gap-2">
        <code className="rounded-md bg-muted px-3 py-1.5 font-mono text-sm text-foreground">{joinCode}</code>
        <Button variant="outline" size="sm" icon={Copy} onClick={() => void copyText(joinCode, messages)}>
          {t('courses.copy_code')}
        </Button>
        <Button
          variant="outline"
          size="sm"
          icon={Link2}
          // Read the origin on click, not on render: the server has no `window`.
          onClick={() => void copyText(`${window.location.origin}${Routes.COURSE_JOIN(joinCode)}`, messages)}
        >
          {t('courses.copy_link')}
        </Button>
        {course.isOwner && course.canEdit && (
          <Button
            variant="ghost"
            size="sm"
            icon={RefreshCw}
            loading={actions.regenerateJoinCode.isPending}
            onClick={() => actions.regenerateJoinCode.mutate()}
          >
            {t('courses.regenerate_code')}
          </Button>
        )}
      </div>
    </SettingsCard>
  );
}

function DuplicateCard({ actions }: { actions: Actions }) {
  const t = useTranslations();

  return (
    <SettingsCard title={t('courses.duplicate_title')} hint={t('courses.duplicate_hint')}>
      <div>
        <Button
          variant="outline"
          icon={Copy}
          loading={actions.duplicate.isPending}
          onClick={() => actions.duplicate.mutate()}
        >
          {t('courses.duplicate')}
        </Button>
      </div>
    </SettingsCard>
  );
}

function DangerZone({ course, actions }: Props) {
  const t = useTranslations();
  const [confirmTitle, setConfirmTitle] = useState('');
  const isArchived = course.status === SpaceStatus.ARCHIVED;

  return (
    <SettingsCard title={t('courses.danger_zone')}>
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
    </SettingsCard>
  );
}
