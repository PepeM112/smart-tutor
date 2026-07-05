'use client';

import {
  CheckCircle2,
  ChevronsLeftRight,
  Circle,
  CircleAlert,
  CircleCheck,
  CircleX,
  Loader2,
  MinusCircle,
  XCircle,
  Check,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

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
import { Tooltip } from '@/components/ui/tooltip';
import {
  getScoreTextColor,
  getScoreRingColor,
  getScoreBgColor,
  getScoreCircleClasses,
  getStatusRingColor,
  getStatusBgColor,
} from '@/features/history/utils/score-colors';
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

function StatusIcon({ status, className }: { status: AnswerStatus; className?: string }) {
  const base = cn('size-5 shrink-0', className);
  switch (status) {
    case AnswerStatus.CORRECT:
      return <CircleCheck className={cn(base, 'text-green-600')} />;
    case AnswerStatus.PARTIAL:
      return <CircleAlert className={cn(base, 'text-amber-500')} />;
    case AnswerStatus.WRONG:
      return <CircleX className={cn(base, 'text-destructive')} />;
    case AnswerStatus.FAILED:
      return <CircleX className={cn(base, 'text-destructive')} />;
    default:
      return <Loader2 className={cn(base, 'text-muted-foreground animate-spin')} />;
  }
}

type LongTextScore = { label: string; pct: number };

function computeLongTextScore(answer?: AnswerRead, question?: QuestionRead): LongTextScore | null {
  if (!answer?.rubricResult || answer.rubricResult.length === 0) return null;
  const items = answer.rubricResult;
  const totalWeight = items.reduce((sum, i) => sum + i.weight, 0);
  const earnedWeight = items.filter(i => i.met).reduce((sum, i) => sum + i.weight, 0);
  const pct = totalWeight > 0 ? (earnedWeight / totalWeight) * 100 : 0;
  const maxPoints = question?.points ?? 1;
  const earned = totalWeight > 0 ? (earnedWeight / totalWeight) * maxPoints : 0;
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

function parseSelectedIndices(userAnswer: string): number[] {
  return userAnswer
    .split(',')
    .map(s => parseInt(s.trim(), 10))
    .filter(n => !isNaN(n));
}

function getUserAnswerDisplay(question: QuestionRead, userAnswer: string): string {
  if (question.questionType === QuestionType.MULTIPLE_CHOICE) {
    const content = question.content as Record<string, unknown> | undefined;
    if (!content) return userAnswer;
    const options = (content.options ?? []) as string[];
    return (
      parseSelectedIndices(userAnswer)
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
  const selectedIndices = new Set(userAnswer ? parseSelectedIndices(userAnswer) : []);

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
          getScoreCircleClasses(score)
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
                <StatusIcon status={status} className="ml-auto" />
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
// Compact question card (left panel — all question types)
// ---------------------------------------------------------------------------

function CompactQuestionCard({
  question,
  answer,
  number,
  isSelected,
  disabled,
  onClick,
}: {
  question: QuestionRead;
  answer?: AnswerRead;
  number: number;
  isSelected: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  const status = answer?.status ?? AnswerStatus.UNKNOWN;
  const isLongText = question.questionType === QuestionType.LONG_TEXT;
  const score = isLongText ? computeLongTextScore(answer, question) : null;

  const ringClass = score ? getScoreRingColor(score.pct) : getStatusRingColor(status);
  const bgClass = score ? getScoreBgColor(score.pct) : getStatusBgColor(status);

  return (
    <Card
      role="button"
      tabIndex={disabled ? -1 : 0}
      aria-disabled={disabled}
      className={cn(
        'p-4 ring-1 transition-colors',
        ringClass,
        isSelected && bgClass,
        disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer select-none'
      )}
      onClick={disabled ? undefined : onClick}
    >
      <CardContent className="p-0">
        <div className="flex items-start justify-between gap-2">
          <p className="font-medium">
            <span className="text-muted-foreground mr-1.5">{number}.</span>
            {question.prompt}
          </p>
          {isLongText && !score && (status === AnswerStatus.UNKNOWN || !answer) ? (
            <Loader2 className="size-4 animate-spin text-muted-foreground shrink-0" />
          ) : score ? (
            <span className={cn('text-sm font-semibold tabular-nums shrink-0', getScoreTextColor(score.pct))}>
              {score.label}
            </span>
          ) : (
            <StatusIcon status={status} />
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Nested question card (inside groups — still inline, not clickable)
// ---------------------------------------------------------------------------

function NestedQuestionCard({ question, answer }: { question: QuestionRead; answer?: AnswerRead }) {
  const status = answer?.status ?? AnswerStatus.UNKNOWN;
  const isWrong = status === AnswerStatus.WRONG || status === AnswerStatus.PARTIAL;
  const isMC = question.questionType === QuestionType.MULTIPLE_CHOICE;
  const correctAnswer = getCorrectAnswer(question);

  return (
    <div className="rounded-lg border border-border p-4 space-y-3">
      <div className="flex items-start justify-between gap-2">
        <p className="font-medium">{question.prompt}</p>
        <StatusIcon status={status} />
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
    </div>
  );
}

// ---------------------------------------------------------------------------
// Right panel detail — handles all question types
// ---------------------------------------------------------------------------

function SimpleQuestionDetail({ question, answer }: { question: QuestionRead; answer?: AnswerRead }) {
  const status = answer?.status ?? AnswerStatus.UNKNOWN;
  const isWrong = status === AnswerStatus.WRONG || status === AnswerStatus.PARTIAL;
  const correctAnswer = getCorrectAnswer(question);

  return (
    <div className="space-y-3">
      {question.hint && <p className="-mt-2 text-sm text-muted-foreground italic">Hint: {question.hint}</p>}
      <div className="space-y-2 text-sm">
        <div>
          <p className="text-muted-foreground mb-0.5">Your answer</p>
          <p className={cn('rounded-md bg-muted/50 p-3', isWrong && 'line-through text-muted-foreground')}>
            {answer ? getUserAnswerDisplay(question, answer.userAnswer) : '(no answer)'}
          </p>
        </div>
        {correctAnswer && (
          <div>
            <div className="flex items-center gap-1.5 mb-0.5">
              <p className="text-muted-foreground">Correct answer</p>
              {question.explanation && <Tooltip content={question.explanation} />}
            </div>
            <p className="rounded-md bg-muted/50 p-3 text-green-600 font-medium">{correctAnswer}</p>
          </div>
        )}
      </div>
    </div>
  );
}

function MCQuestionDetail({ question, answer }: { question: QuestionRead; answer?: AnswerRead }) {
  return (
    <div className="space-y-3">
      {question.hint && <p className="-mt-2 text-sm text-muted-foreground italic">Hint: {question.hint}</p>}
      <MultipleChoiceReview question={question} userAnswer={answer?.userAnswer ?? ''} />
      {question.explanation && (
        <div className="flex items-center gap-1.5 border-t border-border pt-2">
          <Tooltip content={question.explanation} />
          <p className="text-xs text-muted-foreground">Explanation</p>
        </div>
      )}
    </div>
  );
}

function QuestionDetailPanel({
  question,
  answer,
  number,
}: {
  question: QuestionRead;
  answer?: AnswerRead;
  number: number;
}) {
  const isLongText = question.questionType === QuestionType.LONG_TEXT;
  const isMC = question.questionType === QuestionType.MULTIPLE_CHOICE;

  return (
    <div className="space-y-4">
      <p className="font-medium">
        <span className="text-muted-foreground mr-1.5">{number}.</span>
        {question.prompt}
      </p>
      {isLongText ? (
        <>
          {question.hint && <p className="-mt-2 text-xs text-muted-foreground italic">Hint: {question.hint}</p>}
          <LongTextReview answer={answer} />
          {question.explanation && (
            <p className="text-xs text-muted-foreground border-t border-border pt-2">{question.explanation}</p>
          )}
        </>
      ) : isMC ? (
        <MCQuestionDetail question={question} answer={answer} />
      ) : (
        <SimpleQuestionDetail question={question} answer={answer} />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

type Props = {
  result: TestResultRead;
  test: TestRead;
};

const SPLIT_RATIO_KEY = 'result-detail-split-ratio';
const DEFAULT_SPLIT_RATIO = 0.5;

function saveSplitRatio(ratio: number): void {
  try {
    localStorage.setItem(SPLIT_RATIO_KEY, ratio.toString());
  } catch {
    /* storage unavailable */
  }
}

function loadSplitRatio(): number {
  if (typeof window === 'undefined') return DEFAULT_SPLIT_RATIO;
  try {
    const stored = localStorage.getItem(SPLIT_RATIO_KEY);
    if (stored) {
      const parsed = parseFloat(stored);
      if (!isNaN(parsed) && parsed >= 0.2 && parsed <= 0.8) return parsed;
    }
  } catch {
    /* storage unavailable */
  }
  return DEFAULT_SPLIT_RATIO;
}

export function ResultDetail({ result, test }: Props) {
  const [selectedQuestionId, setSelectedQuestionId] = useState<string | null>(null);
  const [splitRatio, setSplitRatio] = useState(loadSplitRatio);
  const containerRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);

  const items = useMemo(() => buildExamItems(test), [test]);

  const answerMap = useMemo(() => {
    const map = new Map<string, AnswerRead>();
    (result.answers ?? []).forEach(a => map.set(a.questionId, a));
    return map;
  }, [result.answers]);

  const isPending = (result.pendingAnswers ?? 0) > 0;

  const { itemNumbers, questionNumbers } = useMemo(() => {
    const itemNums: number[] = [];
    const questionNums = new Map<string, number>();
    let counter = 0;
    items.forEach(item => {
      counter++;
      itemNums.push(counter);
      if (item.kind === 'question') {
        questionNums.set(item.question.id, counter);
      }
    });
    return { itemNumbers: itemNums, questionNumbers: questionNums };
  }, [items]);

  const selectedQuestion = selectedQuestionId
    ? (test.questions ?? []).find(q => q.id === selectedQuestionId)
    : undefined;
  const selectedAnswer = selectedQuestionId ? answerMap.get(selectedQuestionId) : undefined;

  const handleDividerMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    isDragging.current = true;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }, []);

  const latestRatio = useRef(splitRatio);
  latestRatio.current = splitRatio;

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging.current || !containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const ratio = (e.clientX - rect.left) / rect.width;
      setSplitRatio(Math.max(0.2, Math.min(0.8, ratio)));
    };
    const handleMouseUp = () => {
      if (!isDragging.current) return;
      isDragging.current = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      saveSplitRatio(latestRatio.current);
    };
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, []);

  const hasSelection = selectedQuestionId !== null;

  return (
    <div ref={containerRef} className="flex h-[calc(100vh-6rem)] overflow-hidden">
      {/* Left panel */}
      <div className="min-w-0 overflow-y-auto scrollbar-none p-0.5 pr-4 pb-4 space-y-4" style={{ flex: splitRatio }}>
        <ScoreBanner result={result} testTitle={test.title} />

        {items.map((item, idx) => {
          if (item.kind === 'question') {
            const question = item.question;

            return (
              <CompactQuestionCard
                key={question.id}
                question={question}
                answer={answerMap.get(question.id)}
                number={itemNumbers[idx]}
                isSelected={selectedQuestionId === question.id}
                disabled={question.questionType === QuestionType.LONG_TEXT && isPending}
                onClick={() => setSelectedQuestionId(question.id)}
              />
            );
          }

          const group = item.group;
          const questions = group.questions ?? [];
          const isVocabulary = group.type === QuestionGroupType.VOCABULARY;
          const groupNumber = itemNumbers[idx];

          const correctCount = countCorrectInGroup(questions, answerMap);
          const totalCount = questions.length;
          const groupPct = totalCount > 0 ? (correctCount / totalCount) * 100 : 0;

          return (
            <Card key={group.id ?? `group-${idx}`} className="p-6 ring-1 ring-foreground/10">
              <CardContent className="space-y-4 p-0">
                <div className="flex items-start justify-between gap-2">
                  <p className="font-medium">
                    <span className="text-muted-foreground mr-1.5">{groupNumber}.</span>
                    {group.title ?? 'Question Group'}
                  </p>
                  <span className={cn('text-sm font-medium shrink-0 tabular-nums', getScoreTextColor(groupPct))}>
                    {correctCount}/{totalCount}
                  </span>
                </div>

                {isVocabulary ? (
                  <VocabularyReviewTable questions={questions} answerMap={answerMap} />
                ) : (
                  <div className="space-y-3">
                    {questions.map(q => (
                      <NestedQuestionCard key={q.id} question={q} answer={answerMap.get(q.id)} />
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Resizable divider — always rendered for consistent layout */}
      <div
        className={cn(
          'shrink-0 relative flex items-center justify-center w-12',
          hasSelection ? 'cursor-col-resize' : 'invisible'
        )}
        onMouseDown={hasSelection ? handleDividerMouseDown : undefined}
        onDoubleClick={
          hasSelection
            ? () => {
                setSplitRatio(DEFAULT_SPLIT_RATIO);
                saveSplitRatio(DEFAULT_SPLIT_RATIO);
              }
            : undefined
        }
      >
        <div className="absolute inset-y-0 left-1/2 w-0.5 -translate-x-1/2 bg-border" />
        <div className="relative z-10 flex items-center justify-center w-6 h-10 rounded-full border border-border bg-background text-muted-foreground hover:text-foreground transition-colors">
          <ChevronsLeftRight className="size-5" />
        </div>
      </div>

      {/* Right panel — always rendered for consistent layout */}
      <div className="min-w-0 overflow-y-auto scrollbar-none p-0.5 pl-4 pb-4" style={{ flex: 1 - splitRatio }}>
        {hasSelection && selectedQuestion && (
          <QuestionDetailPanel
            question={selectedQuestion}
            answer={selectedAnswer}
            number={questionNumbers.get(selectedQuestion.id) ?? 0}
          />
        )}
      </div>
    </div>
  );
}
