'use client';

import { Archive, LogOut, Pencil } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

import { MemberStatus, SpaceRole, SpaceStatus, SpaceVisibility, type SpaceDetail } from '@/client';
import { LoadingSpinner } from '@/components/shared/LoadingSpinner';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useBreadcrumb } from '@/hooks/useBreadcrumb';
import { Routes } from '@/lib/routes';

import { useCourse } from '../hooks/useCourse';
import { useCourseActions } from '../hooks/useCourseActions';
import { ROLE_LABELS, VISIBILITY_LABELS } from '../lib/labels';

import { CourseDraftEditor } from './CourseDraftEditor';
import { CourseMembers } from './CourseMembers';
import { CourseOutline } from './CourseOutline';
import { CourseSettings } from './CourseSettings';
import { PublishDialog } from './PublishDialog';

type Actions = ReturnType<typeof useCourseActions>;

/** `/courses/[slug-id]`: header, membership actions, and the Content / Members / Settings tabs. */
export function CoursePage({ courseId }: { courseId: string }) {
  const t = useTranslations();
  const { data: course, isLoading, error } = useCourse(courseId);
  const actions = useCourseActions(courseId);

  useBreadcrumb(course?.title ?? '', [{ label: t('courses.title'), href: Routes.COURSES }], Routes.COURSES);

  if (isLoading) return <LoadingSpinner />;
  if (!course) return <CourseUnavailable status={(error as { status?: number } | null)?.status} actions={actions} />;

  const isActiveMember = course.myStatus === MemberStatus.ACTIVE;
  const isAuthor = isActiveMember && (course.myRole === SpaceRole.OWNER || course.myRole === SpaceRole.EDITOR);

  return (
    <div className="flex flex-col gap-6">
      <CourseHeader course={course} actions={actions} />

      {course.status === SpaceStatus.ARCHIVED && (
        <div className="flex items-center gap-2 rounded-xl border border-border bg-muted px-4 py-3 text-sm text-muted-foreground">
          <Archive className="size-4 shrink-0" />
          {t('courses.archived_banner')}
        </div>
      )}

      {isAuthor ? (
        <Tabs defaultValue="content">
          <TabsList>
            <TabsTrigger value="content">{t('courses.tab_content')}</TabsTrigger>
            <TabsTrigger value="members">{t('courses.tab_members')}</TabsTrigger>
            <TabsTrigger value="settings">{t('courses.tab_settings')}</TabsTrigger>
          </TabsList>
          <TabsContent value="content" className="pt-4">
            <AuthorContent course={course} actions={actions} />
          </TabsContent>
          <TabsContent value="members" className="pt-4">
            <CourseMembers course={course} actions={actions} />
          </TabsContent>
          <TabsContent value="settings" className="pt-4">
            <CourseSettings course={course} actions={actions} />
          </TabsContent>
        </Tabs>
      ) : (
        <CourseOutline sections={course.sections} linkItems={isActiveMember} />
      )}
    </div>
  );
}

/** A 403 is a course the user can not see (PRIVATE, or not published): they can still ask to join. */
function CourseUnavailable({ status, actions }: { status: number | undefined; actions: Actions }) {
  const t = useTranslations();

  if (status !== 403) {
    return <p className="py-12 text-center text-sm text-muted-foreground">{t('courses.not_found')}</p>;
  }
  return (
    <div className="flex flex-col items-center gap-4 py-12 text-center">
      <p className="text-sm text-muted-foreground">{t('courses.no_access')}</p>
      <Button loading={actions.join.isPending} onClick={() => actions.join.mutate()}>
        {t('courses.request_to_join')}
      </Button>
    </div>
  );
}

function CourseHeader({ course, actions }: { course: SpaceDetail; actions: Actions }) {
  const t = useTranslations();

  return (
    <header className="flex flex-col gap-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold text-foreground">{course.title}</h1>
          <p className="text-sm text-muted-foreground">{t('courses.by_owner', { name: course.ownerName })}</p>
        </div>
        <MembershipActions course={course} actions={actions} />
      </div>
      {course.description && <p className="text-sm whitespace-pre-line text-foreground">{course.description}</p>}
      <div className="flex flex-wrap gap-2 text-xs">
        <Badge>{t(VISIBILITY_LABELS[course.visibility])}</Badge>
        <Badge>{t('courses.member_count', { count: course.memberCount })}</Badge>
        {course.myRole && course.myStatus === MemberStatus.ACTIVE && <Badge>{t(ROLE_LABELS[course.myRole])}</Badge>}
        {!course.publishedAt && <Badge>{t('courses.not_published')}</Badge>}
        {course.tags.map(tag => (
          <Badge key={tag}>#{tag}</Badge>
        ))}
      </div>
    </header>
  );
}

function Badge({ children }: { children: React.ReactNode }) {
  return <span className="rounded-full bg-muted px-2 py-0.5 text-muted-foreground">{children}</span>;
}

/** Join / request, accept / decline an invitation, cancel a request, or leave. The owner has none. */
function MembershipActions({ course, actions }: { course: SpaceDetail; actions: Actions }) {
  const t = useTranslations();
  const [isLeaveOpen, setIsLeaveOpen] = useState(false);
  const isArchived = course.status === SpaceStatus.ARCHIVED;

  if (course.isOwner) return null;

  if (course.myStatus === MemberStatus.INVITED) {
    return (
      <div className="flex gap-2">
        <Button
          variant="outline"
          loading={actions.declineInvitation.isPending}
          onClick={() => actions.declineInvitation.mutate()}
        >
          {t('courses.decline')}
        </Button>
        <Button loading={actions.acceptInvitation.isPending} onClick={() => actions.acceptInvitation.mutate()}>
          {t('courses.accept')}
        </Button>
      </div>
    );
  }

  if (course.myStatus === MemberStatus.REQUESTED) {
    return (
      <div className="flex items-center gap-2">
        <span className="text-sm text-muted-foreground">{t('courses.request_sent')}</span>
        <Button variant="outline" loading={actions.leave.isPending} onClick={() => actions.leave.mutate()}>
          {t('courses.cancel_request')}
        </Button>
      </div>
    );
  }

  if (course.myStatus === MemberStatus.ACTIVE) {
    return (
      <>
        <Button variant="outline" icon={LogOut} onClick={() => setIsLeaveOpen(true)}>
          {t('courses.leave')}
        </Button>
        <ConfirmDialog
          open={isLeaveOpen}
          onOpenChange={setIsLeaveOpen}
          title={t('courses.leave')}
          description={t('courses.leave_description')}
          confirmLabel={t('courses.leave')}
          onConfirm={() => actions.leave.mutate()}
        />
      </>
    );
  }

  // An archived course takes no new members.
  if (isArchived) return null;

  const isPrivate = course.visibility === SpaceVisibility.PRIVATE;
  return (
    <Button loading={actions.join.isPending} onClick={() => actions.join.mutate()}>
      {t(isPrivate ? 'courses.request_to_join' : 'courses.join')}
    </Button>
  );
}

/** Authors: the draft editor in edit mode, else the published outline with an "Edit course" button. */
function AuthorContent({ course, actions }: { course: SpaceDetail; actions: Actions }) {
  const t = useTranslations();

  if (course.isEditing && course.draftSections) {
    return (
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card px-4 py-3 shadow-card">
          <p className="text-sm text-muted-foreground">{t('courses.editing_hint')}</p>
          {course.canEdit && (
            <div className="flex gap-2">
              {course.publishedAt && (
                <ConfirmDialog
                  trigger={<Button variant="outline">{t('courses.discard_draft')}</Button>}
                  title={t('courses.discard_draft')}
                  description={t('courses.discard_draft_description')}
                  confirmLabel={t('courses.discard_draft')}
                  onConfirm={() => actions.discardDraft.mutate()}
                />
              )}
              <PublishDialog
                draftSections={course.draftSections}
                isPending={actions.publish.isPending}
                onPublish={(body, onDone) => actions.publish.mutate(body, { onSuccess: onDone })}
              />
            </div>
          )}
        </div>
        {course.canEdit ? (
          <CourseDraftEditor course={course} actions={actions} />
        ) : (
          <CourseOutline sections={course.draftSections} linkItems={false} />
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {course.canEdit && (
        <div>
          <Button
            variant="outline"
            icon={Pencil}
            loading={actions.enterEditMode.isPending}
            onClick={() => actions.enterEditMode.mutate()}
          >
            {t('courses.edit_course')}
          </Button>
        </div>
      )}
      <CourseOutline sections={course.sections} linkItems />
    </div>
  );
}
