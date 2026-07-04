'use client';

import { CheckCircle2, Circle, Loader2, MinusCircle, XCircle, Check, X } from 'lucide-react';
import { useState } from 'react';

import {
  AnswerStatus,
  type AnswerRead,
  type QuestionRead,
  QuestionType,
  QuestionGroupType,
  type RubricResultItem,
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

function statusLabel(s: AnswerStatus): string {
  switch (s) {
    case AnswerStatus.CORRECT:
      return 'Correct';
    case AnswerStatus.PARTIAL:
      return 'Partially correct';
    case AnswerStatus.WRONG:
      return 'Wrong';
    case AnswerStatus.FAILED:
      return 'Grading failed';
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
    case AnswerStatus.FAILED:
      return 'text-destructive';
    default:
      return 'text-muted-foreground';
  }
}

function scoreThresholdColor(pct: number): string {
  if (pct >= 85) return 'text-green-600';
  if (pct >= 60) return 'text-amber-500';
  if (pct >= 35) return 'text-destructive';
  return 'text-foreground';
}

function scoreThresholdRing(pct: number): string {
  if (pct >= 85) return 'ring-green-500/40 hover:bg-green-500/5';
  if (pct >= 60) return 'ring-amber-500/40 hover:bg-amber-500/5';
  if (pct >= 35) return 'ring-destructive/40 hover:bg-destructive/5';
  return 'ring-foreground/10 hover:bg-foreground/5';
}

type LongTextScore = { label: string; pct: number };

function computeLongTextScore(answer?: AnswerRead, question?: QuestionRead): LongTextScore | null {
  if (!answer?.rubricResult || answer.rubricResult.length === 0) return null;
  const items = answer.rubricResult;
  const totalWeight = items.reduce((sum, i) => sum + i.weight, 0);
  const earnedWeight = items.filter(i => i.met).reduce((sum, i) => sum + i.weight, 0);
  const pct = totalWeight > 0 ? (earnedWeight / totalWeight) * 100 : 0;
  const maxPoints = question?.points ?? 1;
  const earned = (earnedWeight / totalWeight) * maxPoints;
  return { label: `${earned.toFixed(2)}/${maxPoints.toFixed(2)}`, pct };
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

function scoreCircleClasses(score: number): string {
  if (score >= 85) return 'border-green-500 bg-green-500/5 text-green-600';
  if (score >= 60) return 'border-amber-500 bg-amber-500/5 text-amber-500';
  if (score >= 35) return 'border-destructive bg-destructive/5 text-destructive';
  return 'border-foreground/20 bg-foreground/5 text-foreground';
}

function ScoreBanner({ result, testTitle }: { result: TestResultRead; testTitle: string }) {
  const score = result.score ?? 0;
  const pending = result.pendingAnswers ?? 0;

  return (
    <div className="flex items-center justify-between">
      <div>
        <h1 className="text-xl font-semibold">{testTitle}</h1>
        {result.totalPoints != null && result.totalPoints > 0 && (
          <p className="text-sm text-muted-foreground tabular-nums">
            {result.earnedPoints} / {result.totalPoints} pts
          </p>
        )}
        {pending > 0 && (
          <p className="text-sm text-muted-foreground flex items-center gap-1.5">
            <Loader2 className="size-3.5 animate-spin" />
            {pending} question{pending === 1 ? '' : 's'} pending AI review
          </p>
        )}
      </div>
      <div
        className={cn(
          'flex items-center justify-center size-20 rounded-full border-[3px] shrink-0',
          scoreCircleClasses(score)
        )}
      >
        <span className="text-lg font-bold tabular-nums">{score.toFixed(1)}%</span>
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
// Long text review with rubric breakdown
// ---------------------------------------------------------------------------

function RubricBreakdown({ items }: { items: RubricResultItem[] }) {
  const metCount = items.filter(i => i.met).length;

  return (
    <div className="space-y-2">
      <p className="text-sm font-medium text-muted-foreground">
        Rubric ({metCount}/{items.length} criteria met)
      </p>
      <div className="space-y-1.5">
        {items.map((item, idx) => (
          <div
            key={idx}
            className={cn(
              'rounded-md border-l-[3px] px-3 py-2',
              item.met
                ? 'border-l-green-500 bg-green-50 dark:bg-green-950/20'
                : 'border-l-red-400 bg-red-50 dark:bg-red-950/20'
            )}
          >
            <div className="flex items-start gap-2">
              {item.met ? (
                <Check className="size-4 text-green-600 shrink-0 mt-0.5" />
              ) : (
                <X className="size-4 text-red-500 shrink-0 mt-0.5" />
              )}
              <div className="space-y-0.5 min-w-0">
                <p className="text-sm">
                  {item.point}
                  <span className="text-muted-foreground ml-1.5 tabular-nums">({item.weight.toFixed(2)})</span>
                </p>
                {item.reason && <p className="text-xs text-muted-foreground italic">{item.reason}</p>}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function LongTextReview({ answer }: { answer?: AnswerRead }) {
  if (!answer) return null;

  return (
    <div className="space-y-3">
      <div>
        <p className="text-sm text-muted-foreground mb-1">Your answer:</p>
        <p className="text-sm whitespace-pre-wrap rounded-md bg-muted/50 p-3">{answer.userAnswer}</p>
      </div>
      {answer.rubricResult && answer.rubricResult.length > 0 && <RubricBreakdown items={answer.rubricResult} />}
    </div>
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
  const isLongText = question.questionType === QuestionType.LONG_TEXT;
  const correctAnswer = getCorrectAnswer(question);
  const [collapsed, setCollapsed] = useState(isLongText);

  const score = isLongText ? computeLongTextScore(answer, question) : null;
  const scoreColorClass = score ? scoreThresholdColor(score.pct) : statusColor(status);

  const toggle = isLongText ? () => setCollapsed(prev => !prev) : undefined;

  const header = (
    <div className="flex items-start justify-between gap-2">
      <p className={cn('font-medium', isLongText && 'cursor-pointer')} onClick={toggle}>
        {number != null && <span className="text-muted-foreground mr-1.5">{number}.</span>}
        {question.prompt}
      </p>
      <span className={cn('text-sm font-semibold tabular-nums shrink-0', scoreColorClass)}>
        {score?.label ?? statusLabel(status)}
      </span>
    </div>
  );

  const body = (
    <>
      {question.hint && <p className="text-xs text-muted-foreground italic">Hint: {question.hint}</p>}

      {isLongText ? (
        <LongTextReview answer={answer} />
      ) : isMC ? (
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
    return (
      <div className="rounded-lg border border-border p-4 space-y-3">
        {header}
        {body}
      </div>
    );
  }

  const ringClass = score ? scoreThresholdRing(score.pct) : 'ring-foreground/10';

  return (
    <Card
      className={cn('p-6 ring-2', ringClass, isLongText && 'cursor-pointer select-none transition-colors')}
      onClick={toggle}
    >
      <CardContent
        className={cn('space-y-4 p-0', isLongText && 'cursor-default')}
        onClick={isLongText ? (e: React.MouseEvent) => e.stopPropagation() : undefined}
      >
        {header}
        {!collapsed && body}
      </CardContent>
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

  (result.answers ?? []).forEach(a => answerMap.set(a.questionId, a));

  let itemNumber = 0;

  return (
    <div className="space-y-6">
      <ScoreBanner result={result} testTitle={test.title} />

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
                    'text-sm font-medium shrink-0 tabular-nums',
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
