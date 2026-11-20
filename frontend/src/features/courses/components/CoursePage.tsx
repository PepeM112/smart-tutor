'use client';

import { useIsMutating, useMutationState } from '@tanstack/react-query';
import { Archive, Check, GraduationCap, Loader2, LogOut, Pencil, Play, Settings, TriangleAlert } from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';

import { MemberStatus, SpaceItemKind, SpaceKind, SpaceStatus, SpaceVisibility, type SpaceDetail } from '@/client';
import { ActionsMenu, type MobileAction } from '@/components/shared/ActionsMenu';
import { LoadingSpinner } from '@/components/shared/LoadingSpinner';
import { OutlineColumn } from '@/components/shared/OutlineColumn';
import { ResponsiveSplitPane } from '@/components/shared/ResponsiveSplitPane';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { AiKeyNotice } from '@/features/classrooms/components/AiKeyNotice';
import { NotePreviewPanel } from '@/features/files/components/NotePreviewPanel';
import { useBreadcrumb } from '@/hooks/useBreadcrumb';
import { useBreakpoint } from '@/hooks/useBreakpoint';
import { usePageActions } from '@/hooks/usePageActions';
import { useUrlTab } from '@/hooks/useUrlTab';
import { COURSE_ITEM_PARAM, courseItemHref, courseAttemptHref, courseSettingsHref } from '@/lib/routes';
import { cn, errorStatus } from '@/lib/utils';

import { useCourse } from '../hooks/useCourse';
import { courseWriteKey, useCourseActions } from '../hooks/useCourseActions';
import { AUTHOR_TABS } from '../lib/authorTabs';
import { roleLabelKey, VISIBILITY_LABELS } from '../lib/labels';
import { COURSE_COLUMN_CLASS } from '../lib/layout';
import { courseAccess } from '../lib/membership';
import { canTrackProgress, continueItem, findItem } from '../lib/progress';
import { courseBackHref, courseCrumbs } from '../lib/spaceCrumbs';

import { CopyToLibraryButton } from './CopyToLibraryButton';
import { CourseDraftEditor } from './CourseDraftEditor';
import { CourseItemView } from './CourseItemView';
import { CourseMembers } from './CourseMembers';
import { CourseOutline } from './CourseOutline';
import { CourseOutlineNav } from './CourseOutlineNav';
import { CourseUnavailable } from './CourseUnavailable';
import { PublishDialog } from './PublishDialog';

type Actions = ReturnType<typeof useCourseActions>;

interface CourseViewProps {
  course: SpaceDetail;
  actions: Actions;
}

/**
 * `/courses/[slug-id]`. A member reads the course in an outline column and the page: the overview, a note or a
 * test, chosen by `?item=`. An author in edit mode, and an empty course, have no outline: the draft editor is
 * its own outline. The actions (join, leave, edit, publish) are in the page header (`usePageActions`) from `lg`,
 * and in a toolbar at the top of the page content below it.
 */
export function CoursePage({ courseId }: { courseId: string }) {
  const t = useTranslations();
  const { data: course, isLoading, error } = useCourse(courseId);
  const actions = useCourseActions(courseId);

  useBreadcrumb(
    course?.title ?? '',
    courseCrumbs(course, { courses: t('courses.title'), classrooms: t('classrooms.title') }),
    courseBackHref(course)
  );
  // Below `lg` the actions are in the page content (`CourseToolbar`): the phone header has no room for them.
  const { isDesktop } = useBreakpoint();
  // It reads the course itself, so the node stays stable.
  const headerActions = useMemo(() => <CourseHeaderActions courseId={courseId} />, [courseId]);
  usePageActions(isDesktop ? headerActions : undefined);

  const status = errorStatus(error);

  if (isLoading) return <LoadingSpinner />;
  // A failed refetch keeps the old `data`: after a leave or a delete, Back must not show the old view.
  if (!course || status === 403 || status === 404) return <CourseUnavailable status={status} actions={actions} />;

  if (showsDraftView(course)) return <CourseDraftView course={course} actions={actions} />;
  return <CourseOutlineView course={course} actions={actions} />;
}

// An empty course has no outline to show, so it uses the draft view too.
function showsDraftView(course: SpaceDetail): boolean {
  return isDraftView(course) || course.sections.length === 0;
}

// `isEditing` alone is not enough: the backend sets it for a viewer too (the course has a draft).
function isDraftView(course: SpaceDetail): boolean {
  return courseAccess(course).isAuthor && course.isEditing && course.draftSections !== null;
}

function CourseOutlineView({ course, actions }: CourseViewProps) {
  const t = useTranslations();
  const [tab, changeTab] = useUrlTab(AUTHOR_TABS, 'content');
  const selectedItemId = useSearchParams().get(COURSE_ITEM_PARAM);
  const { isMember, isAuthor } = courseAccess(course);
  // A course of a classroom has no members of its own: only the content.
  const hasMembersTab = isAuthor && !course.parentId;
  const selectedItem = isMember && selectedItemId ? findItem(course.sections, selectedItemId) : undefined;

  return (
    <OutlineColumn
      storageKey="course-outline-width"
      label={t('outline.contents')}
      outline={
        <CourseOutlineNav
          course={course}
          linkItems={isMember}
          selectedItemId={selectedItemId}
          authorTab={hasMembersTab ? tab : undefined}
          onAuthorTabChange={changeTab}
        />
      }
    >
      <div className={COURSE_COLUMN_CLASS}>
        <CourseNotices course={course} />
        <CourseToolbar courseId={course.id} />
        {hasMembersTab && tab === 'members' ? (
          <CourseMembers course={course} actions={actions} />
        ) : selectedItem ? (
          <CourseItemView key={selectedItem.id} course={course} item={selectedItem} />
        ) : (
          <CourseOverview course={course} />
        )}
      </div>
    </OutlineColumn>
  );
}

/** The note in the preview pane, and the mode it was opened in. */
type PreviewNote = { noteId: string; isEditing: boolean };

/** The draft editor (authors in edit mode) or an empty course. A note opens in a preview pane. */
function CourseDraftView({ course, actions }: CourseViewProps) {
  const t = useTranslations();
  const [tab, changeTab] = useUrlTab(AUTHOR_TABS, 'content');
  const [previewNote, setPreviewNote] = useState<PreviewNote | null>(null);
  const selectedItemId = useSearchParams().get(COURSE_ITEM_PARAM);
  const { isMember, isAuthor } = courseAccess(course);

  // Enter edit, publish and discard change the note ids (a draft twin is made or deleted): the preview closes.
  const previewNoteId = previewNote?.isEditing === course.isEditing ? previewNote.noteId : null;
  const openNote = (noteId: string) => setPreviewNote({ noteId, isEditing: course.isEditing });
  const closePreview = () => setPreviewNote(null);

  const main = (
    <div className={COURSE_COLUMN_CLASS}>
      <CourseSummary course={course} />
      <CourseNotices course={course} />
      <CourseToolbar courseId={course.id} />

      {isAuthor && course.parentId ? (
        <AuthorContent course={course} actions={actions} onOpenNote={openNote} selectedItemId={selectedItemId} />
      ) : isAuthor ? (
        <Tabs value={tab} onValueChange={changeTab} className="gap-3">
          <TabsList>
            <TabsTrigger value="content">{t('courses.tab_content')}</TabsTrigger>
            <TabsTrigger value="members">{t('courses.tab_members')}</TabsTrigger>
          </TabsList>
          <TabsContent value="content">
            <AuthorContent course={course} actions={actions} onOpenNote={openNote} selectedItemId={selectedItemId} />
          </TabsContent>
          <TabsContent value="members">
            <CourseMembers course={course} actions={actions} />
          </TabsContent>
        </Tabs>
      ) : (
        <CourseOutline
          sections={course.sections}
          course={course}
          linkItems={isMember}
          selectedItemId={selectedItemId}
        />
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
              extraActions={<CopyToLibraryButton noteId={previewNoteId} />}
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

/**
 * Phone: the actions of the page header (join, member menu, author actions), which have no room in the header.
 * CSS hides it from `lg` (the `useBreakpoint` desktop threshold): the server cannot know the width, so a JS check
 * would make the toolbar pop in after hydration on a phone.
 */
function CourseToolbar({ courseId }: { courseId: string }) {
  return (
    <div className="lg:hidden">
      <CourseHeaderActions courseId={courseId} className="flex-wrap" />
    </div>
  );
}

/** The archived banner and the notice of a classroom without an AI key. */
function CourseNotices({ course }: { course: SpaceDetail }) {
  const t = useTranslations();

  return (
    <>
      {course.status === SpaceStatus.ARCHIVED && (
        <div className="flex items-center gap-2 rounded-xl border border-border bg-muted px-4 py-3 text-sm text-muted-foreground">
          <Archive className="size-4 shrink-0" />
          {t('courses.archived_banner')}
        </div>
      )}
      {course.parentId && <AiKeyNotice classroomId={course.parentId} myRole={course.myRole} />}
    </>
  );
}

/** The page when no item is selected: the course description and the way in (Continue). */
function CourseOverview({ course }: { course: SpaceDetail }) {
  const t = useTranslations();
  const router = useRouter();
  const next = canTrackProgress(course) ? continueItem(course.sections, course.progress?.lastItemId) : null;

  // A test goes on only with an open attempt (`continueItem`): it resumes on its attempt page.
  const openContinue = (): void => {
    if (!next) return;
    router.push(
      next.kind === SpaceItemKind.TEST ? courseAttemptHref(course, next.id) : courseItemHref(course, next.id)
    );
  };

  return (
    <div className="flex flex-col gap-6">
      <CourseSummary course={course} />
      {next && (
        <div className="flex">
          <Button icon={Play} onClick={openContinue}>
            {t('courses.continue')}
          </Button>
        </div>
      )}
    </div>
  );
}

/** The description and the badges (visibility, role, state, tags). */
function CourseSummary({ course }: { course: SpaceDetail }) {
  const t = useTranslations();

  return (
    <div className="flex flex-col gap-3">
      {course.description && <p className="text-sm whitespace-pre-line text-foreground">{course.description}</p>}
      <div className="flex flex-wrap gap-2 text-xs">
        {/* A course of a classroom has no visibility of its own. */}
        {!course.parentId && <Badge>{t(VISIBILITY_LABELS[course.visibility])}</Badge>}
        {course.myRole && <Badge>{t(roleLabelKey(course.myRole, false))}</Badge>}
        {!course.publishedAt && <Badge>{t('courses.not_published')}</Badge>}
        {course.tags.map(tag => (
          <Badge key={tag}>#{tag}</Badge>
        ))}
      </div>
    </div>
  );
}

/**
 * The actions in the page header. A note that `?item=` selected can be copied. A member has a menu (Review, Leave),
 * the others join or answer an invitation. Authors have the settings link, Edit course, or in edit mode the
 * save state, Discard and Publish (the one filled button of the page).
 */
function CourseHeaderActions({ courseId, className }: { courseId: string; className?: string }) {
  const { data: course } = useCourse(courseId);
  const actions = useCourseActions(courseId);
  const selectedItemId = useSearchParams().get(COURSE_ITEM_PARAM);

  if (!course) return null;

  const selectedItem = selectedItemId ? findItem(course.sections, selectedItemId) : undefined;
  const copyNoteId = !isDraftView(course) && selectedItem?.kind === SpaceItemKind.NOTE ? selectedItem.noteId : null;
  const isActiveMember = !course.isOwner && course.myStatus === MemberStatus.ACTIVE;

  return (
    <div className={cn('flex items-center gap-2 empty:hidden', className)}>
      {copyNoteId && <CopyToLibraryButton noteId={copyNoteId} />}
      {isActiveMember ? (
        <MemberMenu course={course} actions={actions} />
      ) : (
        <MembershipActions course={course} actions={actions} />
      )}
      <AuthorActions course={course} actions={actions} />
    </div>
  );
}

/** One "…" menu for an active member: Review (editors too), and Leave with a confirmation. */
function MemberMenu({ course, actions }: CourseViewProps) {
  const t = useTranslations();
  const isClassroom = course.kind === SpaceKind.CLASSROOM;
  const reviewAction: MobileAction = {
    label: t(course.includeInSrs ? 'courses.remove_from_review' : 'courses.include_in_review'),
    icon: GraduationCap,
    onClick: () => actions.setIncludeInSrs.mutate(!course.includeInSrs),
    disabled: actions.setIncludeInSrs.isPending,
  };
  const leaveAction: MobileAction = {
    label: t('courses.leave'),
    icon: LogOut,
    variant: 'destructive',
    onClick: () => actions.leave.mutate(),
    disabled: actions.leave.isPending,
    confirm: {
      title: t('courses.leave'),
      description: t(isClassroom ? 'classrooms.leave_description' : 'courses.leave_description'),
    },
  };
  // A course of a classroom has no leave: the classroom row decides.
  const menuActions = course.parentId ? [reviewAction] : [reviewAction, leaveAction];

  return <ActionsMenu actions={menuActions} />;
}

export function Badge({ children }: { children: React.ReactNode }) {
  return <span className="rounded-full bg-muted px-2 py-0.5 text-muted-foreground">{children}</span>;
}

/** Join / request, accept / decline an invitation, cancel a request, or leave. The owner has none. */
export function MembershipActions({ course, actions }: { course: SpaceDetail; actions: Actions }) {
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

  // A course of a classroom has no join, leave or invitation: the classroom row decides.
  if (course.parentId && course.myStatus !== MemberStatus.ACTIVE) return null;

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
        {!course.parentId && (
          <Button variant="outline" icon={LogOut} onClick={() => setIsLeaveOpen(true)}>
            {t('courses.leave')}
          </Button>
        )}
        <ConfirmDialog
          open={isLeaveOpen}
          onOpenChange={setIsLeaveOpen}
          title={t('courses.leave')}
          description={t(
            course.kind === SpaceKind.CLASSROOM ? 'classrooms.leave_description' : 'courses.leave_description'
          )}
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
export function AuthorActions({
  course,
  actions,
  hasSettingsLink = true,
}: {
  course: SpaceDetail;
  actions: Actions;
  /** False in a classroom: its settings are a tab, not a sub-page. */
  hasSettingsLink?: boolean;
}) {
  const t = useTranslations();

  const settings = hasSettingsLink && course.isOwner && (
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
export function AuthorContent({
  course,
  actions,
  onOpenNote,
  selectedItemId,
}: {
  course: SpaceDetail;
  actions: Actions;
  onOpenNote: (noteId: string) => void;
  selectedItemId: string | null;
}) {
  if (course.isEditing && course.draftSections) {
    return course.canEdit ? (
      <CourseDraftEditor course={course} actions={actions} onOpenNote={onOpenNote} />
    ) : (
      <CourseOutline sections={course.draftSections} linkItems={false} />
    );
  }
  return <CourseOutline sections={course.sections} linkItems onOpenNote={onOpenNote} selectedItemId={selectedItemId} />;
}
