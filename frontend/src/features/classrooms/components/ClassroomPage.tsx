'use client';

import { Archive } from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

import { SpaceItemKind, SpaceStatus, type SpaceDetail } from '@/client';
import { LoadingSpinner } from '@/components/shared/LoadingSpinner';
import { ResponsiveSplitPane } from '@/components/shared/ResponsiveSplitPane';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { CopyToLibraryButton } from '@/features/courses/components/CopyToLibraryButton';
import { CourseMembers } from '@/features/courses/components/CourseMembers';
import { CourseOutline } from '@/features/courses/components/CourseOutline';
import { AuthorActions, AuthorContent, Badge, MembershipActions } from '@/features/courses/components/CoursePage';
import { CourseProgressBar, NoteDoneButton } from '@/features/courses/components/CourseProgress';
import { CourseUnavailable } from '@/features/courses/components/CourseUnavailable';
import { useCourse } from '@/features/courses/hooks/useCourse';
import { useCourseActions } from '@/features/courses/hooks/useCourseActions';
import { VISIBILITY_LABELS, roleLabelKey } from '@/features/courses/lib/labels';
import { COURSE_COLUMN_CLASS } from '@/features/courses/lib/layout';
import { courseAccess } from '@/features/courses/lib/membership';
import { findItem, findNoteItem, isCourseViewer } from '@/features/courses/lib/progress';
import { NotePreviewPanel } from '@/features/files/components/NotePreviewPanel';
import { useBreadcrumb } from '@/hooks/useBreadcrumb';
import { useUrlTab } from '@/hooks/useUrlTab';
import { COURSE_ITEM_PARAM, Routes } from '@/lib/routes';
import { errorStatus } from '@/lib/utils';

import { AiKeyNotice } from './AiKeyNotice';
import { ClassroomSettingsTab } from './ClassroomSettingsTab';
import { DueSoonList } from './DueSoonList';
import { GradesTab } from './GradesTab';
import { PlaceholderTab } from './PlaceholderTab';

const TABS = ['stream', 'classwork', 'members', 'grades', 'settings'] as const;
type ClassroomTab = (typeof TABS)[number];

/** The tabs the user may see. Members and Grades are for teachers, Settings for the owner. */
function visibleTabs(classroom: SpaceDetail): ClassroomTab[] {
  const { isAuthor } = courseAccess(classroom);
  return TABS.filter(tab => {
    if (tab === 'members' || tab === 'grades') return isAuthor;
    if (tab === 'settings') return classroom.isOwner;
    return true;
  });
}

/** The note in the preview pane, and the mode it was opened in (enter edit, publish and discard change note ids). */
type PreviewNote = { noteId: string; isEditing: boolean };

/** `/classrooms/[slug-id]`: header, membership and teacher actions, and the Stream / Classwork / Members / Grades / Settings tabs. */
export function ClassroomPage({ classroomId }: { classroomId: string }) {
  const t = useTranslations();
  const { data: classroom, isLoading, error } = useCourse(classroomId);
  const actions = useCourseActions(classroomId, { isClassroom: true });
  const [requestedTab, changeTab] = useUrlTab(TABS, 'classwork');
  const [previewNote, setPreviewNote] = useState<PreviewNote | null>(null);
  // `?item=<id>`: a link selects one item. A note opens in the preview pane.
  const selectedItemId = useSearchParams().get(COURSE_ITEM_PARAM);
  const [dismissedItemId, setDismissedItemId] = useState<string | null>(null);

  useBreadcrumb(classroom?.title ?? '', [{ label: t('classrooms.title'), href: Routes.CLASSROOMS }], Routes.CLASSROOMS);

  const status = errorStatus(error);
  if (isLoading) return <LoadingSpinner />;
  // A failed refetch keeps the old `data`: after a leave or a delete, Back must not show the old view.
  if (!classroom || status === 403 || status === 404) {
    return <CourseUnavailable status={status} actions={actions} isClassroom />;
  }

  const { isMember } = courseAccess(classroom);
  const tabs = visibleTabs(classroom);
  const tab = tabs.includes(requestedTab) ? requestedTab : 'classwork';

  const openedNoteId = previewNote?.isEditing === classroom.isEditing ? previewNote.noteId : null;
  const selectedItem = selectedItemId ? findItem(classroom.sections, selectedItemId) : undefined;
  const selectedNoteId =
    !classroom.isEditing && selectedItem?.kind === SpaceItemKind.NOTE && selectedItemId !== dismissedItemId
      ? selectedItem.noteId
      : null;
  const previewNoteId = previewNote ? openedNoteId : selectedNoteId;
  const openNote = (noteId: string) => setPreviewNote({ noteId, isEditing: classroom.isEditing });
  const closePreview = () => {
    setPreviewNote(null);
    setDismissedItemId(selectedItemId);
  };
  const previewDoneItem = previewNoteId ? findNoteItem(classroom.sections, previewNoteId) : undefined;

  const main = (
    <div className={COURSE_COLUMN_CLASS}>
      <ClassroomHeader classroom={classroom} actions={actions} />

      {classroom.status === SpaceStatus.ARCHIVED && (
        <div className="flex items-center gap-2 rounded-xl border border-border bg-muted px-4 py-3 text-sm text-muted-foreground">
          <Archive className="size-4 shrink-0" />
          {t('classrooms.archived_banner')}
        </div>
      )}

      <AiKeyNotice classroomId={classroom.id} myRole={classroom.myRole} />

      <Tabs value={tab} onValueChange={changeTab}>
        <TabsList>
          {tabs.map(value => (
            <TabsTrigger key={value} value={value}>
              {t(`classrooms.tab_${value}`)}
            </TabsTrigger>
          ))}
        </TabsList>
        <TabsContent value="stream" className="pt-4">
          <PlaceholderTab title={t('classrooms.tab_stream')} text={t('classrooms.stream_coming_soon')} />
        </TabsContent>
        <TabsContent value="classwork" className="flex flex-col gap-6 pt-4">
          {isCourseViewer(classroom) && <DueSoonList classroomId={classroom.id} />}
          {courseAccess(classroom).isAuthor ? (
            <AuthorContent course={classroom} actions={actions} onOpenNote={openNote} selectedItemId={selectedItemId} />
          ) : (
            <CourseOutline
              sections={classroom.sections}
              course={classroom}
              linkItems={isMember}
              onOpenNote={openNote}
              selectedItemId={selectedItemId}
            />
          )}
        </TabsContent>
        {tabs.includes('members') && (
          <TabsContent value="members" className="pt-4">
            <CourseMembers course={classroom} actions={actions} />
          </TabsContent>
        )}
        {tabs.includes('grades') && (
          <TabsContent value="grades" className="pt-4">
            <GradesTab classroom={classroom} />
          </TabsContent>
        )}
        {tabs.includes('settings') && (
          <TabsContent value="settings" className="pt-4">
            <ClassroomSettingsTab classroom={classroom} actions={actions} />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );

  return (
    <div className="flex h-full min-h-0 flex-col">
      <ResponsiveSplitPane
        storageKey="course-preview-split-ratio"
        defaultRatio={0.6}
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
                  {previewDoneItem && <NoteDoneButton course={classroom} item={previewDoneItem} />}
                </>
              }
            />
          ) : null
        }
        onSideClose={closePreview}
        insetDrawerBody={false}
      />
    </div>
  );
}

function ClassroomHeader({
  classroom,
  actions,
}: {
  classroom: SpaceDetail;
  actions: ReturnType<typeof useCourseActions>;
}) {
  const t = useTranslations();

  return (
    <header className="flex flex-col gap-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-2xl font-semibold text-foreground">{classroom.title}</h2>
          <p className="text-sm text-muted-foreground">{t('classrooms.by_owner', { name: classroom.ownerName })}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <MembershipActions course={classroom} actions={actions} />
          {/* The classroom settings are a tab, so there is no cog link. */}
          <AuthorActions course={classroom} actions={actions} hasSettingsLink={false} />
        </div>
      </div>
      {classroom.description && <p className="text-sm whitespace-pre-line text-foreground">{classroom.description}</p>}
      {isCourseViewer(classroom) && classroom.progress && (
        <CourseProgressBar progress={classroom.progress} className="max-w-md" />
      )}
      <div className="flex flex-wrap gap-2 text-xs">
        <Badge>{t(VISIBILITY_LABELS[classroom.visibility])}</Badge>
        {classroom.myRole && <Badge>{t(roleLabelKey(classroom.myRole, true))}</Badge>}
        {!classroom.publishedAt && <Badge>{t('courses.not_published')}</Badge>}
        {classroom.tags.map(tag => (
          <Badge key={tag}>#{tag}</Badge>
        ))}
      </div>
    </header>
  );
}
