'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Check, Pencil, SquareCheck, WandSparkles, X } from 'lucide-react';
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
import { AutoTextarea } from '@/components/shared/auto-textarea';
import { Button } from '@/components/ui/button';
import { Drawer, DrawerContent } from '@/components/ui/drawer';
import { Input } from '@/components/ui/input';
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
    setItems(mergeAiEditResult(items, pendingTestDiff.questions));
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
    sortedIndices.forEach(idx => {
      const item = items[idx];
      const label = item.type === 'group' ? item.title : item.prompt;
      const content = `[${item.type === 'group' ? 'Group' : item.type}] ${label}`;
      addAttachment({
        type: 'test_questions',
        label: t('test_generation.chip_question_label', { index: idx + 1 }),
        content,
        metadata: { testId },
      });
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
            className="min-w-0 overflow-y-auto rounded-xl border border-border bg-card"
            style={{ flex: 1 - testDiffRatio }}
          >
            <AssistTestDiffPanel
              currentItems={items}
              proposedQuestions={pendingTestDiff.questions}
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

type QuestionContent = GeneratedQuestionPreviewOutput['content'];

function isMultipleChoiceContent(content: QuestionContent): content is { options: string[]; correctIndices: number[] } {
  return Array.isArray((content as { options?: unknown }).options);
}

function isSimpleContent(content: QuestionContent): content is { answers: string[] } {
  return Array.isArray((content as { answers?: unknown }).answers);
}

function ContentDiff({ oldContent, newContent }: { oldContent: QuestionContent; newContent: QuestionContent }) {
  if (isMultipleChoiceContent(oldContent) && isMultipleChoiceContent(newContent)) {
    const oldOptions = oldContent.options;
    const newOptions = newContent.options;
    const removed = oldOptions.filter(o => !newOptions.includes(o));
    const kept = newOptions.filter(o => oldOptions.includes(o));
    const added = newOptions.filter(o => !oldOptions.includes(o));

    return (
      <div className="space-y-1">
        {removed.map(option => (
          <p
            key={`removed-${option}`}
            className="rounded-md border border-feedback-wrong-border bg-feedback-wrong-bg px-3 py-1.5 text-sm text-foreground line-through"
          >
            {option}
          </p>
        ))}
        {added.map(option => (
          <p
            key={`added-${option}`}
            className="rounded-md border border-feedback-correct-border bg-feedback-correct-bg px-3 py-1.5 text-sm text-foreground"
          >
            {option}
          </p>
        ))}
        {removed.length === 0 &&
          added.length === 0 &&
          kept.map(option => (
            <p key={`unchanged-${option}`} className="px-3 py-1.5 text-sm text-muted-foreground">
              {option}
            </p>
          ))}
      </div>
    );
  }

  if (isSimpleContent(oldContent) && isSimpleContent(newContent)) {
    return (
      <div className="space-y-1.5">
        <div className="rounded-md border border-feedback-wrong-border bg-feedback-wrong-bg px-3 py-1.5">
          <p className="text-sm text-foreground">{oldContent.answers.join(', ')}</p>
        </div>
        <div className="rounded-md border border-feedback-correct-border bg-feedback-correct-bg px-3 py-1.5">
          <p className="text-sm text-foreground">{newContent.answers.join(', ')}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-md border border-feedback-correct-border bg-feedback-correct-bg px-3 py-1.5">
      <p className="text-sm text-foreground">{JSON.stringify(newContent)}</p>
    </div>
  );
}

function AssistTestDiffPanel({
  currentItems,
  proposedQuestions,
  onAccept,
  onReject,
}: {
  currentItems: EditorItem[];
  proposedQuestions: GeneratedQuestionPreviewOutput[];
  onAccept: () => void;
  onReject: () => void;
}) {
  const t = useTranslations();
  const currentFlat = flattenEditorItems(currentItems);

  const changes = currentFlat.reduce<
    { index: number; oldPrompt: string; newPrompt: string; oldContent: QuestionContent; newContent: QuestionContent }[]
  >((acc, entry, i) => {
    const proposed = proposedQuestions[i];
    if (!proposed) return acc;
    const promptChanged = entry.question.prompt !== proposed.prompt;
    const contentChanged = JSON.stringify(entry.question.content) !== JSON.stringify(proposed.content);
    if (promptChanged || contentChanged) {
      acc.push({
        index: i,
        oldPrompt: entry.question.prompt,
        newPrompt: proposed.prompt,
        oldContent: entry.question.content,
        newContent: proposed.content,
      });
    }
    return acc;
  }, []);

  return (
    <div className="flex flex-col p-4">
      <div className="flex items-center justify-between mb-3 shrink-0">
        <h3 className="text-sm font-semibold text-foreground">{t('test_editor.proposed_changes')}</h3>
        <Button variant="ghost" size="icon-sm" onClick={onReject} className="text-muted-foreground">
          <X className="size-4" />
        </Button>
      </div>

      {changes.length === 0 ? (
        <p className="text-xs text-muted-foreground">{t('test_editor.no_changes')}</p>
      ) : (
        <div className="space-y-3">
          {changes.map(({ index, oldPrompt, newPrompt, oldContent, newContent }) => {
            const promptChanged = oldPrompt !== newPrompt;
            const contentChanged = JSON.stringify(oldContent) !== JSON.stringify(newContent);
            return (
              <div key={index} className="space-y-1.5">
                <p className="text-xs font-medium text-muted-foreground">
                  {t('test_generation.chip_question_label', { index: index + 1 })}
                </p>
                {promptChanged && (
                  <>
                    <div className="rounded-md border border-feedback-wrong-border bg-feedback-wrong-bg px-3 py-2">
                      <p className="text-sm text-foreground">{oldPrompt}</p>
                    </div>
                    <div className="rounded-md border border-feedback-correct-border bg-feedback-correct-bg px-3 py-2">
                      <p className="text-sm text-foreground">{newPrompt}</p>
                    </div>
                  </>
                )}
                {!promptChanged && <p className="text-sm text-foreground">{oldPrompt}</p>}
                {contentChanged && <ContentDiff oldContent={oldContent} newContent={newContent} />}
              </div>
            );
          })}
        </div>
      )}

      <div className="flex items-center justify-end gap-2 mt-4 shrink-0">
        <Button variant="outline" size="sm" onClick={onReject}>
          {t('common.reject')}
        </Button>
        <Button size="sm" onClick={onAccept}>
          <Check className="size-3" />
          {t('common.accept')}
        </Button>
      </div>
    </div>
  );
}
