'use client';

import { Archive } from 'lucide-react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';

import { SpaceItemKind, SpaceStatus, type SpaceDetail } from '@/client';
import { LoadingSpinner } from '@/components/shared/LoadingSpinner';
import { OutlineColumn } from '@/components/shared/OutlineColumn';
import { ResponsiveSplitPane } from '@/components/shared/ResponsiveSplitPane';
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
import { canDo } from '@/features/courses/lib/permissions';
import { findItem, findNoteItem } from '@/features/courses/lib/progress';
import { Stream } from '@/features/feed/components/Stream';
import { NotePreviewPanel } from '@/features/files/components/NotePreviewPanel';
import { useBreadcrumb } from '@/hooks/useBreadcrumb';
import { usePageActions } from '@/hooks/usePageActions';
import { useUrlTab } from '@/hooks/useUrlTab';
import { COURSE_ITEM_PARAM, Routes, classroomHref } from '@/lib/routes';
import { cn, errorStatus } from '@/lib/utils';

import { AiKeyNotice } from './AiKeyNotice';
import { ClassroomSettingsTab } from './ClassroomSettingsTab';
import { DueSoonList } from './DueSoonList';
import { GradesTab } from './GradesTab';

const TABS = ['stream', 'classwork', 'members', 'grades', 'settings'] as const;
type ClassroomTab = (typeof TABS)[number];

/** The grades table is wider than the reading column, so it takes the width of the page. */
const WIDE_COLUMN_CLASS = 'flex w-full flex-col gap-6';

/** The note in the preview pane, and the mode it was opened in (enter edit, publish and discard change note ids). */
type PreviewNote = { noteId: string; isEditing: boolean };

/**
 * `/classrooms/[slug-id]`. The page header has the tab as its title and the membership and teacher actions
 * (`usePageActions`). The outline column has the classroom facts and the Stream / Classwork / Members / Grades /
 * Settings tabs as a list of links (the Contents drawer below `lg`).
 */
export function ClassroomPage({ classroomId }: { classroomId: string }) {
  const t = useTranslations();
  const { data: classroom, isLoading, error } = useCourse(classroomId);
  const actions = useCourseActions(classroomId, { isClassroom: true });
  const [requestedTab] = useUrlTab(TABS, 'classwork');
  const [previewNote, setPreviewNote] = useState<PreviewNote | null>(null);
  // `?item=<id>`: a link selects one item. A note opens in the preview pane.
  const selectedItemId = useSearchParams().get(COURSE_ITEM_PARAM);
  const [dismissedItemId, setDismissedItemId] = useState<string | null>(null);

  const tab = classroom && visibleTabs(classroom).includes(requestedTab) ? requestedTab : 'classwork';
  useBreadcrumb(
    classroom ? t(`classrooms.tab_${tab}`) : '',
    [
      { label: t('classrooms.title'), href: Routes.CLASSROOMS },
      ...(classroom ? [{ label: classroom.title, href: classroomHref(classroom) }] : []),
    ],
    Routes.CLASSROOMS
  );
  // The header renders this node twice (desktop and phone). It reads the classroom itself, so the node stays stable.
  const headerActions = useMemo(() => <ClassroomHeaderActions classroomId={classroomId} />, [classroomId]);
  usePageActions(headerActions);

  const status = errorStatus(error);
  if (isLoading) return <LoadingSpinner />;
  // A failed refetch keeps the old `data`: after a leave or a delete, Back must not show the old view.
  if (!classroom || status === 403 || status === 404) {
    return <CourseUnavailable status={status} actions={actions} isClassroom />;
  }

  const { isMember } = courseAccess(classroom);
  const tabs = visibleTabs(classroom);

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
    <div className={tab === 'grades' ? WIDE_COLUMN_CLASS : COURSE_COLUMN_CLASS}>
      <AiKeyNotice classroomId={classroom.id} myRole={classroom.myRole} />
      {classroom.status === SpaceStatus.ARCHIVED && (
        <div className="flex items-center gap-2 rounded-xl border border-border bg-muted px-4 py-3 text-sm text-muted-foreground">
          <Archive className="size-4 shrink-0" />
          {t('classrooms.archived_banner')}
        </div>
      )}

      {tab === 'stream' &&
        (isMember ? (
          <Stream classroomId={classroom.id} />
        ) : (
          <p className="text-sm text-muted-foreground">{t('feed.members_only')}</p>
        ))}
      {tab === 'classwork' && (
        <div className="flex flex-col gap-6">
          {canDo(classroom.myRole, 'trackProgress') && <DueSoonList classroomId={classroom.id} />}
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
        </div>
      )}
      {tab === 'members' && <CourseMembers course={classroom} actions={actions} />}
      {tab === 'grades' && <GradesTab classroom={classroom} />}
      {tab === 'settings' && <ClassroomSettingsTab classroom={classroom} actions={actions} />}
    </div>
  );

  return (
    <OutlineColumn
      storageKey="classroom-outline-width"
      label={t('classrooms.outline_label')}
      outline={<ClassroomOutline classroom={classroom} tabs={tabs} activeTab={tab} />}
    >
      <div className="flex h-full min-h-0 flex-col">
        <ResponsiveSplitPane
          storageKey="classroom-preview-split-ratio"
          // The classroom used the course key before: keep the saved width until the first resize.
          legacyStorageKey="course-preview-split-ratio"
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
    </OutlineColumn>
  );
}

/** Join or leave for a member or a visitor, and the teacher actions. The settings are a tab, so there is no cog link. */
function ClassroomHeaderActions({ classroomId }: { classroomId: string }) {
  const { data: classroom } = useCourse(classroomId);
  const actions = useCourseActions(classroomId, { isClassroom: true });
  if (!classroom) return null;

  return (
    <div className="flex items-center gap-2">
      <MembershipActions course={classroom} actions={actions} />
      <AuthorActions course={classroom} actions={actions} hasSettingsLink={false} />
    </div>
  );
}

interface ClassroomOutlineProps {
  classroom: SpaceDetail;
  tabs: ClassroomTab[];
  activeTab: ClassroomTab;
}

/** The classroom in the outline column and in the Contents drawer: the facts, the key notice and the tabs. */
function ClassroomOutline({ classroom, tabs, activeTab }: ClassroomOutlineProps) {
  const t = useTranslations();
  const baseHref = classroomHref(classroom);
  const facts = [
    t('courses.member_count', { count: classroom.memberCount }),
    t(VISIBILITY_LABELS[classroom.visibility]),
    classroom.joinCode ? t('classrooms.join_code', { code: classroom.joinCode }) : null,
  ].filter(Boolean);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2 px-2">
        <p className="text-sm text-foreground">{t('classrooms.by_owner', { name: classroom.ownerName })}</p>
        <p className="text-xs text-muted-foreground">{facts.join(' · ')}</p>
        {classroom.description && (
          <p className="text-sm whitespace-pre-line text-muted-foreground">{classroom.description}</p>
        )}
        {canDo(classroom.myRole, 'trackProgress') && classroom.progress && (
          <CourseProgressBar progress={classroom.progress} />
        )}
        <div className="flex flex-wrap gap-1.5 text-xs">
          {classroom.myRole && <Badge>{t(roleLabelKey(classroom.myRole, true))}</Badge>}
          {!classroom.publishedAt && <Badge>{t('courses.not_published')}</Badge>}
          {classroom.tags.map(tag => (
            <Badge key={tag}>#{tag}</Badge>
          ))}
        </div>
      </div>

      <ul className="flex flex-col gap-0.5">
        {tabs.map(value => (
          <li key={value}>
            <Link
              href={`${baseHref}?tab=${value}`}
              replace
              scroll={false}
              aria-current={value === activeTab ? 'page' : undefined}
              className={cn(
                'block rounded-lg px-2 py-1.5 text-sm outline-none transition-colors focus-visible:bg-muted',
                value === activeTab ? 'bg-muted font-medium text-foreground' : 'text-muted-foreground hover:bg-muted/60'
              )}
            >
              {t(`classrooms.tab_${value}`)}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** The tabs the user may see. Members and Grades are for teachers, Settings for the owner. */
function visibleTabs(classroom: SpaceDetail): ClassroomTab[] {
  const { isAuthor } = courseAccess(classroom);
  return TABS.filter(tab => {
    if (tab === 'members' || tab === 'grades') return isAuthor;
    if (tab === 'settings') return classroom.isOwner;
    return true;
  });
}
