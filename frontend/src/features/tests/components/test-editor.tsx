'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import {
  type QuestionCreate,
  type QuestionRead,
  QuestionGroupType,
  QuestionType,
  type TestCreate,
  type TestQuestionGroupCreate,
  type TestQuestionGroupRead,
  type TestUpdate,
} from '@/client';
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
import {
  QuestionGroupBlock,
  type QuestionGroupData,
  type SimpleRow,
  newQuestionGroup,
} from './question-group-block';

/* ------------------------------------------------------------------ */
/*  Union type for all items in the editor list                       */
/* ------------------------------------------------------------------ */

type EditorItem = MultipleChoiceQuestionData | QuestionGroupData;

/* ------------------------------------------------------------------ */
/*  Conversion: editor → API payload                                  */
/* ------------------------------------------------------------------ */

function mcToApiQuestion(q: MultipleChoiceQuestionData, order: number): QuestionCreate {
  return {
    questionType: QuestionType.MULTIPLE_CHOICE,
    prompt: q.prompt,
    order,
    content: {
      options: q.choices.map(c => c.text),
      correct_indices: q.choices.flatMap((c, i) => (c.isCorrect ? [i] : [])),
    },
  };
}

function groupToApiGroup(g: QuestionGroupData, order: number): TestQuestionGroupCreate {
  return {
    type: g.groupType,
    order,
    title: g.title.trim() || undefined,
    questions: g.rows.map((row, i) => ({
      questionType: QuestionType.SIMPLE,
      prompt: row.prompt,
      order: i,
      content: {
        answers: row.answers
          .split(',')
          .map(a => a.trim())
          .filter(Boolean),
      },
    })),
  };
}

/* ------------------------------------------------------------------ */
/*  Conversion: API response → editor items                           */
/* ------------------------------------------------------------------ */

function fromApiMcQuestion(q: QuestionRead): MultipleChoiceQuestionData {
  const content = q.content as { options: string[]; correct_indices: number[] };
  return {
    type: QuestionType.MULTIPLE_CHOICE,
    prompt: q.prompt,
    choices: (content.options ?? []).map((text, i) => ({
      text,
      isCorrect: (content.correct_indices ?? []).includes(i),
    })) as Choice[],
  };
}

function fromApiGroup(g: TestQuestionGroupRead): QuestionGroupData {
  return {
    type: 'group',
    groupType: g.type ?? QuestionGroupType.UNKNOWN,
    title: g.title ?? '',
    rows: (g.questions ?? []).map(q => {
      const content = q.content as { answers: string[] };
      return {
        prompt: q.prompt,
        answers: (content.answers ?? []).join(', '),
      } as SimpleRow;
    }),
  };
}

/**
 * Merge standalone questions and question groups into a single ordered list.
 * Both share the same order space on the backend.
 */
function fromApiToEditorItems(
  questions: QuestionRead[] | undefined,
  groups: TestQuestionGroupRead[] | undefined,
): EditorItem[] {
  type Tagged =
    | { order: number; kind: 'mc'; data: QuestionRead }
    | { order: number; kind: 'group'; data: TestQuestionGroupRead };

  const tagged: Tagged[] = [];

  for (const q of questions ?? []) {
    if (q.questionType === QuestionType.MULTIPLE_CHOICE) {
      tagged.push({ order: q.order ?? 0, kind: 'mc', data: q });
    }
    // standalone simple questions from old data — wrap into a single-row group
    if (q.questionType === QuestionType.SIMPLE) {
      const syntheticGroup: TestQuestionGroupRead = {
        id: '',
        testId: '',
        type: QuestionGroupType.UNKNOWN,
        order: q.order ?? 0,
        title: null,
        questions: [q],
      };
      tagged.push({ order: q.order ?? 0, kind: 'group', data: syntheticGroup });
    }
  }

  for (const g of groups ?? []) {
    tagged.push({ order: g.order ?? 0, kind: 'group', data: g });
  }

  tagged.sort((a, b) => a.order - b.order);

  return tagged.map(t => (t.kind === 'mc' ? fromApiMcQuestion(t.data) : fromApiGroup(t.data)));
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                           */
/* ------------------------------------------------------------------ */

function newMultipleChoice(): MultipleChoiceQuestionData {
  return {
    type: QuestionType.MULTIPLE_CHOICE,
    prompt: '',
    choices: [
      { text: '', isCorrect: false },
      { text: '', isCorrect: false },
    ] as Choice[],
  };
}

/* ------------------------------------------------------------------ */
/*  Editor form                                                       */
/* ------------------------------------------------------------------ */

type FormProps = {
  testId?: string;
  initialTitle?: string;
  initialDescription?: string;
  initialItems?: EditorItem[];
};

function TestEditorForm({ testId, initialTitle = '', initialDescription = '', initialItems = [] }: FormProps) {
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
      queryClient.invalidateQueries({ queryKey: ['tests'] });
      router.push(Routes.TESTS);
      router.refresh();
    },
  });

  function addItem(type: 'group' | 'mc') {
    const item = type === 'group' ? newQuestionGroup() : newMultipleChoice();
    setItems(prev => [...prev, item]);
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
        {items.map((item, i) =>
          item.type === 'group' ? (
            <QuestionGroupBlock
              key={i}
              data={item}
              onChange={data => updateItem(i, data)}
              onRemove={() => removeItem(i)}
            />
          ) : (
            <MultipleChoiceQuestionBlock
              key={i}
              data={item}
              onChange={data => updateItem(i, data)}
              onRemove={() => removeItem(i)}
            />
          )
        )}
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

/* ------------------------------------------------------------------ */
/*  Wrapper that loads existing test for edit mode                     */
/* ------------------------------------------------------------------ */

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
      initialItems={test ? fromApiToEditorItems(test.questions, test.questionGroups) : undefined}
    />
  );
}
