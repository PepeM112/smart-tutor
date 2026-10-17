'use client';

import { useIsMutating } from '@tanstack/react-query';
import { Archive, Check, Loader2, LogOut, Pencil, Settings } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

import { MemberStatus, SpaceStatus, SpaceVisibility, type SpaceDetail } from '@/client';
import { LoadingSpinner } from '@/components/shared/LoadingSpinner';
import { ResponsiveSplitPane } from '@/components/shared/ResponsiveSplitPane';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { NotePreviewPanel } from '@/features/files/components/NotePreviewPanel';
import { useBreadcrumb } from '@/hooks/useBreadcrumb';
import { useUrlTab } from '@/hooks/useUrlTab';
import { courseSettingsHref, Routes } from '@/lib/routes';
import { errorStatus } from '@/lib/utils';

import { useCourse } from '../hooks/useCourse';
import { courseWriteKey, useCourseActions } from '../hooks/useCourseActions';
import { ROLE_LABELS, VISIBILITY_LABELS } from '../lib/labels';
import { COURSE_COLUMN_CLASS } from '../lib/layout';
import { courseAccess } from '../lib/membership';

import { CourseDraftEditor } from './CourseDraftEditor';
import { CourseMembers } from './CourseMembers';
import { CourseOutline } from './CourseOutline';
import { PublishDialog } from './PublishDialog';

type Actions = ReturnType<typeof useCourseActions>;

/** The note in the preview pane, and the mode it was opened in. */
type PreviewNote = { noteId: string; isEditing: boolean };

const AUTHOR_TABS = ['content', 'members'] as const;

/** `/courses/[slug-id]`: header, membership and author actions, and the Content / Members tabs (settings is a sub-page). */
export function CoursePage({ courseId }: { courseId: string }) {
  const t = useTranslations();
  const { data: course, isLoading, error } = useCourse(courseId);
  const actions = useCourseActions(courseId);
  const [tab, changeTab] = useUrlTab(AUTHOR_TABS, 'content');
  const [previewNote, setPreviewNote] = useState<PreviewNote | null>(null);

  useBreadcrumb(course?.title ?? '', [{ label: t('courses.title'), href: Routes.COURSES }], Routes.COURSES);

  const status = errorStatus(error);

  if (isLoading) return <LoadingSpinner />;
  // A failed refetch keeps the old `data`: after a leave or a delete, Back must not show the old view.
  if (!course || status === 403 || status === 404) return <CourseUnavailable status={status} actions={actions} />;

  const { isMember, isAuthor } = courseAccess(course);
  // Enter edit, publish and discard change the note ids (a draft twin is made or deleted): the preview closes.
  const previewNoteId = previewNote?.isEditing === course.isEditing ? previewNote.noteId : null;
  const openNote = (noteId: string) => setPreviewNote({ noteId, isEditing: course.isEditing });
  const closePreview = () => setPreviewNote(null);

  const main = (
    <div className={COURSE_COLUMN_CLASS}>
      <CourseHeader course={course} actions={actions} />

      {course.status === SpaceStatus.ARCHIVED && (
        <div className="flex items-center gap-2 rounded-xl border border-border bg-muted px-4 py-3 text-sm text-muted-foreground">
          <Archive className="size-4 shrink-0" />
          {t('courses.archived_banner')}
        </div>
      )}

      {isAuthor ? (
        <Tabs value={tab} onValueChange={changeTab}>
          <TabsList>
            <TabsTrigger value="content">{t('courses.tab_content')}</TabsTrigger>
            <TabsTrigger value="members">{t('courses.tab_members')}</TabsTrigger>
          </TabsList>
          <TabsContent value="content" className="pt-4">
            <AuthorContent course={course} actions={actions} onOpenNote={openNote} />
          </TabsContent>
          <TabsContent value="members" className="pt-4">
            <CourseMembers course={course} actions={actions} />
          </TabsContent>
        </Tabs>
      ) : (
        <CourseOutline sections={course.sections} linkItems={isMember} onOpenNote={openNote} />
      )}
    </div>
  );

  return (
    <div className="flex h-full min-h-0 flex-col">
      <ResponsiveSplitPane
        storageKey="course-preview-split-ratio"
        defaultRatio={0.6}
        // The course scrolls at the page edge (the layout padding moves inside the pane).
        bleed
        main={main}
        side={previewNoteId ? <NotePreviewPanel noteId={previewNoteId} onClose={closePreview} /> : null}
        onSideClose={closePreview}
        // The preview panel has its own frame and scroll.
        insetDrawerBody={false}
      />
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
          <h2 className="text-2xl font-semibold text-foreground">{course.title}</h2>
          <p className="text-sm text-muted-foreground">{t('courses.by_owner', { name: course.ownerName })}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <MembershipActions course={course} actions={actions} />
          <AuthorActions course={course} actions={actions} />
        </div>
      </div>
      {course.description && <p className="text-sm whitespace-pre-line text-foreground">{course.description}</p>}
      <div className="flex flex-wrap gap-2 text-xs">
        <Badge>{t(VISIBILITY_LABELS[course.visibility])}</Badge>
        {course.myRole && <Badge>{t(ROLE_LABELS[course.myRole])}</Badge>}
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
        {/* An archived course takes no new members (the backend gives 409). */}
        {!isArchived && (
          <Button loading={actions.acceptInvitation.isPending} onClick={() => actions.acceptInvitation.mutate()}>
            {t('courses.accept')}
          </Button>
        )}
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

/**
 * Authors: the settings cog (owner), then Edit, or in edit mode the save state, Discard and Publish.
 * Edits save to the draft at once, so there is no Save button: Publish shows the draft to members.
 */
function AuthorActions({ course, actions }: { course: SpaceDetail; actions: Actions }) {
  const t = useTranslations();

  const settings = course.isOwner && (
    <Button asChild variant="ghost" size="icon" tooltip={t('courses.tab_settings')}>
      <Link href={courseSettingsHref(course)} aria-label={t('courses.tab_settings')}>
        <Settings />
      </Link>
    </Button>
  );

  if (!course.canEdit) return settings || null;

  if (!course.isEditing || !course.draftSections) {
    return (
      <>
        {settings}
        <Button
          variant="outline"
          icon={Pencil}
          loading={actions.enterEditMode.isPending}
          onClick={() => actions.enterEditMode.mutate()}
        >
          {t('courses.edit_course')}
        </Button>
      </>
    );
  }

  return (
    <>
      {settings}
      <SaveState courseId={course.id} />
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
        hasChanges={course.hasUnpublishedChanges}
        onPublish={(body, onDone) => actions.publish.mutate(body, { onSuccess: onDone })}
      />
    </>
  );
}

/** "Saving…" while any write of this course runs (they share `courseWriteKey`), else "Saved". */
function SaveState({ courseId }: { courseId: string }) {
  const t = useTranslations();
  const isSaving = useIsMutating({ mutationKey: courseWriteKey(courseId) }) > 0;

  return (
    <span className="flex items-center gap-1.5 px-1 text-xs text-muted-foreground" aria-live="polite">
      {isSaving ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}
      {t(isSaving ? 'common.saving' : 'courses.saved_state')}
    </span>
  );
}

/** Authors: the draft editor in edit mode (a read-only draft outline for editors without edit rights), else the published outline. */
function AuthorContent({
  course,
  actions,
  onOpenNote,
}: {
  course: SpaceDetail;
  actions: Actions;
  onOpenNote: (noteId: string) => void;
}) {
  if (course.isEditing && course.draftSections) {
    return course.canEdit ? (
      <CourseDraftEditor course={course} actions={actions} onOpenNote={onOpenNote} />
    ) : (
      <CourseOutline sections={course.draftSections} linkItems={false} />
    );
  }
  return <CourseOutline sections={course.sections} linkItems onOpenNote={onOpenNote} />;
}
