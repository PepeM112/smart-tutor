'use client';

import { Loader2, Send } from 'lucide-react';
import { useState } from 'react';

import { AnswerStatus, type QuestionRead, QuestionType, type TestRead, type TestResultRead } from '@/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

type ExamItem =
  | { kind: 'question'; question: QuestionRead; order: number }
  | { kind: 'group'; groupType: string; questions: QuestionRead[]; order: number };

function buildExamItems(test: TestRead): ExamItem[] {
  const items: ExamItem[] = [];

  for (const q of test.questions ?? []) {
    items.push({ kind: 'question', question: q, order: q.order ?? 0 });
  }

  for (const g of (test as TestReadWithGroups).questionGroups ?? []) {
    items.push({
      kind: 'group',
      groupType: g.type?.toString() ?? 'GROUP',
      questions: g.questions ?? [],
      order: g.order ?? 0,
    });
  }

  return items.sort((a, b) => a.order - b.order);
}

/** Extended TestRead with question_groups — until codegen regenerates the type */
type TestReadWithGroups = TestRead & {
  questionGroups?: Array<{
    id: string;
    testId: string;
    type: number;
    order: number;
    questions: QuestionRead[];
  }>;
};

type Props = {
  test: TestRead;
  onSubmit: (answers: Record<string, string>) => void;
  isSubmitting: boolean;
  result: TestResultRead | null;
};

export function ExamView({ test, onSubmit, isSubmitting, result }: Props) {
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const items = buildExamItems(test);

  const allQuestions = items.flatMap(item =>
    item.kind === 'question' ? [item.question] : item.questions
  );

  const handleTextChange = (questionId: string, value: string) => {
    setAnswers(prev => ({ ...prev, [questionId]: value }));
  };

  const handleCheckboxToggle = (questionId: string, index: number) => {
    setAnswers(prev => {
      const current = prev[questionId] ?? '';
      const selected = current ? current.split(',').map(Number) : [];
      const updated = selected.includes(index)
        ? selected.filter(i => i !== index)
        : [...selected, index];
      return { ...prev, [questionId]: updated.sort((a, b) => a - b).join(',') };
    });
  };

  const handleSubmit = () => {
    onSubmit(answers);
  };

  const getAnswerStatus = (questionId: string): AnswerStatus | null => {
    if (!result) return null;
    const answer = result.answers.find(a => a.questionId === questionId);
    return answer ? answer.status : null;
  };

  const statusLabel = (s: AnswerStatus): string => {
    switch (s) {
      case AnswerStatus.CORRECT:
        return 'Correct';
      case AnswerStatus.PARTIAL:
        return 'Almost correct (typo)';
      case AnswerStatus.WRONG:
        return 'Wrong';
      default:
        return 'Pending';
    }
  };

  const statusColor = (s: AnswerStatus): string => {
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
  };

  let questionNumber = 0;

  return (
    <div className="space-y-4">
      {items.map((item, idx) => {
        if (item.kind === 'question') {
          questionNumber++;
          return (
            <QuestionCard
              key={item.question.id}
              question={item.question}
              number={questionNumber}
              answer={answers[item.question.id] ?? ''}
              onTextChange={handleTextChange}
              onCheckboxToggle={handleCheckboxToggle}
              status={getAnswerStatus(item.question.id)}
              statusLabel={statusLabel}
              statusColor={statusColor}
              disabled={!!result}
            />
          );
        }

        const groupQuestions = item.questions;
        return (
          <Card key={`group-${idx}`}>
            <CardContent className="space-y-4 pt-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/70">
                Group
              </p>
              {groupQuestions.map(q => {
                questionNumber++;
                return (
                  <QuestionCard
                    key={q.id}
                    question={q}
                    number={questionNumber}
                    answer={answers[q.id] ?? ''}
                    onTextChange={handleTextChange}
                    onCheckboxToggle={handleCheckboxToggle}
                    status={getAnswerStatus(q.id)}
                    statusLabel={statusLabel}
                    statusColor={statusColor}
                    disabled={!!result}
                    nested
                  />
                );
              })}
            </CardContent>
          </Card>
        );
      })}

      {/* Score banner */}
      {result && (
        <Card>
          <CardContent className="flex items-center justify-between py-4">
            <div>
              <p className="text-lg font-semibold">
                Score: {result.score.toFixed(1)}%
              </p>
              <p className="text-sm text-muted-foreground">
                {result.correctAnswers} of {result.totalQuestions} correct
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Submit button */}
      {!result && (
        <div className="flex justify-end pt-2">
          <Button
            size="lg"
            icon={isSubmitting ? Loader2 : Send}
            onClick={handleSubmit}
            disabled={isSubmitting || allQuestions.length === 0}
          >
            {isSubmitting ? 'Submitting...' : 'Submit Exam'}
          </Button>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Question card (used for both standalone and grouped)
// ---------------------------------------------------------------------------

type QuestionCardProps = {
  question: QuestionRead;
  number: number;
  answer: string;
  onTextChange: (id: string, value: string) => void;
  onCheckboxToggle: (id: string, index: number) => void;
  status: AnswerStatus | null;
  statusLabel: (s: AnswerStatus) => string;
  statusColor: (s: AnswerStatus) => string;
  disabled: boolean;
  nested?: boolean;
};

function QuestionCard({
  question,
  number,
  answer,
  onTextChange,
  onCheckboxToggle,
  status,
  statusLabel,
  statusColor,
  disabled,
  nested,
}: QuestionCardProps) {
  const content = question.content as Record<string, unknown> | undefined;
  const isSimple = question.questionType === QuestionType.SIMPLE;
  const isMC = question.questionType === QuestionType.MULTIPLE_CHOICE;

  const wrapper = (children: React.ReactNode) =>
    nested ? (
      <div className="rounded-lg border border-border p-4 space-y-3">{children}</div>
    ) : (
      <Card>
        <CardContent className="space-y-3 pt-4">{children}</CardContent>
      </Card>
    );

  return wrapper(
    <>
      <div className="flex items-start justify-between gap-2">
        <p className="font-medium">
          <span className="text-muted-foreground mr-1.5">{number}.</span>
          {question.prompt}
        </p>
        {status !== null && (
          <span className={cn('text-sm font-medium whitespace-nowrap', statusColor(status))}>
            {statusLabel(status)}
          </span>
        )}
      </div>

      {question.hint && (
        <p className="text-xs text-muted-foreground italic">Hint: {question.hint}</p>
      )}

      {/* Simple text input */}
      {isSimple && (
        <Input
          placeholder="Type your answer..."
          value={answer}
          onChange={e => onTextChange(question.id, e.target.value)}
          disabled={disabled}
        />
      )}

      {/* Multiple choice checkboxes */}
      {isMC && content && (
        <div className="space-y-2">
          {((content.options ?? []) as string[]).map((option, idx) => {
            const selected = answer ? answer.split(',').map(Number) : [];
            const checked = selected.includes(idx);
            return (
              <div key={idx} className="flex items-center gap-3">
                <Checkbox
                  id={`${question.id}-opt-${idx}`}
                  checked={checked}
                  onCheckedChange={() => onCheckboxToggle(question.id, idx)}
                  disabled={disabled}
                />
                <Label
                  htmlFor={`${question.id}-opt-${idx}`}
                  className="text-sm cursor-pointer"
                >
                  {option}
                </Label>
              </div>
            );
          })}
        </div>
      )}

      {/* Show explanation after submission if available */}
      {status !== null && question.explanation && (
        <p className="text-xs text-muted-foreground border-t border-border pt-2">
          {question.explanation}
        </p>
      )}
    </>
  );
}
