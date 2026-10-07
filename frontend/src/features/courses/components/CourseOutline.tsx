'use client';

import { BookOpen, FileText } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';

import { SpaceItemKind, type SpaceItemRead, type SpaceSectionRead } from '@/client';
import { noteHref, Routes } from '@/lib/routes';

type Props = {
  sections: SpaceSectionRead[];
  /** False for a preview (not a member): titles only, no links. */
  linkItems: boolean;
};

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

/** The published structure, as members see it. */
export function CourseOutline({ sections, linkItems }: Props) {
  const t = useTranslations();

  if (sections.length === 0) {
    return <p className="py-12 text-center text-sm text-muted-foreground">{t('courses.no_content')}</p>;
  }

  return (
    <div className="flex flex-col gap-4">
      {sections.map(section => (
        <section key={section.id} className="rounded-xl border border-border bg-card shadow-card">
          <h3 className="px-4 pt-4 pb-2 font-medium text-foreground">{section.title}</h3>
          {section.items.length === 0 ? (
            <p className="px-4 pb-4 text-sm text-muted-foreground">{t('courses.section_empty')}</p>
          ) : (
            <ul className="pb-2">
              {section.items.map(item => {
                const href = linkItems ? itemHref(item) : null;
                const content = (
                  <>
                    <ItemIcon item={item} />
                    <span className="truncate">{item.title}</span>
                  </>
                );
                return (
                  <li key={item.id}>
                    {href ? (
                      <Link
                        href={href}
                        className="flex items-center gap-3 px-4 py-2 text-sm text-foreground transition-colors hover:bg-muted/50"
                      >
                        {content}
                      </Link>
                    ) : (
                      <div className="flex items-center gap-3 px-4 py-2 text-sm text-foreground">{content}</div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      ))}
    </div>
  );
}
