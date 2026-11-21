'use client';

import { ChevronDown } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';

import { SpaceItemKind, type SpaceDetail, type SpaceItemRead, type SpaceSectionRead } from '@/client';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';

import { AUTHOR_TABS, type AuthorTab } from '../lib/authorTabs';
import { outlineItemHref } from '../lib/itemAction';
import { canDo } from '../lib/permissions';

import { ItemIcon } from './CourseOutline';
import { CourseProgressBar, ItemProgressCircle, TestAttemptInfo } from './CourseProgress';
import { ScheduleBadges } from './ScheduleBadges';

interface CourseOutlineNavProps {
  course: SpaceDetail;
  /** False for a preview (not a member): titles only, no links. */
  linkItems: boolean;
  /** The item that `?item=` selected. */
  selectedItemId: string | null;
  /** Set for the authors of a standalone course: they switch between the content and the members here. */
  authorTab?: AuthorTab;
  onAuthorTabChange?: (tab: string) => void;
}

const ROW_CLASS =
  'flex w-full items-start gap-2 rounded-lg px-2 py-1.5 text-left text-sm text-foreground outline-none transition-colors focus-visible:bg-muted';

/** The course in the outline column and in the Contents drawer: owner, progress and the collapsible sections. */
export function CourseOutlineNav({
  course,
  linkItems,
  selectedItemId,
  authorTab,
  onAuthorTabChange,
}: CourseOutlineNavProps) {
  const t = useTranslations();
  const [collapsedIds, setCollapsedIds] = useState<readonly string[]>([]);
  const toggleSection = (sectionId: string): void =>
    setCollapsedIds(ids => (ids.includes(sectionId) ? ids.filter(id => id !== sectionId) : [...ids, sectionId]));

  return (
    <div className="flex flex-col gap-4">
      {authorTab && onAuthorTabChange && <AuthorTabs value={authorTab} onChange={onAuthorTabChange} />}

      <div className="flex flex-col gap-3 px-2">
        <p className="text-sm text-muted-foreground">{t('courses.by_owner', { name: course.ownerName })}</p>
        {canDo(course.myRole, 'trackProgress') && course.progress && <CourseProgressBar progress={course.progress} />}
      </div>

      {course.sections.map(section => (
        <OutlineSection
          key={section.id}
          section={section}
          course={course}
          linkItems={linkItems}
          selectedItemId={selectedItemId}
          isCollapsed={collapsedIds.includes(section.id)}
          onToggle={() => toggleSection(section.id)}
        />
      ))}
    </div>
  );
}

interface AuthorTabsProps {
  value: AuthorTab;
  onChange: (tab: string) => void;
}

/** The Content / Members switch. State shows by the fill and the weight, not by color alone. */
function AuthorTabs({ value, onChange }: AuthorTabsProps) {
  const t = useTranslations();
  const labels: Record<AuthorTab, string> = { content: t('courses.tab_content'), members: t('courses.tab_members') };

  return (
    <Tabs value={value} onValueChange={onChange}>
      {/* The tab list is restyled as a segmented control: the default underline style does not fit the narrow outline column. */}
      <TabsList className="gap-0.5 rounded-lg border-0 bg-muted p-0.5">
        {AUTHOR_TABS.map(tab => (
          <TabsTrigger
            key={tab}
            value={tab}
            className="mb-0 flex-1 justify-center rounded-md border-0 px-2 py-1 font-normal data-[state=active]:bg-card data-[state=active]:font-medium data-[state=active]:shadow-card"
          >
            {labels[tab]}
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  );
}

interface OutlineSectionProps {
  section: SpaceSectionRead;
  course: SpaceDetail;
  linkItems: boolean;
  selectedItemId: string | null;
  isCollapsed: boolean;
  onToggle: () => void;
}

function OutlineSection({ section, course, linkItems, selectedItemId, isCollapsed, onToggle }: OutlineSectionProps) {
  return (
    <section>
      <div className="flex items-center gap-1 px-2 pb-1">
        <h3 className="min-w-0 flex-1">
          <button
            type="button"
            aria-expanded={!isCollapsed}
            onClick={onToggle}
            className="flex w-full items-center gap-1 rounded text-left text-xs font-medium tracking-[0.08em] text-muted-foreground uppercase outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50"
          >
            <ChevronDown className={cn('size-3.5 shrink-0 transition-transform', isCollapsed && '-rotate-90')} />
            <span className="truncate">{section.title}</span>
          </button>
        </h3>
        <span className="text-xs text-muted-foreground tabular-nums">{section.items.length}</span>
      </div>
      {!isCollapsed && (
        <ul>
          {section.items.map(item => (
            <OutlineItem
              key={item.id}
              item={item}
              course={course}
              linkItems={linkItems}
              isSelected={item.id === selectedItemId}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

interface OutlineItemProps {
  item: SpaceItemRead;
  course: SpaceDetail;
  linkItems: boolean;
  isSelected: boolean;
}

function OutlineItem({ item, course, linkItems, isSelected }: OutlineItemProps) {
  const rowRef = useRef<HTMLLIElement>(null);
  const isViewer = canDo(course.myRole, 'trackProgress');
  const href = linkItems ? outlineItemHref(course, item) : undefined;

  // A link or the Assistant can select an item that sits below the fold of a long outline.
  useEffect(() => {
    if (isSelected) rowRef.current?.scrollIntoView({ block: 'nearest' });
  }, [isSelected]);

  const content = (
    <>
      {/* A COURSE item has the progress of its own course instead of a circle. */}
      {isViewer && item.kind !== SpaceItemKind.COURSE && (
        <span className="pt-0.5">
          <ItemProgressCircle done={item.completed ?? false} />
        </span>
      )}
      <span className="pt-0.5">
        <ItemIcon item={item} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate">{item.title}</span>
        <span className="flex flex-wrap gap-x-2">
          <ScheduleBadges item={item} isAuthor={!isViewer} />
          {isViewer && item.kind === SpaceItemKind.TEST && <TestAttemptInfo item={item} />}
        </span>
      </span>
    </>
  );
  const className = cn(ROW_CLASS, isSelected && 'bg-muted font-medium', href && !isSelected && 'hover:bg-muted/60');

  return (
    <li ref={rowRef} data-selected={isSelected || undefined}>
      {href ? (
        <Link href={href} aria-current={isSelected ? 'page' : undefined} className={className}>
          {content}
        </Link>
      ) : (
        <span className={className}>{content}</span>
      )}
    </li>
  );
}
