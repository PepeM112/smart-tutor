'use client';

import { BookOpen, FileText } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { SpaceItemKind, type SpaceItemRead, type SpaceSectionRead } from '@/client';
import { noteHref, Routes } from '@/lib/routes';

import { CourseContentFrame, CourseItemRow, CourseSectionFrame, type ItemRowAction } from './CourseLayout';

type Props = {
  sections: SpaceSectionRead[];
  /** False for a preview (not a member): titles only, no links. */
  linkItems: boolean;
  /** Opens the note preview pane. A note row is a button when it is set (and `linkItems`). */
  onOpenNote?: (noteId: string) => void;
};

/** The published structure, as members see it. */
export function CourseOutline({ sections, linkItems, onOpenNote }: Props) {
  const t = useTranslations();

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
                icon={<ItemIcon item={item} />}
                title={item.title}
                action={linkItems ? itemAction(item, onOpenNote) : undefined}
              />
            ))
          )}
        </CourseSectionFrame>
      ))}
    </CourseContentFrame>
  );
}

/** A note opens the preview (the preview has a link to the full page). A test links to its page. */
function itemAction(item: SpaceItemRead, onOpenNote: Props['onOpenNote']): ItemRowAction | undefined {
  const { noteId } = item;
  if (item.kind === SpaceItemKind.NOTE && noteId && onOpenNote) return { onClick: () => onOpenNote(noteId) };
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
  const Icon = item.kind === SpaceItemKind.TEST ? BookOpen : FileText;
  return <Icon className="size-4 shrink-0 text-muted-foreground" />;
}
