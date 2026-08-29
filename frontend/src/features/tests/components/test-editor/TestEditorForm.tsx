'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Pencil, SquareCheck, WandSparkles } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useCallback, useState } from 'react';
import { toast } from 'sonner';

import {
  type GeneratedQuestionPreviewOutput,
  type QuestionCreate,
  QuestionType,
  type TestCreate,
  type TestQuestionGroupCreate,
  type TestUpdate,
} from '@/client';
import { AutoTextarea } from '@/components/shared/AutoTextarea';
import { Button } from '@/components/ui/button';
import { Drawer, DrawerContent } from '@/components/ui/drawer';
import { Input } from '@/components/ui/input';
import {
  DiffPanel,
  DiffQuestionLongText,
  DiffQuestionMultipleChoice,
  DiffQuestionSimple,
} from '@/features/assist/components/diff';
import { useAssistAttachmentsStore } from '@/features/assist/store/use-assist-attachments-store';
import { useAssistDiffStore } from '@/features/assist/store/use-assist-diff-store';
import { useAssistPanelStore } from '@/features/assist/store/use-assist-panel-store';
import { useAiAvailable } from '@/hooks/use-ai-available';
import { useBreakpoint } from '@/hooks/use-breakpoint';
import { useMobileBreadcrumbActions } from '@/hooks/use-mobile-breadcrumb-actions';
import { useResizableSplit } from '@/hooks/use-resizable-split';
import { sdk } from '@/lib/api-client';
import { Routes } from '@/lib/routes';

import { useBlockSelection } from '../../hooks/use-block-selection';
import { useQuestionBlockList } from '../../hooks/use-question-block-list';
import { type AddItemType, AddQuestionDropdown } from '../add-question-dropdown';
import { LongTextQuestionBlock } from '../long-text-question-block';
import { MultipleChoiceQuestionBlock } from '../multiple-choice-question-block';
import { QuestionGroupBlock } from '../question-group-block';

import {
  flattenEditorItems,
  groupToApiGroup,
  longTextToApiQuestion,
  mcToApiQuestion,
  mergeAiEditResult,
} from './converters';
import { newLongText, newMultipleChoice, newQuestionGroup } from './helpers';

import type { EditorItem } from './types';

const ASSIST_TEST_DIFF_SPLIT_KEY = 'assist-test-diff-split-ratio';

type Props = {
  testId?: string;
  initialTitle?: string;
  initialDescription?: string;
  initialItems?: EditorItem[];
};

export function TestEditorForm({ testId, initialTitle = '', initialDescription = '', initialItems = [] }: Props) {
  const t = useTranslations();
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const { isDesktop } = useBreakpoint();
  const isEdit = !!testId;

  const [title, setTitle] = useState(initialTitle);
  const [description, setDescription] = useState(initialDescription);
  const [isEditing, setIsEditing] = useState(!isEdit);
  const {
    items,
    setItems,
    addItem: appendItem,
    updateItem,
    removeItem: removeListItem,
  } = useQuestionBlockList<EditorItem>(initialItems);
  const { selectedIndices, toggleSelection, removeAndReindex, clearSelection } = useBlockSelection();
  const addAttachment = useAssistAttachmentsStore(s => s.addAttachment);
  const setActiveCommand = useAssistAttachmentsStore(s => s.setActiveCommand);
  const setAssistOpen = useAssistPanelStore(s => s.setOpen);
  const aiAvailable = useAiAvailable();

  const pendingTestDiff = useAssistDiffStore(s => s.pendingTestDiff);
  const clearPendingTestDiff = useAssistDiffStore(s => s.clearPendingTestDiff);
  const showTestDiff = searchParams.get('diff') === 'assist' && pendingTestDiff?.testId === testId;

  const {
    containerRef: testDiffContainerRef,
    splitRatio: testDiffRatio,
    handleDividerMouseDown: testDiffDividerDown,
    resetRatio: testDiffResetRatio,
  } = useResizableSplit(ASSIST_TEST_DIFF_SPLIT_KEY, 0.5);

  const acceptTestRefinement = useCallback(() => {
    if (!pendingTestDiff) return;
    setItems(mergeAiEditResult(items, pendingTestDiff.questions, pendingTestDiff.selectedIndices));
    clearPendingTestDiff();
  }, [pendingTestDiff, items, setItems, clearPendingTestDiff]);

  const { mutate: saveTest, isPending: isSaving } = useMutation({
    mutationFn: () => {
      const standaloneQuestions: QuestionCreate[] = [];
      const questionGroups: TestQuestionGroupCreate[] = [];

      items.forEach((item, idx) => {
        if (item.type === QuestionType.MULTIPLE_CHOICE) {
          standaloneQuestions.push(mcToApiQuestion(item, idx));
        } else if (item.type === QuestionType.LONG_TEXT) {
          standaloneQuestions.push(longTextToApiQuestion(item, idx));
        } else {
          questionGroups.push(groupToApiGroup(item, idx));
        }
      });

      if (isEdit) {
        const payload: TestUpdate = {
          title: title.trim(),
          description: description.trim() || undefined,
          questions: standaloneQuestions,
          questionGroups,
        };
        return sdk.testsUpdate({ path: { test_id: testId }, body: payload });
      }
      const payload: TestCreate = {
        title: title.trim(),
        description: description.trim() || undefined,
        questions: standaloneQuestions,
        questionGroups,
      };
      return sdk.testsCreate({ body: payload });
    },
    onSuccess: res => {
      void queryClient.invalidateQueries({ queryKey: ['tests'] });
      toast.success(isEdit ? t('tests.test_updated') : t('tests.test_created'));
      if (!isEdit && res.data?.id) {
        router.replace(Routes.TEST_EDIT(res.data.id));
      }
    },
    onError: () => {
      toast.error(isEdit ? t('tests.error_updating') : t('tests.error_creating'));
    },
  });

  const handleSendToAssistant = useCallback(() => {
    const sortedIndices = [...selectedIndices].sort((a, b) => a - b);

    let questionNumber = 0;
    items.forEach((item, idx) => {
      if (item.type === 'group') {
        item.rows.forEach(row => {
          questionNumber++;
          if (!sortedIndices.includes(idx)) return;
          addAttachment({
            type: 'test_questions',
            label: t('test_generation.chip_question_label', { index: questionNumber }),
            content: `[${questionNumber}] ${row.prompt}`,
            metadata: { testId, questionIds: row.id ? [row.id] : undefined },
          });
        });
      } else {
        questionNumber++;
        if (!sortedIndices.includes(idx)) return;
        addAttachment({
          type: 'test_questions',
          label: t('test_generation.chip_question_label', { index: questionNumber }),
          content: `[${questionNumber}] ${item.prompt}`,
          metadata: { testId, questionIds: item.id ? [item.id] : undefined },
        });
      }
    });
    setActiveCommand('/edit-test');
    setAssistOpen(true);
    clearSelection();
  }, [items, selectedIndices, testId, addAttachment, setActiveCommand, setAssistOpen, clearSelection, t]);

  const addItem = useCallback(
    (type: AddItemType) => {
      const factories = { group: newQuestionGroup, mc: newMultipleChoice, long: newLongText };
      const newItem = factories[type]();
      appendItem(newItem);
      setIsEditing(true);
    },
    [appendItem]
  );

  function removeItem(idx: number) {
    removeListItem(idx);
    removeAndReindex(idx);
  }

  useMobileBreadcrumbActions(
    <div className="flex items-center gap-2">
      {isEditing ? (
        <Button variant="outline" size="sm" icon={SquareCheck} onClick={() => setIsEditing(false)}>
          {t('test_editor.done_editing')}
        </Button>
      ) : (
        <Button variant="outline" size="sm" icon={Pencil} onClick={() => setIsEditing(true)}>
          {t('test_editor.edit_questions')}
        </Button>
      )}
      <Button size="sm" loading={isSaving} disabled={!title.trim()} onClick={() => saveTest()}>
        {t('tests.save_test')}
      </Button>
    </div>
  );

  return (
    <div ref={testDiffContainerRef} className="flex gap-0">
      <div className="min-w-0" style={{ flex: isDesktop && showTestDiff ? testDiffRatio : 1 }}>
        <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
          <div className="space-y-3 flex-1">
            {isEditing ? (
              <>
                <Input
                  className="w-full lg:w-1/2"
                  placeholder={t('tests.test_name')}
                  value={title}
                  onChange={e => setTitle(e.target.value)}
                />
                <AutoTextarea
                  rows={2}
                  placeholder={t('tests.description_optional')}
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                />
              </>
            ) : (
              <>
                <h1 className="text-xl font-semibold">{title || t('tests.test_name')}</h1>
                {description && <p className="text-sm text-muted-foreground">{description}</p>}
              </>
            )}
          </div>
          {isDesktop && (
            <div className="flex items-center gap-2">
              {isEditing ? (
                <Button variant="outline" size="lg" icon={SquareCheck} onClick={() => setIsEditing(false)}>
                  {t('test_editor.done_editing')}
                </Button>
              ) : (
                <Button variant="outline" size="lg" icon={Pencil} onClick={() => setIsEditing(true)}>
                  {t('test_editor.edit_questions')}
                </Button>
              )}
              <Button size="lg" loading={isSaving} disabled={!title.trim()} onClick={() => saveTest()}>
                {t('tests.save_test')}
              </Button>
            </div>
          )}
        </div>

        {selectedIndices.size > 0 && (
          <div className="flex items-center gap-2 mb-3">
            <Button
              variant="outline"
              size="lg"
              icon={WandSparkles}
              disabled={!aiAvailable}
              tooltip={!aiAvailable ? t('settings.ai_not_configured') : undefined}
              onClick={handleSendToAssistant}
            >
              {t('test_generation.ai_edit')}
            </Button>
          </div>
        )}

        <div className="space-y-3 mb-4 transition-opacity">
          {items.map((item, i) => {
            const selected = selectedIndices.has(i);
            const selectionClick = (e: React.MouseEvent) => toggleSelection(i, e);
            const sharedProps = {
              index: i,
              onRemove: () => removeItem(i),
              selected,
              onClick: selectionClick,
              isEditing,
            } as const;

            if (item.type === 'group') {
              return (
                <QuestionGroupBlock
                  key={item.key}
                  data={item}
                  onChange={data => updateItem(i, data)}
                  {...sharedProps}
                />
              );
            }
            if (item.type === QuestionType.LONG_TEXT) {
              return (
                <LongTextQuestionBlock
                  key={item.key}
                  data={item}
                  onChange={data => updateItem(i, data)}
                  {...sharedProps}
                />
              );
            }
            return (
              <MultipleChoiceQuestionBlock
                key={item.key}
                data={item}
                onChange={data => updateItem(i, data)}
                {...sharedProps}
              />
            );
          })}
        </div>

        {isEditing && <AddQuestionDropdown onSelect={addItem} />}
      </div>

      {/* Desktop: AI refinement diff side panel */}
      {isDesktop && showTestDiff && pendingTestDiff && (
        <>
          <div
            className="shrink-0 relative flex items-center justify-center w-5 mx-2 cursor-col-resize"
            onMouseDown={testDiffDividerDown}
            onDoubleClick={testDiffResetRatio}
          >
            <div className="absolute inset-y-0 left-1/2 w-0.5 -translate-x-1/2 bg-border" />
            <div className="relative z-10 w-3 h-7 rounded-full border border-border bg-background" />
          </div>
          <div
            className="min-w-0 overflow-y-auto rounded-xl border border-border bg-card self-start"
            style={{ flex: 1 - testDiffRatio }}
          >
            <AssistTestDiffPanel
              currentItems={items}
              proposedQuestions={pendingTestDiff.questions}
              selectedIndices={pendingTestDiff.selectedIndices}
              onAccept={acceptTestRefinement}
              onReject={clearPendingTestDiff}
            />
          </div>
        </>
      )}

      {/* Mobile: AI refinement diff drawer */}
      {!isDesktop && (
        <Drawer open={showTestDiff && !!pendingTestDiff} onOpenChange={open => !open && clearPendingTestDiff()}>
          <DrawerContent className="max-h-[75dvh]" title={t('test_editor.proposed_changes')}>
            {pendingTestDiff && (
              <div className="overflow-y-auto px-4 pb-8">
                <AssistTestDiffPanel
                  currentItems={items}
                  proposedQuestions={pendingTestDiff.questions}
                  selectedIndices={pendingTestDiff.selectedIndices}
                  onAccept={acceptTestRefinement}
                  onReject={clearPendingTestDiff}
                />
              </div>
            )}
          </DrawerContent>
        </Drawer>
      )}
    </div>
  );
}

function DiffQuestion({
  old: oldQ,
  new: newQ,
}: {
  old: GeneratedQuestionPreviewOutput;
  new: GeneratedQuestionPreviewOutput;
}) {
  if (newQ.questionType === QuestionType.MULTIPLE_CHOICE) return <DiffQuestionMultipleChoice old={oldQ} new={newQ} />;
  if (newQ.questionType === QuestionType.LONG_TEXT) return <DiffQuestionLongText old={oldQ} new={newQ} />;
  return <DiffQuestionSimple old={oldQ} new={newQ} />;
}

function AssistTestDiffPanel({
  currentItems,
  proposedQuestions,
  selectedIndices,
  onAccept,
  onReject,
}: {
  currentItems: EditorItem[];
  proposedQuestions: GeneratedQuestionPreviewOutput[];
  selectedIndices: number[];
  onAccept: () => void;
  onReject: () => void;
}) {
  const t = useTranslations();
  const currentFlat = flattenEditorItems(currentItems);
  const selectedSet = new Set(selectedIndices);

  const changes = currentFlat.reduce<
    { index: number; old: GeneratedQuestionPreviewOutput; new: GeneratedQuestionPreviewOutput }[]
  >((acc, entry, i) => {
    if (!selectedSet.has(i)) return acc;
    const proposed = proposedQuestions[i];
    if (!proposed) return acc;
    acc.push({
      index: i,
      old: {
        questionType: entry.question.questionType,
        prompt: entry.question.prompt,
        points: entry.question.points,
        content: entry.question.content,
      },
      new: proposed,
    });
    return acc;
  }, []);

  return (
    <DiffPanel title={t('test_editor.proposed_changes')} onAccept={onAccept} onReject={onReject}>
      {changes.length === 0 ? (
        <p className="text-xs text-muted-foreground">{t('test_editor.no_changes')}</p>
      ) : (
        <div className="divide-y divide-border">
          {changes.map(({ index, old: oldQ, new: newQ }, i) => (
            <div key={index} className={i > 0 ? 'pt-3' : ''}>
              <p className="text-xs font-medium text-muted-foreground mb-2">
                {t('test_generation.chip_question_label', { index: index + 1 })}
              </p>
              <DiffQuestion old={oldQ} new={newQ} />
            </div>
          ))}
        </div>
      )}
    </DiffPanel>
  );
}
