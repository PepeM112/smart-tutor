import {
  QuestionGroupType,
  QuestionType,
  type GeneratedQuestionPreviewInput,
  type GeneratedQuestionPreviewOutput,
  type LongTextContent,
  type MultipleChoiceContent,
  type QuestionCreate,
  type QuestionRead,
  type SimpleContent,
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
      correctIndices: q.choices.flatMap((c, i) => (c.isCorrect ? [i] : [])),
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
      lengthLimit: q.lengthLimit,
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
  const content = q.content as { options: string[]; correctIndices: number[] };
  return {
    key: crypto.randomUUID(),
    type: QuestionType.MULTIPLE_CHOICE,
    prompt: q.prompt,
    choices: (content.options ?? []).map((text, i) => ({
      text,
      isCorrect: (content.correctIndices ?? []).includes(i),
    })) as Choice[],
    points: q.points ?? 1,
  };
}

function fromApiLongTextQuestion(q: QuestionRead): LongTextQuestionData {
  const content = q.content as { lengthLimit: number; rubric: { point: string; weight: number; category?: string }[] };
  return {
    key: crypto.randomUUID(),
    type: QuestionType.LONG_TEXT,
    prompt: q.prompt,
    lengthLimit: content.lengthLimit ?? 2,
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
    key: crypto.randomUUID(),
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
          points: q.points ?? 1,
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

/* ------------------------------------------------------------------ */
/*  Editor items <-> AI question-edit payload                         */
/* ------------------------------------------------------------------ */

function mcToPreviewInput(q: MultipleChoiceQuestionData): GeneratedQuestionPreviewInput {
  return {
    questionType: QuestionType.MULTIPLE_CHOICE,
    prompt: q.prompt,
    points: q.points,
    content: {
      options: q.choices.map(c => c.text),
      correctIndices: q.choices.flatMap((c, i) => (c.isCorrect ? [i] : [])),
    },
  };
}

function longTextToPreviewInput(q: LongTextQuestionData): GeneratedQuestionPreviewInput {
  return {
    questionType: QuestionType.LONG_TEXT,
    prompt: q.prompt,
    points: q.points,
    content: {
      lengthLimit: q.lengthLimit,
      rubric: q.criteria.map(c => ({
        point: c.point,
        weight: c.weight,
        ...(c.category ? { category: c.category } : {}),
      })),
    },
  };
}

/** One flattened AI-facing question, tagged with the editor block it came from. */
export type FlatQuestionEntry = { blockIndex: number; question: GeneratedQuestionPreviewInput };

/**
 * Flattens editor items into individual questions for the AI edit request.
 * A 'group' block expands into one entry per row, so each entry keeps track
 * of the block it originated from (needed to translate block-level selection
 * into the flat question indices the backend expects).
 */
export function flattenEditorItems(items: EditorItem[]): FlatQuestionEntry[] {
  const result: FlatQuestionEntry[] = [];
  items.forEach((item, blockIndex) => {
    if (item.type === QuestionType.MULTIPLE_CHOICE) {
      result.push({ blockIndex, question: mcToPreviewInput(item) });
    } else if (item.type === QuestionType.LONG_TEXT) {
      result.push({ blockIndex, question: longTextToPreviewInput(item) });
    } else {
      item.rows.forEach(row => {
        result.push({
          blockIndex,
          question: {
            questionType: QuestionType.SIMPLE,
            prompt: row.prompt,
            points: item.points,
            content: { answers: row.answers.filter(Boolean) },
          },
        });
      });
    }
  });
  return result;
}

export function editorItemsToPreviewInputs(items: EditorItem[]): GeneratedQuestionPreviewInput[] {
  return flattenEditorItems(items).map(entry => entry.question);
}

/**
 * Converts the AI's flat question list back into editor blocks. Mirrors the
 * grouping used when a test is first generated: one block per MC/Long Text
 * question, and all SIMPLE questions collapsed into a single group block
 * (the AI payload carries no group boundaries to restore).
 */
export function fromPreviewToEditorItems(questions: GeneratedQuestionPreviewOutput[]): EditorItem[] {
  const items: EditorItem[] = [];

  questions
    .filter(q => q.questionType === QuestionType.MULTIPLE_CHOICE)
    .forEach(q => {
      const content = q.content as MultipleChoiceContent;
      items.push({
        key: crypto.randomUUID(),
        type: QuestionType.MULTIPLE_CHOICE,
        prompt: q.prompt,
        choices: content.options.map((text, i) => ({
          text,
          isCorrect: content.correctIndices.includes(i),
        })) as Choice[],
        points: q.points ?? 1,
      });
    });

  questions
    .filter(q => q.questionType === QuestionType.LONG_TEXT)
    .forEach(q => {
      const content = q.content as LongTextContent;
      items.push({
        key: crypto.randomUUID(),
        type: QuestionType.LONG_TEXT,
        prompt: q.prompt,
        lengthLimit: content.lengthLimit,
        criteria: content.rubric.map(r => ({
          point: r.point,
          weight: r.weight,
          category: r.category ?? '',
        })) as Criterion[],
        points: q.points ?? 1,
      });
    });

  const simpleQuestions = questions.filter(q => q.questionType === QuestionType.SIMPLE);
  if (simpleQuestions.length > 0) {
    items.push({
      key: crypto.randomUUID(),
      type: 'group',
      groupType: QuestionGroupType.UNKNOWN,
      title: '',
      rows: simpleQuestions.map(q => {
        const content = q.content as SimpleContent;
        return { prompt: q.prompt, answers: content.answers } as SimpleRow;
      }),
      points: 1,
    });
  }

  return items;
}
