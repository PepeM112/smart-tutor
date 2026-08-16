'use client';

import { Loader2, Send } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

import {
  LongTextLength,
  QuestionGroupType,
  QuestionType,
  type LongTextContentStripped,
  type MultipleChoiceContentStripped,
  type QuestionReadStripped,
  type TestQuestionGroupReadStripped,
  type TestReadStripped,
} from '@/client';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';

import { LONG_TEXT_LENGTH_TIERS } from '../constants';
import { parseMcAnswer, toggleMcOption } from '../utils/question-content';

type ExamItem =
  | { kind: 'question'; question: QuestionReadStripped; order: number }
  | { kind: 'group'; group: TestQuestionGroupReadStripped; order: number };

type Props = {
  test: TestReadStripped;
  onSubmit: (answers: Record<string, string>) => void;
  isSubmitting: boolean;
};

export function ExamView({ test, onSubmit, isSubmitting }: Props) {
  const t = useTranslations('exam');
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const items = buildExamItems(test);

  const allQuestions = items.flatMap(item =>
    item.kind === 'question' ? [item.question] : (item.group.questions ?? [])
  );

  const handleTextChange = (questionId: string, value: string) => {
    setAnswers(prev => ({ ...prev, [questionId]: value }));
  };

  const handleCheckboxToggle = (questionId: string, index: number) => {
    setAnswers(prev => ({
      ...prev,
      [questionId]: toggleMcOption(prev[questionId] ?? '', index),
    }));
  };

  const handleSubmit = () => {
    onSubmit(answers);
  };

  let itemNumber = 0;

  return (
    <div className="space-y-6">
      {/* Test title */}
      <h2 className="text-2xl font-bold text-balance">{test.title}</h2>
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
            />
          );
        }

        const group = item.group;
        const questions = group.questions ?? [];
        const isVocabulary = group.type === QuestionGroupType.VOCABULARY;
        itemNumber++;
        const groupNumber = itemNumber;

        return (
          <div key={group.id ?? `group-${idx}`} className="rounded-lg border border-border p-6 space-y-4">
            <p className="font-medium">
              <span className="text-muted-foreground mr-1.5">{groupNumber}.</span>
              {group.points != null && group.points !== 1 && (
                <span className="text-xs text-muted-foreground mr-1.5">[{group.points} pts]</span>
              )}
              {group.title ?? t('question_group')}
            </p>

            {isVocabulary ? (
              <VocabularyTable questions={questions} answers={answers} onTextChange={handleTextChange} />
            ) : (
              <div className="space-y-3">
                {questions.map(q => (
                  <QuestionCard
                    key={q.id}
                    question={q}
                    answer={answers[q.id] ?? ''}
                    onTextChange={handleTextChange}
                    onCheckboxToggle={handleCheckboxToggle}
                    nested
                  />
                ))}
              </div>
            )}
          </div>
        );
      })}

      {/* Submit button */}
      <div className="flex justify-end pt-2">
        <Button
          size="lg"
          icon={isSubmitting ? Loader2 : Send}
          onClick={handleSubmit}
          disabled={isSubmitting || allQuestions.length === 0}
        >
          {isSubmitting ? t('submitting') : t('submit_exam')}
        </Button>
      </div>
    </div>
  );
}

function buildExamItems(test: TestReadStripped): ExamItem[] {
  const items: ExamItem[] = [];

  for (const q of test.questions ?? []) {
    items.push({ kind: 'question', question: q, order: q.order ?? 0 });
  }

  for (const g of test.questionGroups ?? []) {
    items.push({ kind: 'group', group: g, order: g.order ?? 0 });
  }

  return items.sort((a, b) => a.order - b.order);
}

// ---------------------------------------------------------------------------
// Vocabulary table — renders simple questions in a school-exam table layout
// ---------------------------------------------------------------------------

type VocabularyTableProps = {
  questions: QuestionReadStripped[];
  answers: Record<string, string>;
  onTextChange: (id: string, value: string) => void;
};

function VocabularyTable({ questions, answers, onTextChange }: VocabularyTableProps) {
  const t = useTranslations('exam');

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-12">#</TableHead>
          <TableHead>{t('column_prompt')}</TableHead>
          <TableHead>{t('column_answer')}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {questions.map((q, idx) => (
          <TableRow key={q.id}>
            <TableCell className="text-muted-foreground font-medium">{idx + 1}</TableCell>
            <TableCell className="font-medium">
              {q.prompt}
              {q.hint && <span className="text-xs text-muted-foreground italic ml-2">({q.hint})</span>}
            </TableCell>
            <TableCell>
              <Input
                placeholder={t('type_your_answer')}
                value={answers[q.id] ?? ''}
                onChange={e => onTextChange(q.id, e.target.value)}
                className="h-8"
              />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

// ---------------------------------------------------------------------------
// Question card (used for standalone MC questions and non-vocabulary groups)
// ---------------------------------------------------------------------------

type QuestionCardProps = {
  question: QuestionReadStripped;
  number?: number;
  pointsLabel?: number;
  answer: string;
  onTextChange: (id: string, value: string) => void;
  onCheckboxToggle: (id: string, index: number) => void;
  nested?: boolean;
};

function QuestionCard({
  question,
  number,
  pointsLabel,
  answer,
  onTextChange,
  onCheckboxToggle,
  nested,
}: QuestionCardProps) {
  const t = useTranslations('exam');
  const content = question.content;
  const isSimple = question.questionType === QuestionType.SIMPLE;
  const isMC = question.questionType === QuestionType.MULTIPLE_CHOICE;
  const isLongText = question.questionType === QuestionType.LONG_TEXT;
  // Fall back to MEDIUM tier when lengthLimit is missing or unrecognized
  // SAFETY: isLongText is true only when questionType === LONG_TEXT, guaranteeing LT content shape
  const longTextTier = isLongText
    ? (LONG_TEXT_LENGTH_TIERS.find(
        tier => tier.value === (content as LongTextContentStripped | undefined)?.lengthLimit
      ) ?? LONG_TEXT_LENGTH_TIERS[1])
    : null;

  const wrapper = (children: React.ReactNode) =>
    nested ? (
      <div className="rounded-lg border border-border p-4 space-y-3">{children}</div>
    ) : (
      <div className="rounded-lg border border-border p-6 space-y-4">{children}</div>
    );

  return wrapper(
    <>
      <p className="font-medium">
        {number != null && <span className="text-muted-foreground mr-1.5">{number}.</span>}
        {pointsLabel != null && <span className="text-xs text-muted-foreground mr-1.5">[{pointsLabel} pts]</span>}
        {question.prompt}
      </p>

      {question.hint && <p className="text-xs text-muted-foreground italic">{t('hint', { hint: question.hint })}</p>}

      {/* Simple text input */}
      {isSimple && (
        <Input
          placeholder={t('type_your_answer')}
          value={answer}
          onChange={e => onTextChange(question.id, e.target.value)}
        />
      )}

      {/* Multiple choice checkboxes */}
      {isMC && content && (
        <div className="space-y-2">
          {/* SAFETY: isMC is true only when questionType === MULTIPLE_CHOICE */}
          {((content as MultipleChoiceContentStripped).options ?? []).map((option, idx) => {
            const checked = parseMcAnswer(answer).includes(idx);
            return (
              <div key={idx} className="flex items-center gap-3">
                <Checkbox
                  id={`${question.id}-opt-${idx}`}
                  checked={checked}
                  onCheckedChange={() => onCheckboxToggle(question.id, idx)}
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
            placeholder={t('write_your_answer')}
            value={answer}
            onChange={e => {
              if (e.target.value.length <= longTextTier.limit) {
                onTextChange(question.id, e.target.value);
              }
            }}
            rows={
              longTextTier.value === LongTextLength.SHORT ? 4 : longTextTier.value === LongTextLength.MEDIUM ? 10 : 20
            }
          />
          <p className="text-xs text-muted-foreground text-right">
            {answer.length} / {longTextTier.limit}
          </p>
        </div>
      )}
    </>
  );
}
