'use client';

import { BookOpen, FileText, GraduationCap } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { SpaceItemKind, type SpaceDetail, type SpaceItemRead, type SpaceSectionRead } from '@/client';
import { courseHref, noteHref, Routes } from '@/lib/routes';

import { isCourseViewer } from '../lib/progress';

import { CourseContentFrame, CourseItemRow, CourseSectionFrame, type ItemRowAction } from './CourseLayout';
import { CourseProgressBar, ItemProgressCircle, TestAttemptButton, TestAttemptInfo } from './CourseProgress';
import { ScheduleBadges } from './ScheduleBadges';

type Props = {
  sections: SpaceSectionRead[];
  /** With a VIEWER course: rows show progress, and tests show the attempt state and Start / Resume. */
  course?: SpaceDetail;
  /** False for a preview (not a member): titles only, no links. */
  linkItems: boolean;
  /** Opens the note preview pane. A note row is a button when it is set (and `linkItems`). */
  onOpenNote?: (noteId: string) => void;
  /** The item to mark and scroll to (from `?item=`). */
  selectedItemId?: string | null;
};

/** The published structure, as members see it. */
export function CourseOutline({ sections, course, linkItems, onOpenNote, selectedItemId }: Props) {
  const t = useTranslations();
  const trackedCourse = course && isCourseViewer(course) ? course : undefined;

  if (sections.length === 0) {
    return <p className="py-12 text-center text-sm text-muted-foreground">{t('courses.no_content')}</p>;
  }

  return (
    <CourseContentFrame>
      {sections.map(section => (
        <CourseSectionFrame key={section.id} title={section.title} itemCount={section.items.length}>
          {section.items.length === 0 ? (
            <li className="px-4 py-2 text-sm text-muted-foreground">{t('courses.section_empty')}</li>
          ) : (
            section.items.map(item => (
              <CourseItemRow
                key={item.id}
                isSelected={item.id === selectedItemId}
                icon={<ItemIcon item={item} />}
                title={item.title}
                // A COURSE item has the progress bar of its course instead of a circle.
                progress={
                  trackedCourse &&
                  item.kind !== SpaceItemKind.COURSE && <ItemProgressCircle done={item.completed ?? false} />
                }
                badge={
                  <>
                    {item.kind === SpaceItemKind.COURSE && trackedCourse && item.childProgress && (
                      <CourseProgressBar progress={item.childProgress} className="w-40 shrink-0" />
                    )}
                    <ScheduleBadges item={item} isAuthor={!course || !isCourseViewer(course)} />
                    {trackedCourse && item.kind === SpaceItemKind.TEST && <TestAttemptInfo item={item} />}
                  </>
                }
                actions={
                  trackedCourse &&
                  item.kind === SpaceItemKind.TEST &&
                  linkItems && <TestAttemptButton course={trackedCourse} item={item} />
                }
                action={linkItems ? itemAction(item, onOpenNote, trackedCourse !== undefined) : undefined}
              />
            ))
          )}
        </CourseSectionFrame>
      ))}
    </CourseContentFrame>
  );
}

/**
 * A note opens the preview (the preview has a link to the full page). A test links to its page.
 * A viewer takes a test through the Start / Resume button, so a viewer's test row has no link.
 */
function itemAction(
  item: SpaceItemRead,
  onOpenNote: Props['onOpenNote'],
  isViewer: boolean
): ItemRowAction | undefined {
  const { noteId } = item;
  if (item.kind === SpaceItemKind.NOTE && noteId && onOpenNote) return { onClick: () => onOpenNote(noteId) };
  if (item.kind === SpaceItemKind.TEST && isViewer) return undefined;
  if (item.kind === SpaceItemKind.COURSE && item.childSpaceId) {
    return { href: courseHref({ id: item.childSpaceId, title: item.title }) };
  }
  const href = itemHref(item);
  return href ? { href } : undefined;
}

/** The link to the content of a published item: the note page, or the exam of a test. */
function itemHref(item: SpaceItemRead): string | null {
  if (item.kind === SpaceItemKind.NOTE && item.noteId) return noteHref({ id: item.noteId, title: item.title });
  if (item.kind === SpaceItemKind.TEST && item.testId) return Routes.TEST_DETAIL(item.testId);
  return null;
}

export function ItemIcon({ item }: { item: SpaceItemRead }) {
  const Icon =
    item.kind === SpaceItemKind.TEST ? BookOpen : item.kind === SpaceItemKind.COURSE ? GraduationCap : FileText;
  return <Icon className="size-4 shrink-0 text-muted-foreground" />;
}
