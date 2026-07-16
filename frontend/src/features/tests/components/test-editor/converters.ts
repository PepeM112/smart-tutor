import {
  QuestionGroupType,
  QuestionType,
  type QuestionCreate,
  type QuestionRead,
  type TestQuestionGroupCreate,
  type TestQuestionGroupRead,
} from '@/client';

import type { Criterion, LongTextQuestionData } from '../long-text-question-block';
import type { Choice, MultipleChoiceQuestionData } from '../multiple-choice-question-block';
import type { QuestionGroupData, SimpleRow } from '../question-group-block';
import type { EditorItem } from './types';

/* ------------------------------------------------------------------ */
/*  Editor → API payload                                              */
/* ------------------------------------------------------------------ */

export function mcToApiQuestion(q: MultipleChoiceQuestionData, order: number): QuestionCreate {
  return {
    questionType: QuestionType.MULTIPLE_CHOICE,
    prompt: q.prompt,
    order,
    points: q.points,
    content: {
      options: q.choices.map(c => c.text),
      correct_indices: q.choices.flatMap((c, i) => (c.isCorrect ? [i] : [])),
    },
  };
}

export function longTextToApiQuestion(q: LongTextQuestionData, order: number): QuestionCreate {
  return {
    questionType: QuestionType.LONG_TEXT,
    prompt: q.prompt,
    order,
    points: q.points,
    content: {
      length_limit: q.lengthLimit,
      rubric: q.criteria.map(c => ({
        point: c.point,
        weight: c.weight,
        ...(c.category ? { category: c.category } : {}),
      })),
    },
  };
}

export function groupToApiGroup(g: QuestionGroupData, order: number): TestQuestionGroupCreate {
  return {
    type: g.groupType,
    order,
    title: g.title.trim() || undefined,
    points: g.points,
    questions: g.rows.map((row, i) => ({
      questionType: QuestionType.SIMPLE,
      prompt: row.prompt,
      order: i,
      content: {
        answers: row.answers.filter(Boolean),
      },
    })),
  };
}

/* ------------------------------------------------------------------ */
/*  API response → Editor items                                       */
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
    points: q.points ?? 1,
  };
}

function fromApiLongTextQuestion(q: QuestionRead): LongTextQuestionData {
  const content = q.content as { length_limit: number; rubric: { point: string; weight: number; category?: string }[] };
  return {
    type: QuestionType.LONG_TEXT,
    prompt: q.prompt,
    lengthLimit: content.length_limit ?? 2,
    criteria: (content.rubric ?? []).map(r => ({
      point: r.point,
      weight: r.weight,
      category: r.category ?? '',
    })) as Criterion[],
    points: q.points ?? 1,
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
        answers: content.answers ?? [],
      } as SimpleRow;
    }),
    points: g.points ?? 1,
  };
}

/**
 * Merge standalone questions and question groups into a single ordered list.
 * Both share the same order space on the backend.
 */
export function fromApiToEditorItems(
  questions: QuestionRead[] | undefined,
  groups: TestQuestionGroupRead[] | undefined
): EditorItem[] {
  type Tagged =
    | { order: number; kind: 'multiple_choice'; data: QuestionRead }
    | { order: number; kind: 'long'; data: QuestionRead }
    | { order: number; kind: 'group'; data: TestQuestionGroupRead };

  const tagged: Tagged[] = [
    ...(questions ?? []).reduce<Tagged[]>((acc, q) => {
      if (q.questionType === QuestionType.MULTIPLE_CHOICE) {
        acc.push({ order: q.order ?? 0, kind: 'multiple_choice', data: q });
      } else if (q.questionType === QuestionType.LONG_TEXT) {
        acc.push({ order: q.order ?? 0, kind: 'long', data: q });
      } else if (q.questionType === QuestionType.SIMPLE) {
        const syntheticGroup: TestQuestionGroupRead = {
          id: '',
          testId: '',
          type: QuestionGroupType.UNKNOWN,
          order: q.order ?? 0,
          title: null,
          questions: [q],
        };
        acc.push({ order: q.order ?? 0, kind: 'group', data: syntheticGroup });
      }
      return acc;
    }, []),
    ...(groups ?? []).map<Tagged>(g => ({ order: g.order ?? 0, kind: 'group', data: g })),
  ].sort((a, b) => a.order - b.order);

  return tagged
    .map(t => {
      if (t.kind === 'multiple_choice') return fromApiMcQuestion(t.data);
      if (t.kind === 'long') return fromApiLongTextQuestion(t.data);
      if (t.kind === 'group') return fromApiGroup(t.data);
      return undefined;
    })
    .filter(it => it !== undefined);
}
