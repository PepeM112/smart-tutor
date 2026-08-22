import {
  NoteSource,
  type NoteRead,
  type QuestionListRead,
  type QuestionRead,
  type TestRead,
  type TestReadStripped,
} from '@/client';

export function formatNotesList(notes: NoteRead[]): string {
  if (notes.length === 0) return 'No notes to display.';
  const lines = [`Notes list (${notes.length} shown):`];
  notes.forEach(n => {
    const updated = n.updatedAt ? ` | updated: ${String(n.updatedAt)}` : '';
    lines.push(`- "${n.title}" (ID: ${n.id}${updated})`);
  });
  return lines.join('\n');
}

export function formatTestsList(tests: TestRead[]): string {
  if (tests.length === 0) return 'No tests to display.';
  const lines = [`Tests list (${tests.length} shown):`];
  tests.forEach(t => {
    const qCount =
      (t.questions?.length ?? 0) + (t.questionGroups ?? []).reduce((sum, g) => sum + (g.questions?.length ?? 0), 0);
    lines.push(`- "${t.title}" (ID: ${t.id} | ${qCount} questions)`);
  });
  return lines.join('\n');
}

export function formatNoteDetail(note: NoteRead): string {
  const lines = [
    `Note: "${note.title}" (ID: ${note.id})`,
    `Source: ${note.source === NoteSource.USER_CREATED ? 'User-created' : 'AI-generated'}`,
    note.updatedAt ? `Updated: ${String(note.updatedAt)}` : '',
    '',
    note.content || '(empty)',
  ];
  return lines.join('\n');
}

export function formatTestDetail(test: TestRead | TestReadStripped): string {
  const lines = [
    `Test: "${test.title}" (ID: ${test.id})`,
    test.description ? `Description: ${test.description}` : null,
    '',
  ].filter(Boolean) as string[];

  const allQuestions = [...(test.questions ?? []), ...(test.questionGroups ?? []).flatMap(g => g.questions ?? [])];

  if (allQuestions.length === 0) {
    lines.push('(no questions)');
  } else {
    lines.push(`Questions (${allQuestions.length}):`);
    allQuestions.forEach((q, i) => {
      lines.push(`${i + 1}. [${q.questionType}] ${q.prompt} (ID: ${q.id})`);
    });
  }

  return lines.join('\n');
}

export function formatQuestionsList(questions: (QuestionRead | QuestionListRead)[]): string {
  if (questions.length === 0) return 'No questions to display.';
  const lines = [`Questions (${questions.length} shown):`];
  questions.forEach(q => {
    const location = q.testId ? `in test ${q.testId}` : 'in Question Bank';
    lines.push(`- [${q.questionType}] "${q.prompt}" (ID: ${q.id}, ${location})`);
  });
  return lines.join('\n');
}

export function formatResultDetail(result: {
  id: string;
  testId: string;
  score?: number;
  totalQuestions: number;
  correctAnswers: number;
  earnedPoints?: number;
  totalPoints?: number;
  createdAt: Date;
}): string {
  const pct =
    result.totalPoints && result.earnedPoints != null
      ? Math.round((result.earnedPoints / result.totalPoints) * 100)
      : null;
  const lines = [
    `Exam result (ID: ${result.id})`,
    `Test ID: ${result.testId}`,
    `Correct: ${result.correctAnswers}/${result.totalQuestions}`,
    pct != null ? `Points: ${result.earnedPoints}/${result.totalPoints} (${pct}%)` : null,
    `Date: ${String(result.createdAt)}`,
  ].filter(Boolean) as string[];
  return lines.join('\n');
}
