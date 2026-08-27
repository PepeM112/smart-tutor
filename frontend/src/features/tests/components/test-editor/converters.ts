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
        ...(c.category && { category: c.category }),
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
  // SAFETY: caller filters by questionType === MULTIPLE_CHOICE before calling
  const content = q.content as { options: string[]; correctIndices: number[] };
  return {
    key: crypto.randomUUID(),
    id: q.id,
    type: QuestionType.MULTIPLE_CHOICE,
    prompt: q.prompt,
    choices: (content.options ?? []).map((text, i) => ({
      text,
      isCorrect: (content.correctIndices ?? []).includes(i),
    })) satisfies Choice[],
    points: q.points ?? 1,
  };
}

function fromApiLongTextQuestion(q: QuestionRead): LongTextQuestionData {
  // SAFETY: caller filters by questionType === LONG_TEXT before calling
  const content = q.content as { lengthLimit: number; rubric: { point: string; weight: number; category?: string }[] };
  return {
    key: crypto.randomUUID(),
    id: q.id,
    type: QuestionType.LONG_TEXT,
    prompt: q.prompt,
    lengthLimit: content.lengthLimit ?? 2,
    criteria: (content.rubric ?? []).map(r => ({
      point: r.point,
      weight: r.weight,
      category: r.category ?? '',
    })) satisfies Criterion[],
    points: q.points ?? 1,
  };
}

function fromApiGroup(g: TestQuestionGroupRead): QuestionGroupData {
  return {
    key: crypto.randomUUID(),
    type: 'group',
    groupType: g.type ?? QuestionGroupType.GENERIC,
    title: g.title ?? '',
    rows: (g.questions ?? []).map(q => {
      // SAFETY: group questions are always SIMPLE type with { answers: string[] } content
      const content = q.content as { answers: string[] };
      return {
        id: q.id,
        prompt: q.prompt,
        answers: content.answers ?? [],
      } satisfies SimpleRow;
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
        // Wrap standalone SIMPLE questions in a synthetic group so the editor treats all items uniformly
        const syntheticGroup: TestQuestionGroupRead = {
          id: '',
          testId: '',
          type: QuestionGroupType.GENERIC,
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
        ...(c.category && { category: c.category }),
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
 * Merge the AI edit response back into existing editor items, preserving
 * group metadata (title, groupType, points) that the flat AI format can't carry.
 *
 * The AI returns the full flat question list (same count and order as
 * `flattenEditorItems(currentItems)`). Each position maps back to a block via
 * the `blockIndex` tag from flattening. We rebuild each block's content from
 * the response while keeping the block's structural metadata intact.
 */
export function mergeAiEditResult(
  currentItems: EditorItem[],
  aiQuestions: GeneratedQuestionPreviewOutput[],
  selectedIndices: number[]
): EditorItem[] {
  const flat = flattenEditorItems(currentItems);
  const selectedSet = new Set(selectedIndices);

  // Group AI response questions by their originating block index.
  // When selectedIndices is provided, only include AI output at those flat positions —
  // unselected positions keep the original editor content.
  const blockQuestions = new Map<number, { flatIndex: number; question: GeneratedQuestionPreviewOutput }[]>();
  flat.forEach((entry, i) => {
    if (i >= aiQuestions.length) return;
    if (selectedSet && !selectedSet.has(i)) return;
    const existing = blockQuestions.get(entry.blockIndex) ?? [];
    existing.push({ flatIndex: i, question: aiQuestions[i] });
    blockQuestions.set(entry.blockIndex, existing);
  });

  return currentItems.map((item, blockIndex) => {
    const entries = blockQuestions.get(blockIndex);
    if (!entries || entries.length === 0) return item;

    // MC block: single question, rebuild with AI content
    if (item.type === QuestionType.MULTIPLE_CHOICE) {
      const q = entries[0].question;
      const content = q.content as MultipleChoiceContent;
      return {
        ...item,
        prompt: q.prompt,
        choices: content.options.map((text, i) => ({
          text,
          isCorrect: content.correctIndices.includes(i),
        })) satisfies Choice[],
        points: q.points ?? item.points,
      };
    }

    // Long Text block: single question, rebuild with AI content
    if (item.type === QuestionType.LONG_TEXT) {
      const q = entries[0].question;
      const content = q.content as LongTextContent;
      return {
        ...item,
        prompt: q.prompt,
        lengthLimit: content.lengthLimit,
        criteria: content.rubric.map(r => ({
          point: r.point,
          weight: r.weight,
          category: r.category ?? '',
        })) satisfies Criterion[],
        points: q.points ?? item.points,
      };
    }

    // Group block: only some rows may have AI replacements — merge selectively.
    const aiByFlat = new Map(entries.map(e => [e.flatIndex, e.question]));
    let flatCursor = flat.findIndex(f => f.blockIndex === blockIndex);
    return {
      ...item,
      rows: item.rows.map(row => {
        const aiQ = aiByFlat.get(flatCursor);
        flatCursor++;
        if (!aiQ) return row;
        const content = aiQ.content as SimpleContent;
        return { id: row.id, prompt: aiQ.prompt, answers: content.answers } satisfies SimpleRow;
      }),
    };
  });
}
