'use client';

import { CheckCircle2, Circle, MinusCircle, XCircle, AlertTriangle, Clock } from 'lucide-react';

import {
  AnswerStatus,
  type AnswerRead,
  type QuestionRead,
  QuestionType,
  QuestionGroupType,
  type TestQuestionGroupRead,
  type TestRead,
  type TestResultRead,
} from '@/client';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { cn } from '@/lib/utils';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type ExamItem =
  | { kind: 'question'; question: QuestionRead; order: number }
  | { kind: 'group'; group: TestQuestionGroupRead; order: number };

function buildExamItems(test: TestRead): ExamItem[] {
  const items: ExamItem[] = [];
  for (const q of test.questions ?? []) {
    items.push({ kind: 'question', question: q, order: q.order ?? 0 });
  }
  for (const g of test.questionGroups ?? []) {
    items.push({ kind: 'group', group: g, order: g.order ?? 0 });
  }
  return items.sort((a, b) => a.order - b.order);
}

function StatusIcon({ status }: { status: AnswerStatus }) {
  switch (status) {
    case AnswerStatus.CORRECT:
      return <CheckCircle2 className="size-5 text-green-600 shrink-0" />;
    case AnswerStatus.PARTIAL:
      return <AlertTriangle className="size-5 text-amber-500 shrink-0" />;
    case AnswerStatus.WRONG:
      return <XCircle className="size-5 text-destructive shrink-0" />;
    default:
      return <Clock className="size-5 text-muted-foreground shrink-0" />;
  }
}

function statusLabel(s: AnswerStatus): string {
  switch (s) {
    case AnswerStatus.CORRECT:
      return 'Correct';
    case AnswerStatus.PARTIAL:
      return 'Partially correct';
    case AnswerStatus.WRONG:
      return 'Wrong';
    default:
      return 'Pending';
  }
}

function statusColor(s: AnswerStatus): string {
  switch (s) {
    case AnswerStatus.CORRECT:
      return 'text-green-600';
    case AnswerStatus.PARTIAL:
      return 'text-amber-500';
    case AnswerStatus.WRONG:
      return 'text-destructive';
    default:
      return 'text-muted-foreground';
  }
}

function getCorrectAnswer(question: QuestionRead): string {
  const content = question.content as Record<string, unknown> | undefined;
  if (!content) return '';

  if (question.questionType === QuestionType.SIMPLE) {
    const answers = (content.answers ?? []) as string[];
    return answers.join(', ');
  }

  if (question.questionType === QuestionType.MULTIPLE_CHOICE) {
    const options = (content.options ?? []) as string[];
    const correctIndices = (content.correct_indices ?? []) as number[];
    return correctIndices
      .map(i => options[i])
      .filter(Boolean)
      .join(', ');
  }

  return '';
}

function getUserAnswerDisplay(question: QuestionRead, userAnswer: string): string {
  if (question.questionType === QuestionType.MULTIPLE_CHOICE) {
    const content = question.content as Record<string, unknown> | undefined;
    if (!content) return userAnswer;
    const options = (content.options ?? []) as string[];
    const selectedIndices = userAnswer
      .split(',')
      .map(s => parseInt(s.trim(), 10))
      .filter(n => !isNaN(n));
    return (
      selectedIndices
        .map(i => options[i])
        .filter(Boolean)
        .join(', ') || '(no answer)'
    );
  }
  return userAnswer || '(no answer)';
}

function countCorrectInGroup(questions: QuestionRead[], answerMap: Map<string, AnswerRead>): number {
  return questions.filter(q => answerMap.get(q.id)?.status === AnswerStatus.CORRECT).length;
}

// ---------------------------------------------------------------------------
// Multiple choice options review
// ---------------------------------------------------------------------------

function MultipleChoiceReview({ question, userAnswer }: { question: QuestionRead; userAnswer: string }) {
  const content = question.content as Record<string, unknown> | undefined;
  if (!content) return null;

  const options = (content.options ?? []) as string[];
  const correctIndices = new Set((content.correct_indices ?? []) as number[]);
  const selectedIndices = new Set(
    userAnswer
      ? userAnswer
          .split(',')
          .map(s => parseInt(s.trim(), 10))
          .filter(n => !isNaN(n))
      : []
  );

  return (
    <div className="space-y-1">
      {options.map((option, idx) => {
        const isSelected = selectedIndices.has(idx);
        const isCorrect = correctIndices.has(idx);

        let bg = '';
        let Icon = Circle;
        let iconColor = 'text-muted-foreground/40';

        if (isSelected && isCorrect) {
          bg = 'bg-green-50 dark:bg-green-950/30';
          Icon = CheckCircle2;
          iconColor = 'text-green-600';
        } else if (!isSelected && isCorrect) {
          bg = 'bg-amber-50 dark:bg-amber-950/30';
          Icon = MinusCircle;
          iconColor = 'text-amber-500';
        } else if (isSelected && !isCorrect) {
          bg = 'bg-red-50 dark:bg-red-950/30';
          Icon = XCircle;
          iconColor = 'text-destructive';
        }

        return (
          <div key={idx} className={cn('flex items-center gap-2 rounded-md px-2.5 py-1.5', bg)}>
            <Icon className={cn('size-4 shrink-0', iconColor)} />
            <span className="text-sm">{option}</span>
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Score banner
// ---------------------------------------------------------------------------

function ScoreBanner({ result }: { result: TestResultRead }) {
  const score = result.score ?? 0;
  const pending = result.pendingAnswers ?? 0;
  const graded = result.totalQuestions - pending;
  const color =
    score >= 80
      ? 'border-green-200 bg-green-50 dark:border-green-900 dark:bg-green-950/30'
      : score >= 50
        ? 'border-yellow-200 bg-yellow-50 dark:border-yellow-900 dark:bg-yellow-950/30'
        : 'border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/30';

  return (
    <div className={cn('rounded-xl border p-5 flex items-center justify-between', color)}>
      <div>
        <p className="text-2xl font-bold">
          {score.toFixed(1)}%
          {result.totalPoints != null && result.totalPoints > 0 && (
            <span className="text-base font-normal text-muted-foreground ml-2">
              {result.earnedPoints} / {result.totalPoints} pts
            </span>
          )}
        </p>
        <p className="text-sm text-muted-foreground">
          {result.correctAnswers} of {graded} correct
        </p>
        {pending > 0 && (
          <p className="text-sm text-muted-foreground">
            {pending} question{pending === 1 ? '' : 's'} pending AI review
          </p>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Vocabulary review table
// ---------------------------------------------------------------------------

function VocabularyReviewTable({
  questions,
  answerMap,
}: {
  questions: QuestionRead[];
  answerMap: Map<string, AnswerRead>;
}) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-12">#</TableHead>
          <TableHead>Prompt</TableHead>
          <TableHead>Your answer</TableHead>
          <TableHead>Correct answer</TableHead>
          <TableHead className="w-32 text-right">Result</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {questions.map((q, idx) => {
          const answer = answerMap.get(q.id);
          const status = answer?.status ?? AnswerStatus.UNKNOWN;
          const isWrong = status === AnswerStatus.WRONG || status === AnswerStatus.PARTIAL;
          return (
            <TableRow key={q.id}>
              <TableCell className="text-muted-foreground font-medium">{idx + 1}</TableCell>
              <TableCell className="font-medium">
                {q.prompt}
                {q.hint && <span className="text-xs text-muted-foreground italic ml-2">({q.hint})</span>}
              </TableCell>
              <TableCell>
                <span className={cn(isWrong && 'line-through text-muted-foreground')}>
                  {answer ? getUserAnswerDisplay(q, answer.userAnswer) : '(no answer)'}
                </span>
              </TableCell>
              <TableCell>
                <span className="text-green-600 font-medium">{getCorrectAnswer(q)}</span>
              </TableCell>
              <TableCell className="text-right">
                <span className={cn('text-sm font-medium', statusColor(status))}>{statusLabel(status)}</span>
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}

// ---------------------------------------------------------------------------
// Question review card
// ---------------------------------------------------------------------------

function QuestionReviewCard({
  question,
  answer,
  number,
  nested,
}: {
  question: QuestionRead;
  answer?: AnswerRead;
  number?: number;
  nested?: boolean;
}) {
  const status = answer?.status ?? AnswerStatus.UNKNOWN;
  const isWrong = status === AnswerStatus.WRONG || status === AnswerStatus.PARTIAL;
  const isMC = question.questionType === QuestionType.MULTIPLE_CHOICE;
  const correctAnswer = getCorrectAnswer(question);

  const inner = (
    <>
      <div className="flex items-start justify-between gap-2">
        <p className="font-medium">
          {number != null && <span className="text-muted-foreground mr-1.5">{number}.</span>}
          {question.prompt}
        </p>
        <div className="flex items-center gap-1.5 shrink-0">
          <StatusIcon status={status} />
          <span className={cn('text-sm font-medium', statusColor(status))}>{statusLabel(status)}</span>
        </div>
      </div>

      {question.hint && <p className="text-xs text-muted-foreground italic">Hint: {question.hint}</p>}

      {isMC ? (
        <MultipleChoiceReview question={question} userAnswer={answer?.userAnswer ?? ''} />
      ) : (
        <div className="space-y-1 text-sm">
          <p>
            <span className="text-muted-foreground">Your answer: </span>
            <span className={cn(isWrong && 'line-through text-muted-foreground')}>
              {answer ? getUserAnswerDisplay(question, answer.userAnswer) : '(no answer)'}
            </span>
          </p>
          {isWrong && correctAnswer && (
            <p>
              <span className="text-muted-foreground">Correct answer: </span>
              <span className="text-green-600 font-medium">{correctAnswer}</span>
            </p>
          )}
        </div>
      )}

      {question.explanation && (
        <p className="text-xs text-muted-foreground border-t border-border pt-2">{question.explanation}</p>
      )}
    </>
  );

  if (nested) {
    return <div className="rounded-lg border border-border p-4 space-y-3">{inner}</div>;
  }

  return (
    <Card className="p-6">
      <CardContent className="space-y-4 p-0">{inner}</CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

type Props = {
  result: TestResultRead;
  test: TestRead;
};

export function ResultDetail({ result, test }: Props) {
  const items = buildExamItems(test);
  const answerMap = new Map<string, AnswerRead>();
  for (const a of result.answers ?? []) {
    answerMap.set(a.questionId, a);
  }

  let itemNumber = 0;

  return (
    <div className="space-y-6">
      <ScoreBanner result={result} />

      {items.map((item, idx) => {
        if (item.kind === 'question') {
          itemNumber++;
          return (
            <QuestionReviewCard
              key={item.question.id}
              question={item.question}
              answer={answerMap.get(item.question.id)}
              number={itemNumber}
            />
          );
        }

        const group = item.group;
        const questions = group.questions ?? [];
        const isVocabulary = group.type === QuestionGroupType.VOCABULARY;
        itemNumber++;
        const groupNumber = itemNumber;

        const correctCount = countCorrectInGroup(questions, answerMap);
        const totalCount = questions.length;

        return (
          <Card key={group.id ?? `group-${idx}`} className="p-6">
            <CardContent className="space-y-4 p-0">
              <div className="flex items-start justify-between gap-2">
                <p className="font-medium">
                  <span className="text-muted-foreground mr-1.5">{groupNumber}.</span>
                  {group.title ?? 'Question Group'}
                </p>
                <span
                  className={cn(
                    'text-sm font-medium shrink-0',
                    correctCount === totalCount
                      ? 'text-green-600'
                      : correctCount === 0
                        ? 'text-destructive'
                        : 'text-amber-500'
                  )}
                >
                  {correctCount}/{totalCount}
                </span>
              </div>

              {isVocabulary ? (
                <VocabularyReviewTable questions={questions} answerMap={answerMap} />
              ) : (
                <div className="space-y-3">
                  {questions.map(q => (
                    <QuestionReviewCard key={q.id} question={q} answer={answerMap.get(q.id)} nested />
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
