'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
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

import { AddQuestionDropdown } from '../add-question-dropdown';
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
  const router = useRouter();
  const queryClient = useQueryClient();
  const isEdit = !!testId;

  const [title, setTitle] = useState(initialTitle);
  const [description, setDescription] = useState(initialDescription);
  const [items, setItems] = useState<EditorItem[]>(initialItems);

  const { mutate: saveTest, isPending } = useMutation({
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
      toast.success(isEdit ? 'Test updated' : 'Test created');
      router.push(Routes.TESTS);
      router.refresh();
    },
    onError: () => {
      toast.error(isEdit ? 'Error updating test' : 'Error creating test');
    },
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
  }

  return (
    <div className="max-w-3xl">
      <div className="space-y-3 mb-6">
        <Input className="w-1/2" placeholder="Test name" value={title} onChange={e => setTitle(e.target.value)} />
        <AutoTextarea
          rows={2}
          placeholder="Description (optional)"
          value={description}
          onChange={e => setDescription(e.target.value)}
        />
      </div>

      <div className="space-y-3 mb-4">
        {items.map((item, i) => {
          if (item.type === 'group') {
            return (
              <QuestionGroupBlock
                key={i}
                data={item}
                onChange={data => updateItem(i, data)}
                onRemove={() => removeItem(i)}
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
              />
            );
          }
          return (
            <MultipleChoiceQuestionBlock
              key={i}
              data={item}
              onChange={data => updateItem(i, data)}
              onRemove={() => removeItem(i)}
            />
          );
        })}
      </div>

      <AddQuestionDropdown onSelect={addItem} />

      <div className="mt-8">
        <Button size="lg" disabled={!title.trim() || isPending} onClick={() => saveTest()}>
          {isPending ? 'Saving…' : 'Save Test'}
        </Button>
      </div>
    </div>
  );
}
