'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Pencil, SquareCheck, WandSparkles } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useCallback, useState } from 'react';
import { toast } from 'sonner';

import {
  type QuestionCreate,
  QuestionType,
  type TestCreate,
  type TestQuestionGroupCreate,
  type TestUpdate,
} from '@/client';
import { AutoTextarea } from '@/components/shared/auto-textarea';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAssistAttachmentsStore } from '@/features/assist/store/use-assist-attachments-store';
import { useAssistPanelStore } from '@/features/assist/store/use-assist-panel-store';
import { useAiAvailable } from '@/hooks/use-ai-available';
import { useBreakpoint } from '@/hooks/use-breakpoint';
import { useMobileBreadcrumbActions } from '@/hooks/use-mobile-breadcrumb-actions';
import { sdk } from '@/lib/api-client';
import { Routes } from '@/lib/routes';

import { useBlockSelection } from '../../hooks/use-block-selection';
import { useQuestionBlockList } from '../../hooks/use-question-block-list';
import { type AddItemType, AddQuestionDropdown } from '../add-question-dropdown';
import { LongTextQuestionBlock } from '../long-text-question-block';
import { MultipleChoiceQuestionBlock } from '../multiple-choice-question-block';
import { QuestionGroupBlock } from '../question-group-block';

import { groupToApiGroup, longTextToApiQuestion, mcToApiQuestion } from './converters';
import { newLongText, newMultipleChoice, newQuestionGroup } from './helpers';

import type { EditorItem } from './types';

type Props = {
  testId?: string;
  initialTitle?: string;
  initialDescription?: string;
  initialItems?: EditorItem[];
};

export function TestEditorForm({ testId, initialTitle = '', initialDescription = '', initialItems = [] }: Props) {
  const t = useTranslations();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { isDesktop } = useBreakpoint();
  const isEdit = !!testId;

  const [title, setTitle] = useState(initialTitle);
  const [description, setDescription] = useState(initialDescription);
  const [isEditing, setIsEditing] = useState(!isEdit);
  const {
    items,
    addItem: appendItem,
    updateItem,
    removeItem: removeListItem,
  } = useQuestionBlockList<EditorItem>(initialItems);
  const { selectedIndices, toggleSelection, removeAndReindex, clearSelection } = useBlockSelection();
  const addAttachment = useAssistAttachmentsStore(s => s.addAttachment);
  const setActiveCommand = useAssistAttachmentsStore(s => s.setActiveCommand);
  const setAssistOpen = useAssistPanelStore(s => s.setOpen);
  const aiAvailable = useAiAvailable();

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
    const selectedItems = items.filter((_, i) => selectedIndices.has(i));
    const content = selectedItems
      .map(item => {
        const label = item.type === 'group' ? item.title : item.prompt;
        return `[${item.type === 'group' ? 'Group' : item.type}] ${label}`;
      })
      .join('\n');
    addAttachment({
      type: 'test_questions',
      label: t('test_generation.chip_label', { count: selectedIndices.size }),
      content,
      metadata: { testId },
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
    <div>
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
            onRemove: () => removeItem(i),
            selected,
            onClick: selectionClick,
            isEditing,
          } as const;

          if (item.type === 'group') {
            return (
              <QuestionGroupBlock key={item.key} data={item} onChange={data => updateItem(i, data)} {...sharedProps} />
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
  );
}
