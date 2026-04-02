'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { type QuestionCreate, type QuestionRead, QuestionType, type TestCreate, type TestUpdate } from '@/client';
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
          .map(a => a.trim())
          .filter(Boolean),
      },
    };
  }
  return {
    questionType: QuestionType.MULTIPLE_CHOICE,
    prompt: q.prompt,
    content: {
      options: q.choices.map(c => c.text),
      correct_indices: q.choices.flatMap((c, i) => (c.isCorrect ? [i] : [])),
    },
  };
}

function fromApiQuestion(q: QuestionRead): Question {
  if (q.questionType === QuestionType.MULTIPLE_CHOICE) {
    const content = q.content as { options: string[]; correct_indices: number[] };
    return {
      type: 'multiple_choice',
      prompt: q.prompt,
      choices: (content.options ?? []).map((text, i) => ({
        text,
        isCorrect: (content.correct_indices ?? []).includes(i),
      })) as Choice[],
    };
  }
  const content = q.content as { answers: string[] };
  return {
    type: 'simple',
    prompt: q.prompt,
    answers: (content.answers ?? []).join(', '),
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

type FormProps = {
  testId?: string;
  initialTitle?: string;
  initialDescription?: string;
  initialQuestions?: Question[];
};

function TestEditorForm({ testId, initialTitle = '', initialDescription = '', initialQuestions = [] }: FormProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const isEdit = !!testId;

  const [title, setTitle] = useState(initialTitle);
  const [description, setDescription] = useState(initialDescription);
  const [questions, setQuestions] = useState<Question[]>(initialQuestions);

  const { mutate: saveTest, isPending } = useMutation({
    mutationFn: () => {
      if (isEdit) {
        const payload: TestUpdate = {
          title: title.trim(),
          description: description.trim() || undefined,
          questions: questions.map(toApiQuestion),
        };
        return sdk.testsUpdate({ path: { test_id: testId }, body: payload });
      }
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

      <AddQuestionDropdown onSelect={addQuestion} />

      <div className="mt-8">
        <Button size="lg" disabled={!title.trim() || isPending} onClick={() => saveTest()}>
          {isPending ? 'Saving…' : 'Save Test'}
        </Button>
      </div>
    </div>
  );
}

type Props = {
  testId?: string;
};

export function TestEditor({ testId }: Props) {
  const { data: existing, isLoading } = useQuery({
    queryKey: ['tests', testId],
    queryFn: () => sdk.testsGet({ path: { test_id: testId! } }),
    enabled: !!testId,
  });

  if (testId && isLoading) {
    return <p className="text-muted-foreground">Loading…</p>;
  }

  const test = existing?.data;

  return (
    <TestEditorForm
      testId={testId}
      initialTitle={test?.title}
      initialDescription={test?.description ?? undefined}
      initialQuestions={test?.questions?.map(fromApiQuestion)}
    />
  );
}
