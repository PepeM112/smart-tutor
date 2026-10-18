'use client';

import { useIsMutating } from '@tanstack/react-query';
import {
  ArrowDown,
  ArrowUp,
  ClipboardCopy,
  CalendarClock,
  ClipboardPlus,
  FilePlus,
  GraduationCap,
  Files,
  Pencil,
  Plus,
  SlidersHorizontal,
  Trash2,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Fragment, useRef, useState } from 'react';

import {
  SpaceItemKind,
  SpaceKind,
  type SpaceDetail,
  type SpaceItemRead,
  type SpaceItemUpdate,
  type SpaceSectionRead,
} from '@/client';
import { ActionsMenu } from '@/components/shared/ActionsMenu';
import { InlineRename } from '@/components/shared/InlineRename';
import { TreeActionsCell } from '@/components/shared/tree/TreeActionsCell';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Input } from '@/components/ui/input';
import { courseHref, noteHref, Routes } from '@/lib/routes';

import { courseWriteKey, type useCourseActions } from '../hooks/useCourseActions';
import { moveItem, moveSection, toOrder } from '../lib/draftOrder';
import { COURSE_LIMITS } from '../lib/limits';

import { AddItemDialog, type AddItemMode, type CopySource } from './AddItemDialog';
import { CourseContentFrame, CourseItemRow, CourseSectionFrame } from './CourseLayout';
import { ItemIcon } from './CourseOutline';
import { CourseTestSettings } from './CourseTestSettings';
import { ItemSchedulePanel } from './ItemSchedulePanel';
import { ScheduleBadges } from './ScheduleBadges';

type Actions = ReturnType<typeof useCourseActions>;

type Props = {
  course: SpaceDetail;
  actions: Actions;
  /** Opens the note preview pane (a click on a note row). */
  onOpenNote?: (noteId: string) => void;
};

/**
 * The draft structure in edit mode. Members see none of it until publish.
 * Reorder uses up / down buttons: each click sends the full order (the endpoint needs all ids).
 */
export function CourseDraftEditor({ course, actions, onOpenNote }: Props) {
  const t = useTranslations();
  const router = useRouter();
  const sections = course.draftSections ?? [];
  const order = toOrder(sections);
  const [newSectionTitle, setNewSectionTitle] = useState('');
  const [addTarget, setAddTarget] = useState<{ sectionId: string; mode: AddItemMode; itemId?: string } | null>(null);
  // The "Add item" button of that section: the focus goes back to it when the dialog closes.
  const addButtonRef = useRef<HTMLElement | null>(null);
  // Reorder sends the full order, built from `course` as it is now. While any other write runs
  // (a delete, for example), `course` is old and the order would bring the deleted item back or fail.
  const isWriting = useIsMutating({ mutationKey: courseWriteKey(course.id) }) > 0;

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
    // A COURSE item is edited on the page of its course (it has its own draft and publish).
    if (item.kind === SpaceItemKind.COURSE && item.childSpaceId) {
      router.push(courseHref({ id: item.childSpaceId, title: item.title }));
      return;
    }
    // The twin is made on the first call; the next calls return the same id.
    actions.makeEditable.mutate(item.id, { onSuccess: content => openContent(item, content) });
  }

  function handleCreate(title: string) {
    if (!addTarget) return;
    const { sectionId, mode, itemId } = addTarget;
    // With an item id the new test becomes a variant of that TEST item.
    if (itemId) {
      actions.addVariant.mutate({ itemId, body: { title } }, { onSuccess: () => setAddTarget(null) });
      return;
    }
    if (mode.kind === SpaceItemKind.COURSE) {
      actions.addCourse.mutate({ sectionId, title }, { onSuccess: () => setAddTarget(null) });
      return;
    }
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

  function handleCopy(copySource: CopySource) {
    if (!addTarget) return;
    const { sectionId, mode, itemId } = addTarget;
    const sourceId = copySource.id;
    if (itemId) {
      actions.addVariant.mutate({ itemId, body: { testId: sourceId } }, { onSuccess: () => setAddTarget(null) });
      return;
    }
    if (mode.kind === SpaceItemKind.COURSE) {
      actions.addCourseCopy.mutate(
        { sectionId, sourceId, title: copySource.title, description: copySource.description },
        { onSuccess: () => setAddTarget(null) }
      );
      return;
    }
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

      <CourseContentFrame>
        {sections.map((section, sectionIndex) => (
          <DraftSection
            key={section.id}
            section={section}
            isFirst={sectionIndex === 0}
            isLast={sectionIndex === sections.length - 1}
            disabled={isWriting}
            onMove={delta => reorder(moveSection(order, sectionIndex, delta))}
            onMoveItem={(itemIndex, delta) => reorder(moveItem(order, sectionIndex, itemIndex, delta))}
            onRename={title => actions.renameSection.mutate({ sectionId: section.id, title })}
            onDelete={() => actions.deleteSection.mutate(section.id)}
            onAdd={(mode, trigger) => {
              addButtonRef.current = trigger;
              setAddTarget({ sectionId: section.id, mode });
            }}
            onEditItem={handleEditItem}
            onUpdateItem={(item, body, onError) => actions.updateItem.mutate({ itemId: item.id, body }, { onError })}
            onAddVariant={(item, action) => {
              addButtonRef.current = null;
              setAddTarget({ sectionId: section.id, itemId: item.id, mode: { action, kind: SpaceItemKind.TEST } });
            }}
            onReorderVariants={(item, testIds) => actions.reorderVariants.mutate({ itemId: item.id, testIds })}
            onRemoveVariant={(item, testId) => actions.removeVariant.mutate({ itemId: item.id, testId })}
            onEditVariant={(item, testId) =>
              actions.makeEditable.mutate(
                { itemId: item.id, testId },
                { onSuccess: content => openContent(item, content) }
              )
            }
            onDeleteItem={item => actions.deleteItem.mutate(item.id)}
            canMoveItem={(itemIndex, delta) => moveItem(order, sectionIndex, itemIndex, delta) !== null}
            onOpenNote={onOpenNote}
            isClassroom={course.kind === SpaceKind.CLASSROOM}
          />
        ))}
      </CourseContentFrame>

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
        onCloseAutoFocus={event => {
          event.preventDefault();
          addButtonRef.current?.focus();
        }}
        isPending={
          actions.createItem.isPending ||
          actions.copyItem.isPending ||
          actions.addVariant.isPending ||
          actions.addCourse.isPending ||
          actions.addCourseCopy.isPending
        }
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
  /** `trigger`: the "Add item" button, for the focus return. */
  onAdd: (mode: AddItemMode, trigger: HTMLElement | null) => void;
  onEditItem: (item: SpaceItemRead) => void;
  onUpdateItem: (item: SpaceItemRead, body: SpaceItemUpdate, onError?: () => void) => void;
  onAddVariant: (item: SpaceItemRead, action: 'create' | 'copy') => void;
  onReorderVariants: (item: SpaceItemRead, testIds: string[]) => void;
  onRemoveVariant: (item: SpaceItemRead, testId: string) => void;
  onEditVariant: (item: SpaceItemRead, testId: string) => void;
  onDeleteItem: (item: SpaceItemRead) => void;
  onOpenNote?: (noteId: string) => void;
  /** The space is a classroom: items can be courses and have a due date. */
  isClassroom: boolean;
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
  onUpdateItem,
  onAddVariant,
  onReorderVariants,
  onRemoveVariant,
  onEditVariant,
  onDeleteItem,
  onOpenNote,
  isClassroom,
}: DraftSectionProps) {
  const t = useTranslations();
  const [isRenaming, setIsRenaming] = useState(false);
  // Controlled: the Tooltip around a tooltip button does not pass the trigger props through.
  // The tooltip (a popover) takes the focus on click, so each dialog returns the focus to its button by ref.
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const deleteButtonRef = useRef<HTMLButtonElement>(null);
  const [itemToRemove, setItemToRemove] = useState<SpaceItemRead | null>(null);
  // The trash button of that item. A ref, not state: the state is null before the dialog has closed.
  const removeButtonRef = useRef<HTMLElement>(null);
  const addButtonRef = useRef<HTMLButtonElement>(null);
  // The TEST item whose attempt rules and variants are open.
  const [settingsItemId, setSettingsItemId] = useState<string | null>(null);
  // The item whose schedule is open.
  const [scheduleItemId, setScheduleItemId] = useState<string | null>(null);
  const add = (mode: AddItemMode) => onAdd(mode, addButtonRef.current);

  return (
    <CourseSectionFrame
      title={section.title}
      itemCount={section.items.length}
      titleSlot={
        isRenaming ? (
          <InlineRename
            initialValue={section.title}
            maxLength={COURSE_LIMITS.title}
            onSave={title => {
              onRename(title);
              setIsRenaming(false);
            }}
            onCancel={() => setIsRenaming(false)}
          />
        ) : undefined
      }
      actions={
        <TreeActionsCell widthClass="" forceVisible={isRenaming || isDeleteOpen}>
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
            ref={deleteButtonRef}
            tooltip={t('courses.delete_section')}
            aria-label={t('courses.delete_section')}
            onClick={() => setIsDeleteOpen(true)}
          >
            <Trash2 />
          </Button>
          <ConfirmDialog
            open={isDeleteOpen}
            onOpenChange={setIsDeleteOpen}
            onCloseAutoFocus={event => {
              event.preventDefault();
              deleteButtonRef.current?.focus();
            }}
            title={t('courses.delete_section')}
            description={t('courses.delete_section_description', { count: section.items.length })}
            confirmLabel={t('common.delete')}
            onConfirm={onDelete}
          />
        </TreeActionsCell>
      }
      footer={
        <>
          <ActionsMenu
            trigger={
              <Button ref={addButtonRef} variant="ghost" size="sm" icon={Plus}>
                {t('courses.add_item')}
              </Button>
            }
            actions={[
              [
                {
                  label: t('courses.new_note'),
                  icon: FilePlus,
                  onClick: () => add({ action: 'create', kind: SpaceItemKind.NOTE }),
                },
                {
                  label: t('courses.new_test'),
                  icon: ClipboardPlus,
                  onClick: () => add({ action: 'create', kind: SpaceItemKind.TEST }),
                },
              ],
              [
                {
                  label: t('courses.copy_note'),
                  icon: Files,
                  onClick: () => add({ action: 'copy', kind: SpaceItemKind.NOTE }),
                },
                {
                  label: t('courses.copy_test'),
                  icon: ClipboardCopy,
                  onClick: () => add({ action: 'copy', kind: SpaceItemKind.TEST }),
                },
              ],
              // A classroom also holds courses.
              ...(isClassroom
                ? [
                    [
                      {
                        label: t('classrooms.new_course'),
                        icon: GraduationCap,
                        onClick: () => add({ action: 'create', kind: SpaceItemKind.COURSE }),
                      },
                      {
                        label: t('classrooms.duplicate_course'),
                        icon: Files,
                        onClick: () => add({ action: 'copy', kind: SpaceItemKind.COURSE }),
                      },
                    ],
                  ]
                : []),
            ]}
          />
          <ConfirmDialog
            open={itemToRemove !== null}
            onOpenChange={open => !open && setItemToRemove(null)}
            onCloseAutoFocus={event => {
              event.preventDefault();
              removeButtonRef.current?.focus();
            }}
            title={t('courses.remove_item')}
            description={t('courses.remove_item_description', { title: itemToRemove?.title ?? '' })}
            confirmLabel={t('courses.remove_item')}
            onConfirm={() => itemToRemove && onDeleteItem(itemToRemove)}
          />
        </>
      }
    >
      {section.items.map((item, itemIndex) => {
        const { noteId } = item;
        const isTest = item.kind === SpaceItemKind.TEST;
        return (
          <Fragment key={item.id}>
            <CourseItemRow
              icon={<ItemIcon item={item} />}
              title={item.title}
              badge={
                <>
                  <ScheduleBadges item={item} isAuthor />
                  <ItemBadge item={item} />
                </>
              }
              action={
                item.kind === SpaceItemKind.NOTE && noteId && onOpenNote
                  ? { onClick: () => onOpenNote(noteId) }
                  : item.kind === SpaceItemKind.COURSE && item.childSpaceId
                    ? { href: courseHref({ id: item.childSpaceId, title: item.title }) }
                    : undefined
              }
              actions={
                <TreeActionsCell
                  widthClass=""
                  forceVisible={
                    itemToRemove?.id === item.id || settingsItemId === item.id || scheduleItemId === item.id
                  }
                >
                  {isTest && (
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      tooltip={t('courses.policy_title')}
                      aria-label={t('courses.policy_title')}
                      aria-expanded={settingsItemId === item.id}
                      onClick={() => setSettingsItemId(current => (current === item.id ? null : item.id))}
                    >
                      <SlidersHorizontal />
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    tooltip={t('courses.schedule_title')}
                    aria-label={t('courses.schedule_title')}
                    aria-expanded={scheduleItemId === item.id}
                    onClick={() => setScheduleItemId(current => (current === item.id ? null : item.id))}
                  >
                    <CalendarClock />
                  </Button>
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
                    onClick={e => {
                      removeButtonRef.current = e.currentTarget;
                      setItemToRemove(item);
                    }}
                  >
                    <Trash2 />
                  </Button>
                </TreeActionsCell>
              }
            />
            {scheduleItemId === item.id && (
              <li className="list-none">
                <ItemSchedulePanel
                  item={item}
                  isClassroom={isClassroom}
                  onUpdate={(body, onError) => onUpdateItem(item, body, onError)}
                />
              </li>
            )}
            {isTest && settingsItemId === item.id && (
              <li className="list-none">
                <CourseTestSettings
                  item={item}
                  disabled={disabled}
                  onUpdate={(body, onError) => onUpdateItem(item, body, onError)}
                  onAddVariant={action => onAddVariant(item, action)}
                  onReorderVariants={testIds => onReorderVariants(item, testIds)}
                  onRemoveVariant={testId => onRemoveVariant(item, testId)}
                  onEditVariant={testId => onEditVariant(item, testId)}
                />
              </li>
            )}
          </Fragment>
        );
      })}
    </CourseSectionFrame>
  );
}

/** "New" for an item that is not published yet, "Changed" for a published item with draft edits. */
function ItemBadge({ item }: { item: SpaceItemRead }) {
  const t = useTranslations();
  const label = item.draftOfId === null ? t('courses.badge_new') : item.hasChanges ? t('courses.badge_changed') : null;
  if (!label) return null;
  return <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">{label}</span>;
}
