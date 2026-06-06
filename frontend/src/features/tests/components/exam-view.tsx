'use client';

import { Loader2, Send } from 'lucide-react';
import { useState } from 'react';

import {
  QuestionGroupType,
  QuestionType,
  type AnswerStatus,
  type QuestionRead,
  type TestQuestionGroupRead,
  type TestRead,
  type TestResultRead,
} from '@/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { feedbackTextColor, statusLabel } from '@/features/review/helpers';
import { cn } from '@/lib/utils';

import { LONG_TEXT_LENGTH_TIERS } from '../constants';

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
    item.kind === 'question' ? [item.question] : (item.group.questions ?? [])
  );

  const handleTextChange = (questionId: string, value: string) => {
    setAnswers(prev => ({ ...prev, [questionId]: value }));
  };

  const handleCheckboxToggle = (questionId: string, index: number) => {
    setAnswers(prev => {
      const current = prev[questionId] ?? '';
      const selected = current ? current.split(',').map(Number) : [];
      const updated = selected.includes(index) ? selected.filter(i => i !== index) : [...selected, index];
      return { ...prev, [questionId]: updated.sort((a, b) => a - b).join(',') };
    });
  };

  const handleSubmit = () => {
    onSubmit(answers);
  };

  const getAnswerStatus = (questionId: string): AnswerStatus | null => {
    if (!result) return null;
    const answer = result.answers?.find(a => a.questionId === questionId);
    return answer ? answer.status : null;
  };

  const statusColor = feedbackTextColor;

  let itemNumber = 0;

  return (
    <div className="space-y-6">
      {/* Test title */}
      <h2 className="text-2xl font-bold">{test.title}</h2>
      {test.description && <p className="text-sm text-muted-foreground -mt-4">{test.description}</p>}

      {items.map((item, idx) => {
        if (item.kind === 'question') {
          itemNumber++;
          return (
            <QuestionCard
              key={item.question.id}
              question={item.question}
              number={itemNumber}
              pointsLabel={
                item.question.points != null && item.question.points !== 1 ? item.question.points : undefined
              }
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

        const group = item.group;
        const questions = group.questions ?? [];
        const isVocabulary = group.type === QuestionGroupType.VOCABULARY;
        itemNumber++;
        const groupNumber = itemNumber;

        return (
          <Card key={group.id ?? `group-${idx}`} className="p-6">
            <CardContent className="space-y-4 p-0">
              <p className="font-medium">
                <span className="text-muted-foreground mr-1.5">{groupNumber}.</span>
                {group.points != null && group.points !== 1 && (
                  <span className="text-xs text-muted-foreground mr-1.5">[{group.points} pts]</span>
                )}
                {group.title ?? 'Question Group'}
              </p>

              {isVocabulary ? (
                <VocabularyTable
                  questions={questions}
                  answers={answers}
                  onTextChange={handleTextChange}
                  getAnswerStatus={getAnswerStatus}
                  statusLabel={statusLabel}
                  statusColor={statusColor}
                  disabled={!!result}
                />
              ) : (
                <div className="space-y-3">
                  {questions.map(q => (
                    <QuestionCard
                      key={q.id}
                      question={q}
                      answer={answers[q.id] ?? ''}
                      onTextChange={handleTextChange}
                      onCheckboxToggle={handleCheckboxToggle}
                      status={getAnswerStatus(q.id)}
                      statusLabel={statusLabel}
                      statusColor={statusColor}
                      disabled={!!result}
                      nested
                    />
                  ))}
                </div>
              )}
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
                Score: {(result.score ?? 0).toFixed(1)}%
                {result.totalPoints != null && result.totalPoints > 0 && (
                  <span className="text-base font-normal text-muted-foreground ml-2">
                    {result.earnedPoints} / {result.totalPoints} pts
                  </span>
                )}
              </p>
              <p className="text-sm text-muted-foreground">
                {result.correctAnswers} of {result.totalQuestions - (result.pendingAnswers ?? 0)} correct
              </p>
              {result.pendingAnswers != null && result.pendingAnswers > 0 && (
                <p className="text-sm text-muted-foreground">
                  {result.pendingAnswers} question{result.pendingAnswers === 1 ? '' : 's'} pending AI review
                </p>
              )}
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
// Vocabulary table — renders simple questions in a school-exam table layout
// ---------------------------------------------------------------------------

type VocabularyTableProps = {
  questions: QuestionRead[];
  answers: Record<string, string>;
  onTextChange: (id: string, value: string) => void;
  getAnswerStatus: (id: string) => AnswerStatus | null;
  statusLabel: (s: AnswerStatus) => string;
  statusColor: (s: AnswerStatus) => string;
  disabled: boolean;
};

function VocabularyTable({
  questions,
  answers,
  onTextChange,
  getAnswerStatus,
  statusLabel,
  statusColor,
  disabled,
}: VocabularyTableProps) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-12">#</TableHead>
          <TableHead>Prompt</TableHead>
          <TableHead>Answer</TableHead>
          <TableHead className="w-32 text-right">Result</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {questions.map((q, idx) => {
          const status = getAnswerStatus(q.id);
          return (
            <TableRow key={q.id}>
              <TableCell className="text-muted-foreground font-medium">{idx + 1}</TableCell>
              <TableCell className="font-medium">
                {q.prompt}
                {q.hint && <span className="text-xs text-muted-foreground italic ml-2">({q.hint})</span>}
              </TableCell>
              <TableCell>
                <Input
                  placeholder="Type your answer..."
                  value={answers[q.id] ?? ''}
                  onChange={e => onTextChange(q.id, e.target.value)}
                  disabled={disabled}
                  className="h-8"
                />
              </TableCell>
              <TableCell className="text-right">
                {status !== null && (
                  <span className={cn('text-sm font-medium', statusColor(status))}>{statusLabel(status)}</span>
                )}
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}

// ---------------------------------------------------------------------------
// Question card (used for standalone MC questions and non-vocabulary groups)
// ---------------------------------------------------------------------------

type QuestionCardProps = {
  question: QuestionRead;
  number?: number;
  pointsLabel?: number;
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
  pointsLabel,
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
  const isLongText = question.questionType === QuestionType.LONG_TEXT;
  const longTextTier = isLongText
    ? (LONG_TEXT_LENGTH_TIERS.find(t => t.value === (content?.length_limit as number)) ?? LONG_TEXT_LENGTH_TIERS[1])
    : null;

  const wrapper = (children: React.ReactNode) =>
    nested ? (
      <div className="rounded-lg border border-border p-4 space-y-3">{children}</div>
    ) : (
      <Card className="p-6">
        <CardContent className="space-y-4 p-0">{children}</CardContent>
      </Card>
    );

  return wrapper(
    <>
      <div className="flex items-start justify-between gap-2">
        <p className="font-medium">
          {number != null && <span className="text-muted-foreground mr-1.5">{number}.</span>}
          {pointsLabel != null && <span className="text-xs text-muted-foreground mr-1.5">[{pointsLabel} pts]</span>}
          {question.prompt}
        </p>
        {status !== null && (
          <span className={cn('text-sm font-medium whitespace-nowrap', statusColor(status))}>
            {statusLabel(status)}
          </span>
        )}
      </div>

      {question.hint && <p className="text-xs text-muted-foreground italic">Hint: {question.hint}</p>}

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
                <Label htmlFor={`${question.id}-opt-${idx}`} className="text-sm cursor-pointer">
                  {option}
                </Label>
              </div>
            );
          })}
        </div>
      )}

      {/* Long text textarea */}
      {isLongText && longTextTier && (
        <div className="space-y-1">
          <Textarea
            placeholder="Write your answer..."
            value={answer}
            onChange={e => {
              if (e.target.value.length <= longTextTier.limit) {
                onTextChange(question.id, e.target.value);
              }
            }}
            disabled={disabled}
            rows={longTextTier.value === 1 ? 4 : longTextTier.value === 2 ? 10 : 20}
          />
          <p className="text-xs text-muted-foreground text-right">
            {answer.length} / {longTextTier.limit}
          </p>
        </div>
      )}

      {/* Show explanation after submission if available */}
      {status !== null && question.explanation && (
        <p className="text-xs text-muted-foreground border-t border-border pt-2">{question.explanation}</p>
      )}
    </>
  );
}
