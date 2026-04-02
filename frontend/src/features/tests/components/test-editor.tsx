'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { type QuestionCreate, type TestCreate, QuestionType } from '@/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { sdk } from '@/lib/api-client';
import { Routes } from '@/lib/routes';

import { AddQuestionDropdown } from './add-question-dropdown';
import { AutoTextarea } from './auto-textarea';
import {
  MultipleChoiceQuestionBlock,
  type Choice,
  type MultipleChoiceQuestionData,
} from './multiple-choice-question-block';
import { SimpleQuestionBlock, type SimpleQuestionData } from './simple-question-block';

type Question = SimpleQuestionData | MultipleChoiceQuestionData;

function toApiQuestion(q: Question): QuestionCreate {
  if (q.type === 'simple') {
    return {
      questionType: QuestionType.SIMPLE,
      prompt: q.prompt,
      content: {
        answers: q.answers
          .split(',')
          .map((a) => a.trim())
          .filter(Boolean),
      },
    };
  }
  return {
    questionType: QuestionType.MULTIPLE_CHOICE,
    prompt: q.prompt,
    content: {
      options: q.choices.map((c) => c.text),
      correct_indices: q.choices.flatMap((c, i) => (c.isCorrect ? [i] : [])),
    },
  };
}

function newSimple(): SimpleQuestionData {
  return { type: 'simple', prompt: '', answers: '' };
}

function newMultipleChoice(): MultipleChoiceQuestionData {
  return {
    type: 'multiple_choice',
    prompt: '',
    choices: [
      { text: '', isCorrect: false },
      { text: '', isCorrect: false },
    ] as Choice[],
  };
}

export function TestEditor() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [questions, setQuestions] = useState<Question[]>([]);

  const { mutate: createTest, isPending } = useMutation({
    mutationFn: () => {
      const payload: TestCreate = {
        title: title.trim(),
        description: description.trim() || undefined,
        questions: questions.map(toApiQuestion),
      };
      return sdk.testsCreate({ body: payload });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tests'] });
      router.push(Routes.TESTS);
      router.refresh();
    },
  });

  function addQuestion(type: QuestionType) {
    const q = type === QuestionType.SIMPLE ? newSimple() : newMultipleChoice();
    setQuestions(prev => [...prev, q]);
  }

  function updateQuestion(idx: number, data: Question) {
    setQuestions(prev => prev.map((q, i) => (i === idx ? data : q)));
  }

  function removeQuestion(idx: number) {
    setQuestions(prev => prev.filter((_, i) => i !== idx));
  }

  return (
    <div className="px-8 pb-8 max-w-3xl">
      {/* Title & Description */}
      <div className="space-y-3 mb-6">
        <Input className="w-1/2" placeholder="Test name" value={title} onChange={e => setTitle(e.target.value)} />
        <AutoTextarea
          rows={2}
          placeholder="Description (optional)"
          value={description}
          onChange={e => setDescription(e.target.value)}
        />
      </div>

      {/* Questions */}
      <div className="space-y-3 mb-4">
        {questions.map((q, i) =>
          q.type === 'simple' ? (
            <SimpleQuestionBlock
              key={i}
              data={q}
              onChange={data => updateQuestion(i, data)}
              onRemove={() => removeQuestion(i)}
            />
          ) : (
            <MultipleChoiceQuestionBlock
              key={i}
              data={q}
              onChange={data => updateQuestion(i, data)}
              onRemove={() => removeQuestion(i)}
            />
          )
        )}
      </div>

      {/* Add question */}
      <AddQuestionDropdown onSelect={addQuestion} />

      {/* Save button */}
      <div className="mt-8">
        <Button size="lg" disabled={!title.trim() || isPending} onClick={() => createTest()}>
          {isPending ? 'Saving…' : 'Save Test'}
        </Button>
      </div>
    </div>
  );
}
