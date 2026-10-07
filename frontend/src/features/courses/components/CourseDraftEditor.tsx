'use client';

import { ArrowDown, ArrowUp, Pencil, Plus, Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

import { SpaceItemKind, type SpaceDetail, type SpaceItemRead, type SpaceSectionRead } from '@/client';
import { InlineRename } from '@/components/shared/InlineRename';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { noteHref, Routes } from '@/lib/routes';

import { type useCourseActions } from '../hooks/useCourseActions';
import { moveItem, moveSection, toOrder } from '../lib/draftOrder';
import { COURSE_LIMITS } from '../lib/limits';

import { AddItemDialog, type AddItemMode } from './AddItemDialog';
import { ItemIcon } from './CourseOutline';

type Actions = ReturnType<typeof useCourseActions>;

type Props = {
  course: SpaceDetail;
  actions: Actions;
};

/**
 * The draft structure in edit mode. Members see none of it until publish.
 * Reorder uses up / down buttons: each click sends the full order (the endpoint needs all ids).
 */
export function CourseDraftEditor({ course, actions }: Props) {
  const t = useTranslations();
  const router = useRouter();
  const sections = course.draftSections ?? [];
  const order = toOrder(sections);
  const [newSectionTitle, setNewSectionTitle] = useState('');
  const [addTarget, setAddTarget] = useState<{ sectionId: string; mode: AddItemMode } | null>(null);
  const isReordering = actions.reorder.isPending;

  function handleAddSection(e: React.SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    const title = newSectionTitle.trim();
    if (!title) return;
    actions.addSection.mutate(title, { onSuccess: () => setNewSectionTitle('') });
  }

  function openContent(
    item: Pick<SpaceItemRead, 'kind' | 'title'>,
    content: { noteId: string | null; testId: string | null }
  ) {
    if (item.kind === SpaceItemKind.NOTE && content.noteId) {
      router.push(noteHref({ id: content.noteId, title: item.title }));
    } else if (item.kind === SpaceItemKind.TEST && content.testId) {
      router.push(Routes.TEST_EDIT(content.testId));
    }
  }

  function handleEditItem(item: SpaceItemRead) {
    // The twin is made on the first call; the next calls return the same id.
    actions.makeEditable.mutate(item.id, { onSuccess: content => openContent(item, content) });
  }

  function handleCreate(title: string) {
    if (!addTarget) return;
    const { sectionId, mode } = addTarget;
    actions.createItem.mutate(
      { sectionId, kind: mode.kind, title },
      {
        onSuccess: content => {
          setAddTarget(null);
          openContent({ kind: mode.kind, title }, content);
        },
      }
    );
  }

  function handleCopy(sourceId: string) {
    if (!addTarget) return;
    const { sectionId, mode } = addTarget;
    const source = mode.kind === SpaceItemKind.NOTE ? { noteId: sourceId } : { testId: sourceId };
    actions.copyItem.mutate({ sectionId, ...source }, { onSuccess: () => setAddTarget(null) });
  }

  function reorder(next: ReturnType<typeof moveSection>) {
    if (next) actions.reorder.mutate({ sections: next });
  }

  return (
    <div className="flex flex-col gap-4">
      {sections.length === 0 && (
        <p className="py-8 text-center text-sm text-muted-foreground">{t('courses.no_sections_yet')}</p>
      )}

      {sections.map((section, sectionIndex) => (
        <DraftSection
          key={section.id}
          section={section}
          isFirst={sectionIndex === 0}
          isLast={sectionIndex === sections.length - 1}
          disabled={isReordering}
          onMove={delta => reorder(moveSection(order, sectionIndex, delta))}
          onMoveItem={(itemIndex, delta) => reorder(moveItem(order, sectionIndex, itemIndex, delta))}
          onRename={title => actions.renameSection.mutate({ sectionId: section.id, title })}
          onDelete={() => actions.deleteSection.mutate(section.id)}
          onAdd={mode => setAddTarget({ sectionId: section.id, mode })}
          onEditItem={handleEditItem}
          onDeleteItem={item => actions.deleteItem.mutate(item.id)}
          canMoveItem={(itemIndex, delta) => moveItem(order, sectionIndex, itemIndex, delta) !== null}
        />
      ))}

      <form onSubmit={handleAddSection} className="flex items-center gap-2">
        <Input
          value={newSectionTitle}
          onChange={e => setNewSectionTitle(e.target.value)}
          placeholder={t('courses.new_section_placeholder')}
          aria-label={t('courses.new_section_placeholder')}
          maxLength={COURSE_LIMITS.title}
          className="max-w-sm"
        />
        <Button
          type="submit"
          variant="outline"
          icon={Plus}
          disabled={!newSectionTitle.trim()}
          loading={actions.addSection.isPending}
        >
          {t('courses.add_section')}
        </Button>
      </form>

      <AddItemDialog
        mode={addTarget?.mode ?? null}
        onOpenChange={open => !open && setAddTarget(null)}
        isPending={actions.createItem.isPending || actions.copyItem.isPending}
        onCreate={handleCreate}
        onCopy={handleCopy}
      />
    </div>
  );
}

type DraftSectionProps = {
  section: SpaceSectionRead;
  isFirst: boolean;
  isLast: boolean;
  disabled: boolean;
  onMove: (delta: -1 | 1) => void;
  onMoveItem: (itemIndex: number, delta: -1 | 1) => void;
  canMoveItem: (itemIndex: number, delta: -1 | 1) => boolean;
  onRename: (title: string) => void;
  onDelete: () => void;
  onAdd: (mode: AddItemMode) => void;
  onEditItem: (item: SpaceItemRead) => void;
  onDeleteItem: (item: SpaceItemRead) => void;
};

function DraftSection({
  section,
  isFirst,
  isLast,
  disabled,
  onMove,
  onMoveItem,
  canMoveItem,
  onRename,
  onDelete,
  onAdd,
  onEditItem,
  onDeleteItem,
}: DraftSectionProps) {
  const t = useTranslations();
  const [isRenaming, setIsRenaming] = useState(false);
  // Controlled: the Tooltip around a tooltip button does not pass the trigger props through.
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);

  return (
    <section className="rounded-xl border border-border bg-card shadow-card">
      <div className="flex items-center gap-1 px-4 pt-3 pb-2">
        <div className="min-w-0 flex-1">
          {isRenaming ? (
            <InlineRename
              initialValue={section.title}
              maxLength={COURSE_LIMITS.title}
              onSave={title => {
                onRename(title);
                setIsRenaming(false);
              }}
              onCancel={() => setIsRenaming(false)}
            />
          ) : (
            <h3 className="truncate font-medium text-foreground">{section.title}</h3>
          )}
        </div>
        <Button
          variant="ghost"
          size="icon-sm"
          tooltip={t('courses.rename')}
          aria-label={t('courses.rename')}
          onClick={() => setIsRenaming(true)}
        >
          <Pencil />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          tooltip={t('courses.move_up')}
          aria-label={t('courses.move_up')}
          disabled={disabled || isFirst}
          onClick={() => onMove(-1)}
        >
          <ArrowUp />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          tooltip={t('courses.move_down')}
          aria-label={t('courses.move_down')}
          disabled={disabled || isLast}
          onClick={() => onMove(1)}
        >
          <ArrowDown />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          tooltip={t('courses.delete_section')}
          aria-label={t('courses.delete_section')}
          onClick={() => setIsDeleteOpen(true)}
        >
          <Trash2 />
        </Button>
        <ConfirmDialog
          open={isDeleteOpen}
          onOpenChange={setIsDeleteOpen}
          title={t('courses.delete_section')}
          description={t('courses.delete_section_description', { count: section.items.length })}
          confirmLabel={t('common.delete')}
          onConfirm={onDelete}
        />
      </div>

      <ul>
        {section.items.map((item, itemIndex) => (
          <li key={item.id} className="flex items-center gap-2 px-4 py-1.5 text-sm">
            <ItemIcon item={item} />
            <span className="min-w-0 flex-1 truncate text-foreground">{item.title}</span>
            <ItemBadge item={item} />
            <Button
              variant="ghost"
              size="icon-sm"
              tooltip={t('common.edit')}
              aria-label={t('common.edit')}
              onClick={() => onEditItem(item)}
            >
              <Pencil />
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              tooltip={t('courses.move_up')}
              aria-label={t('courses.move_up')}
              disabled={disabled || !canMoveItem(itemIndex, -1)}
              onClick={() => onMoveItem(itemIndex, -1)}
            >
              <ArrowUp />
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              tooltip={t('courses.move_down')}
              aria-label={t('courses.move_down')}
              disabled={disabled || !canMoveItem(itemIndex, 1)}
              onClick={() => onMoveItem(itemIndex, 1)}
            >
              <ArrowDown />
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              tooltip={t('courses.remove_item')}
              aria-label={t('courses.remove_item')}
              onClick={() => onDeleteItem(item)}
            >
              <Trash2 />
            </Button>
          </li>
        ))}
      </ul>

      <div className="px-4 pt-1 pb-3">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" icon={Plus}>
              {t('courses.add_item')}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuItem onSelect={() => onAdd({ action: 'create', kind: SpaceItemKind.NOTE })}>
              {t('courses.new_note')}
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => onAdd({ action: 'create', kind: SpaceItemKind.TEST })}>
              {t('courses.new_test')}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => onAdd({ action: 'copy', kind: SpaceItemKind.NOTE })}>
              {t('courses.copy_note')}
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => onAdd({ action: 'copy', kind: SpaceItemKind.TEST })}>
              {t('courses.copy_test')}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </section>
  );
}

/** "New" for an item that is not published yet, "Changed" for a published item with draft edits. */
function ItemBadge({ item }: { item: SpaceItemRead }) {
  const t = useTranslations();
  const label = item.draftOfId === null ? t('courses.badge_new') : item.hasChanges ? t('courses.badge_changed') : null;
  if (!label) return null;
  return <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">{label}</span>;
}
