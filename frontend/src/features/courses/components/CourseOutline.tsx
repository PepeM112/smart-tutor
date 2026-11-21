'use client';

import { BookOpen, FileText, GraduationCap } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { SpaceItemKind, type SpaceDetail, type SpaceItemRead, type SpaceSectionRead } from '@/client';

import { itemAction } from '../lib/itemAction';
import { canDo } from '../lib/permissions';

import { CourseContentFrame, CourseItemRow, CourseSectionFrame } from './CourseLayout';
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
  const trackedCourse = course && canDo(course.myRole, 'trackProgress') ? course : undefined;

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
                    <ScheduleBadges item={item} isAuthor={!course || !canDo(course.myRole, 'trackProgress')} />
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

export function ItemIcon({ item }: { item: SpaceItemRead }) {
  const Icon =
    item.kind === SpaceItemKind.TEST ? BookOpen : item.kind === SpaceItemKind.COURSE ? GraduationCap : FileText;
  return <Icon className="size-4 shrink-0 text-muted-foreground" />;
}
