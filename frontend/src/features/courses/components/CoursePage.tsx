'use client';

import { useIsMutating, useMutationState } from '@tanstack/react-query';
import { Archive, Check, GraduationCap, Loader2, LogOut, Pencil, Play, Settings, TriangleAlert } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

import { MemberStatus, SpaceItemKind, SpaceStatus, SpaceVisibility, type SpaceDetail } from '@/client';
import { ActionsMenu, type MobileAction } from '@/components/shared/ActionsMenu';
import { LoadingSpinner } from '@/components/shared/LoadingSpinner';
import { ResponsiveSplitPane } from '@/components/shared/ResponsiveSplitPane';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { NotePreviewPanel } from '@/features/files/components/NotePreviewPanel';
import { useBreadcrumb } from '@/hooks/useBreadcrumb';
import { useUrlTab } from '@/hooks/useUrlTab';
import { courseAttemptHref, courseSettingsHref, Routes } from '@/lib/routes';
import { cn, errorStatus } from '@/lib/utils';

import { useCourse } from '../hooks/useCourse';
import { courseWriteKey, useCourseActions } from '../hooks/useCourseActions';
import { useVisitItem } from '../hooks/useCourseProgress';
import { ROLE_LABELS, VISIBILITY_LABELS } from '../lib/labels';
import { COURSE_COLUMN_CLASS } from '../lib/layout';
import { courseAccess } from '../lib/membership';
import { canTrackProgress, continueItem, findNoteItem, isCourseViewer } from '../lib/progress';

import { CopyToLibraryButton } from './CopyToLibraryButton';
import { CourseDraftEditor } from './CourseDraftEditor';
import { CourseMembers } from './CourseMembers';
import { CourseOutline } from './CourseOutline';
import { CourseProgressBar, NoteDoneButton } from './CourseProgress';
import { CourseUnavailable } from './CourseUnavailable';
import { PublishDialog } from './PublishDialog';

type Actions = ReturnType<typeof useCourseActions>;

/** The note in the preview pane, and the mode it was opened in. */
type PreviewNote = { noteId: string; isEditing: boolean };

const AUTHOR_TABS = ['content', 'members'] as const;

/** `/courses/[slug-id]`: header, membership and author actions, and the Content / Members tabs (settings is a sub-page). */
export function CoursePage({ courseId }: { courseId: string }) {
  const t = useTranslations();
  const router = useRouter();
  const { data: course, isLoading, error } = useCourse(courseId);
  const actions = useCourseActions(courseId);
  const [tab, changeTab] = useUrlTab(AUTHOR_TABS, 'content');
  const [previewNote, setPreviewNote] = useState<PreviewNote | null>(null);

  useBreadcrumb(course?.title ?? '', [{ label: t('courses.title'), href: Routes.COURSES }], Routes.COURSES);

  // A viewer who opens a note in the preview sets "Continue" to that note.
  const previewItem = course && previewNote ? findNoteItem(course.sections, previewNote.noteId) : undefined;
  useVisitItem(courseId, previewItem?.id, course !== undefined && isCourseViewer(course));

  const status = errorStatus(error);

  if (isLoading) return <LoadingSpinner />;
  // A failed refetch keeps the old `data`: after a leave or a delete, Back must not show the old view.
  if (!course || status === 403 || status === 404) return <CourseUnavailable status={status} actions={actions} />;

  const { isMember, isAuthor } = courseAccess(course);
  // Enter edit, publish and discard change the note ids (a draft twin is made or deleted): the preview closes.
  const previewNoteId = previewNote?.isEditing === course.isEditing ? previewNote.noteId : null;
  const openNote = (noteId: string) => setPreviewNote({ noteId, isEditing: course.isEditing });
  const closePreview = () => setPreviewNote(null);
  const openContinue = (): void => {
    const next = continueItem(course.sections, course.progress?.lastItemId);
    if (!next) return;
    if (next.kind === SpaceItemKind.NOTE && next.noteId) openNote(next.noteId);
    else router.push(courseAttemptHref(course, next.id));
  };
  const previewDoneItem = previewNoteId ? findNoteItem(course.sections, previewNoteId) : undefined;

  const main = (
    <div className={COURSE_COLUMN_CLASS}>
      <CourseHeader course={course} actions={actions} onContinue={openContinue} />

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
        <CourseOutline sections={course.sections} course={course} linkItems={isMember} onOpenNote={openNote} />
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
        side={
          previewNoteId ? (
            <NotePreviewPanel
              noteId={previewNoteId}
              onClose={closePreview}
              extraActions={
                <>
                  <CopyToLibraryButton noteId={previewNoteId} />
                  {previewDoneItem && <NoteDoneButton course={course} item={previewDoneItem} />}
                </>
              }
            />
          ) : null
        }
        onSideClose={closePreview}
        // The preview panel has its own frame and scroll.
        insetDrawerBody={false}
      />
    </div>
  );
}

function CourseHeader({
  course,
  actions,
  onContinue,
}: {
  course: SpaceDetail;
  actions: Actions;
  onContinue: () => void;
}) {
  const t = useTranslations();
  const hasContinue = canTrackProgress(course) && continueItem(course.sections, course.progress?.lastItemId) !== null;

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
      {isCourseViewer(course) && course.progress && (
        <div className="flex flex-wrap items-center gap-3">
          <CourseProgressBar progress={course.progress} className="min-w-48 flex-1" />
          {hasContinue && (
            <Button size="sm" icon={Play} onClick={onContinue}>
              {t('courses.continue')}
            </Button>
          )}
        </div>
      )}
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
    const reviewAction: MobileAction = {
      label: t(course.includeInSrs ? 'courses.remove_from_review' : 'courses.include_in_review'),
      icon: GraduationCap,
      onClick: () => actions.setIncludeInSrs.mutate(!course.includeInSrs),
    };
    return (
      <>
        {/* Only a course member has a membership to set. Editors may use Review too. */}
        <ActionsMenu actions={[reviewAction]} />
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

/**
 * "Saving…" while any write of this course runs (they share `courseWriteKey`), else "Saved".
 * If the newest write failed, it shows "Not saved": the toast goes away, but the draft is not saved.
 * The next write that works (or a new edit session) makes the newest write a success again.
 */
function SaveState({ courseId }: { courseId: string }) {
  const t = useTranslations();
  const isSaving = useIsMutating({ mutationKey: courseWriteKey(courseId) }) > 0;
  const lastWrite = useMutationState({
    filters: { mutationKey: courseWriteKey(courseId) },
    select: ({ state }) => ({ status: state.status, submittedAt: state.submittedAt }),
  }).reduce<{ status: string; submittedAt: number } | undefined>(
    (newest, write) => (!newest || write.submittedAt > newest.submittedAt ? write : newest),
    undefined
  );
  const isFailed = !isSaving && lastWrite?.status === 'error';
  const label = isSaving ? 'common.saving' : isFailed ? 'courses.not_saved_state' : 'courses.saved_state';

  return (
    <span
      className={cn('flex items-center gap-1.5 px-1 text-xs', isFailed ? 'text-destructive' : 'text-muted-foreground')}
      aria-live="polite"
    >
      {isSaving ? (
        <Loader2 className="size-3.5 animate-spin" />
      ) : isFailed ? (
        <TriangleAlert className="size-3.5" />
      ) : (
        <Check className="size-3.5" />
      )}
      {t(label)}
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
