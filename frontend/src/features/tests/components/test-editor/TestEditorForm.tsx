'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
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
import { sdk } from '@/lib/api-client';
import { Routes } from '@/lib/routes';

import { useBlockSelection } from '../../hooks/use-block-selection';
import { AddQuestionDropdown } from '../add-question-dropdown';
import { AiEditPopover } from '../ai-edit-popover';
import { LongTextQuestionBlock } from '../long-text-question-block';
import { MultipleChoiceQuestionBlock } from '../multiple-choice-question-block';
import { QuestionGroupBlock } from '../question-group-block';

import {
  editorItemsToPreviewInputs,
  fromPreviewToEditorItems,
  groupToApiGroup,
  longTextToApiQuestion,
  mcToApiQuestion,
} from './converters';
import { newLongText, newMultipleChoice, newQuestionGroup } from './helpers';

import type { EditorItem } from './types';

type Props = {
  testId?: string;
  initialTitle?: string;
  initialDescription?: string;
  initialItems?: EditorItem[];
};

export function TestEditorForm({ testId, initialTitle = '', initialDescription = '', initialItems = [] }: Props) {
  const t = useTranslations('tests');
  const router = useRouter();
  const queryClient = useQueryClient();
  const isEdit = !!testId;

  const [title, setTitle] = useState(initialTitle);
  const [description, setDescription] = useState(initialDescription);
  const [items, setItems] = useState<EditorItem[]>(initialItems);
  const { selectedIndices, toggleSelection, removeAndReindex, clearSelection } = useBlockSelection();

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
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['tests'] });
      toast.success(isEdit ? t('test_updated') : t('test_created'));
      router.push(Routes.TESTS);
      router.refresh();
    },
    onError: () => {
      toast.error(isEdit ? t('error_updating') : t('error_creating'));
    },
  });

  const { mutate: aiEdit, isPending: isAiEditing } = useMutation({
    mutationFn: (instructions: string) => {
      const allQuestions = editorItemsToPreviewInputs(items);

      return sdk.testsEditQuestions({
        body: {
          selectedIndices: Array.from(selectedIndices),
          allQuestions,
          instructions,
          noteContent: undefined,
        },
      });
    },
    onSuccess: res => {
      if (!res.data) return;
      setItems(fromPreviewToEditorItems(res.data.questions));
      clearSelection();
      toast.success(t('questions_updated'));
    },
    onError: () => toast.error(t('failed_to_edit_questions')),
  });

  function addItem(type: 'group' | 'mc' | 'long') {
    const factories = { group: newQuestionGroup, mc: newMultipleChoice, long: newLongText };
    setItems(prev => [...prev, factories[type]()]);
  }

  function updateItem(idx: number, data: EditorItem) {
    setItems(prev => prev.map((item, i) => (i === idx ? data : item)));
  }

  function removeItem(idx: number) {
    setItems(prev => prev.filter((_, i) => i !== idx));
    removeAndReindex(idx);
  }

  return (
    <div>
      <div className="flex items-start justify-between gap-4 mb-6">
        <div className="space-y-3 flex-1">
          <Input
            className="w-1/2"
            placeholder={t('test_name')}
            value={title}
            onChange={e => setTitle(e.target.value)}
          />
          <AutoTextarea
            rows={2}
            placeholder={t('description_optional')}
            value={description}
            onChange={e => setDescription(e.target.value)}
          />
        </div>
        <Button size="lg" disabled={!title.trim() || isSaving} onClick={() => saveTest()}>
          {isSaving ? t('saving') : t('save_test')}
        </Button>
      </div>

      {selectedIndices.size > 0 && (
        <div className="flex items-center gap-2 mb-3">
          <AiEditPopover selectedCount={selectedIndices.size} isPending={isAiEditing} onSubmit={aiEdit} />
        </div>
      )}

      <div className="space-y-3 mb-4">
        {items.map((item, i) => {
          const selected = selectedIndices.has(i);
          const onClick = (e: React.MouseEvent) => toggleSelection(i, e);

          if (item.type === 'group') {
            return (
              <QuestionGroupBlock
                key={i}
                data={item}
                onChange={data => updateItem(i, data)}
                onRemove={() => removeItem(i)}
                selected={selected}
                onClick={onClick}
              />
            );
          }
          if (item.type === QuestionType.LONG_TEXT) {
            return (
              <LongTextQuestionBlock
                key={i}
                data={item}
                onChange={data => updateItem(i, data)}
                onRemove={() => removeItem(i)}
                selected={selected}
                onClick={onClick}
              />
            );
          }
          return (
            <MultipleChoiceQuestionBlock
              key={i}
              data={item}
              onChange={data => updateItem(i, data)}
              onRemove={() => removeItem(i)}
              selected={selected}
              onClick={onClick}
            />
          );
        })}
      </div>

      <AddQuestionDropdown onSelect={addItem} />
    </div>
  );
}
