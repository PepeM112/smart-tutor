'use client';

import { useTranslations } from 'next-intl';
import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';

import {
  LongTextLength,
  QuestionGroupType,
  QuestionType,
  type QuestionReadStripped,
  type TestQuestionGroupReadStripped,
  type TestReadStripped,
} from '@/client';
import { OutlineColumn } from '@/components/shared/OutlineColumn';
import { RichText } from '@/components/shared/RichText';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { usePageActions } from '@/hooks/usePageActions';
import { usePageSubtitle } from '@/hooks/usePageSubtitle';
import { shouldToggleOnRowClick } from '@/lib/optionRowClick';
import { cn } from '@/lib/utils';

import { LONG_TEXT_LENGTH_TIERS, QUESTION_TYPE_LABEL_KEYS } from '../constants';
import { useCountdown } from '../hooks/useCountdown';
import { useScrollspy } from '../hooks/useScrollspy';
import { buildExamEntries, buildExamItems, examAnchorId, isEntryAnswered, type ExamItem } from '../utils/examProgress';
import { groupMaxPoints, questionPoints } from '../utils/points';
import { parseMcAnswer, toggleMcOption } from '../utils/questionContent';

import { CountdownPill } from './CountdownPill';
import { ExamOutline } from './ExamOutline';

interface ExamViewProps {
  test: TestReadStripped;
  onSubmit: (answers: Record<string, string>) => void;
  isSubmitting: boolean;
  /** Answers to start with, for example the ones saved before a reload. Read once. */
  initialAnswers?: Record<string, string>;
  /** Runs with all answers after each change, for example to save them. */
  onAnswersChange?: (answers: Record<string, string>) => void;
  /** With a deadline: a countdown shows, and the exam submits itself at 0. */
  deadlineAt?: Date | null;
}

type AnswerHandlers = {
  onTextChange: (id: string, value: string) => void;
  onCheckboxToggle: (id: string, index: number) => void;
};

export function ExamView({ test, onSubmit, isSubmitting, initialAnswers, onAnswersChange, deadlineAt }: ExamViewProps) {
  const t = useTranslations();
  const [answers, setAnswers] = useState<Record<string, string>>(initialAnswers ?? {});
  const items = useMemo(() => buildExamItems(test), [test]);
  const entries = useMemo(() => buildExamEntries(items, answers, t('exam.question_group')), [items, answers, t]);
  const anchorIds = useMemo(() => items.map(examAnchorId), [items]);
  const hasQuestions = entries.some(entry => entry.totalCount > 0);

  // The latest values for the timer, which must not restart on each keystroke.
  const latest = useRef({ answers, onSubmit, onAnswersChange });
  useEffect(() => {
    latest.current = { answers, onSubmit, onAnswersChange };
  });

  const updateAnswers = (update: (prev: Record<string, string>) => Record<string, string>) => {
    const next = update(latest.current.answers);
    // Set at once: two changes in one tick must both count.
    latest.current = { ...latest.current, answers: next };
    setAnswers(next);
    onAnswersChange?.(next);
  };

  const handleTextChange = (questionId: string, value: string) => {
    updateAnswers(prev => ({ ...prev, [questionId]: value }));
  };

  const handleCheckboxToggle = (questionId: string, index: number) => {
    updateAnswers(prev => ({
      ...prev,
      [questionId]: toggleMcOption(prev[questionId] ?? '', index),
    }));
  };

  // One guard for both submit paths (the button and the timeout): a timeout during a slow manual
  // submit must not send a second request. A failed submit (`isSubmitting` back to false) opens it again.
  const hasSubmitted = useRef(false);
  useEffect(() => {
    if (!isSubmitting) hasSubmitted.current = false;
  }, [isSubmitting]);

  const submitOnce = useCallback(() => {
    if (hasSubmitted.current) return;
    hasSubmitted.current = true;
    latest.current.onSubmit(latest.current.answers);
  }, []);

  const remainingSeconds = useCountdown(deadlineAt, submitOnce);
  const isSubmitDisabled = isSubmitting || !hasQuestions;

  // The header shows the timer and the one filled button. It renders them twice (desktop and phone).
  const headerActions = useMemo(
    () => (
      <>
        {remainingSeconds !== null && <CountdownPill remainingSeconds={remainingSeconds} />}
        <SubmitButton isHeader isSubmitting={isSubmitting} isDisabled={isSubmitDisabled} onSubmit={submitOnce} />
      </>
    ),
    [remainingSeconds, isSubmitting, isSubmitDisabled, submitOnce]
  );
  usePageActions(headerActions);

  const answeredCount = entries.filter(isEntryAnswered).length;
  usePageSubtitle(t('exam.answered_count', { answered: answeredCount, total: entries.length }));

  const rootRef = useRef<HTMLDivElement>(null);
  const activeAnchorId = useScrollspy(rootRef, anchorIds);

  const handleJump = (anchorId: string) => {
    document.getElementById(anchorId)?.scrollIntoView({ block: 'start' });
  };

  return (
    <OutlineColumn
      storageKey="exam-outline-width"
      label={t('outline.contents')}
      outline={<ExamOutline entries={entries} activeAnchorId={activeAnchorId} onJump={handleJump} />}
    >
      <div ref={rootRef} className="mx-auto w-full max-w-3xl divide-y divide-hairline">
        {test.description && <p className="pb-8 text-muted-foreground">{test.description}</p>}

        {items.map((item, index) => (
          <ExamSection
            key={examAnchorId(item, index)}
            item={item}
            anchorId={examAnchorId(item, index)}
            number={index + 1}
            answers={answers}
            onTextChange={handleTextChange}
            onCheckboxToggle={handleCheckboxToggle}
          />
        ))}

        <div className="flex justify-end pt-8">
          <SubmitButton isSubmitting={isSubmitting} isDisabled={isSubmitDisabled} onSubmit={submitOnce} />
        </div>
      </div>
    </OutlineColumn>
  );
}

interface SubmitButtonProps {
  isSubmitting: boolean;
  isDisabled: boolean;
  onSubmit: () => void;
  /** The filled button of the header. The copy at the end of the page is quiet. */
  isHeader?: boolean;
}

function SubmitButton({ isSubmitting, isDisabled, onSubmit, isHeader = false }: SubmitButtonProps) {
  const t = useTranslations();
  const label = isSubmitting ? t('exam.submitting') : t('exam.submit_exam');

  return (
    <Button
      variant={isHeader ? 'default' : 'outline'}
      loading={isSubmitting}
      disabled={isDisabled}
      onClick={onSubmit}
      aria-label={isHeader ? label : undefined}
    >
      {isHeader ? (
        <>
          <span className="max-sm:hidden">{label}</span>
          <span className="sm:hidden" aria-hidden>
            {isSubmitting ? t('exam.submitting') : t('exam.submit_short')}
          </span>
        </>
      ) : (
        label
      )}
    </Button>
  );
}

interface ExamSectionProps extends AnswerHandlers {
  item: ExamItem;
  anchorId: string;
  number: number;
  answers: Record<string, string>;
}

/** One question or group: the meta line, the prompt as a title, then the inputs. */
function ExamSection({ item, anchorId, number, answers, onTextChange, onCheckboxToggle }: ExamSectionProps) {
  const t = useTranslations();
  const titleId = `${anchorId}-title`;

  if (item.kind === 'question') {
    const { question } = item;
    const meta = t('exam.question_meta', {
      number,
      type: t(QUESTION_TYPE_LABEL_KEYS[question.questionType]),
      points: questionPoints(question),
    });
    return (
      <SectionFrame anchorId={anchorId} titleId={titleId} meta={meta} title={<RichText text={question.prompt} />}>
        <QuestionBody
          question={question}
          answer={answers[question.id] ?? ''}
          onTextChange={onTextChange}
          onCheckboxToggle={onCheckboxToggle}
        />
      </SectionFrame>
    );
  }

  const meta = t('exam.question_meta', {
    number,
    type: t('exam.group_label'),
    points: groupMaxPoints(item.group),
  });
  return (
    <SectionFrame
      anchorId={anchorId}
      titleId={titleId}
      meta={meta}
      title={item.group.title ? <RichText text={item.group.title} /> : t('exam.question_group')}
    >
      <GroupBody group={item.group} answers={answers} onTextChange={onTextChange} onCheckboxToggle={onCheckboxToggle} />
    </SectionFrame>
  );
}

interface SectionFrameProps {
  anchorId: string;
  titleId: string;
  meta: string;
  title: ReactNode;
  children: ReactNode;
}

function SectionFrame({ anchorId, titleId, meta, title, children }: SectionFrameProps) {
  return (
    <section id={anchorId} aria-labelledby={titleId} className="scroll-mt-4 space-y-4 py-8 first:pt-0">
      <div className="space-y-2">
        <p className="text-xs font-semibold tracking-[0.08em] text-muted-foreground uppercase">{meta}</p>
        {/* A div, not an h2: the title can hold block Markdown (code, lists). */}
        <div id={titleId} role="heading" aria-level={2} className="font-serif text-xl font-medium text-balance">
          {title}
        </div>
      </div>
      {children}
    </section>
  );
}

interface GroupBodyProps extends AnswerHandlers {
  group: TestQuestionGroupReadStripped;
  answers: Record<string, string>;
}

function GroupBody({ group, answers, onTextChange, onCheckboxToggle }: GroupBodyProps) {
  const questions = group.questions ?? [];

  if (group.type === QuestionGroupType.VOCABULARY) {
    return <VocabularyTable questions={questions} answers={answers} onTextChange={onTextChange} />;
  }

  return (
    <div className="space-y-4">
      {questions.map(question => (
        <div key={question.id} className="space-y-3 rounded-lg bg-muted/40 p-4">
          <RichText text={question.prompt} className="font-medium" />
          <QuestionBody
            question={question}
            answer={answers[question.id] ?? ''}
            onTextChange={onTextChange}
            onCheckboxToggle={onCheckboxToggle}
          />
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Vocabulary table — renders simple questions in a school-exam table layout
// ---------------------------------------------------------------------------

interface VocabularyTableProps {
  questions: QuestionReadStripped[];
  answers: Record<string, string>;
  onTextChange: (id: string, value: string) => void;
}

function VocabularyTable({ questions, answers, onTextChange }: VocabularyTableProps) {
  const t = useTranslations();

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-12">#</TableHead>
          <TableHead>{t('exam.column_prompt')}</TableHead>
          <TableHead>{t('exam.column_answer')}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {questions.map((q, idx) => (
          <TableRow key={q.id}>
            <TableCell className="text-muted-foreground font-medium">{idx + 1}</TableCell>
            <TableCell className="font-medium">
              <RichText text={q.prompt} inline />
              {q.hint && <span className="text-xs text-muted-foreground italic ml-2">({q.hint})</span>}
            </TableCell>
            <TableCell>
              <Input
                placeholder={t('exam.type_your_answer')}
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
// Question body: the hint and the input of one question (standalone, or inside a group)
// ---------------------------------------------------------------------------

interface QuestionBodyProps extends AnswerHandlers {
  question: QuestionReadStripped;
  answer: string;
}

function QuestionBody({ question, answer, onTextChange, onCheckboxToggle }: QuestionBodyProps) {
  const t = useTranslations();
  const content = question.content;
  const isSimple = question.questionType === QuestionType.SIMPLE;
  const isMC = question.questionType === QuestionType.MULTIPLE_CHOICE;
  const isLongText = question.questionType === QuestionType.LONG_TEXT;
  // Fall back to MEDIUM tier when lengthLimit is missing or unrecognized
  const lengthLimit = isLongText && content && 'lengthLimit' in content ? content.lengthLimit : undefined;
  const mcOptions = isMC && content && 'options' in content ? content.options : undefined;
  const longTextTier = isLongText
    ? (LONG_TEXT_LENGTH_TIERS.find(tier => tier.value === lengthLimit) ?? LONG_TEXT_LENGTH_TIERS[1])
    : null;

  return (
    <>
      {question.hint && (
        <p className="text-sm text-muted-foreground italic">{t('exam.hint', { hint: question.hint })}</p>
      )}

      {/* Simple text input */}
      {isSimple && (
        <Input
          placeholder={t('exam.type_your_answer')}
          value={answer}
          onChange={e => onTextChange(question.id, e.target.value)}
        />
      )}

      {/* Multiple choice checkboxes */}
      {mcOptions && (
        <div className="space-y-2">
          {mcOptions.map((option, idx) => {
            const checked = parseMcAnswer(answer).includes(idx);
            return (
              <div
                key={idx}
                className={cn(
                  'flex cursor-pointer items-center gap-3 rounded-lg border border-border px-3 py-2.5 text-sm transition-colors hover:bg-muted/60',
                  checked && 'bg-muted'
                )}
                onClick={e => shouldToggleOnRowClick(e) && onCheckboxToggle(question.id, idx)}
              >
                <Checkbox
                  id={`${question.id}-opt-${idx}`}
                  aria-labelledby={`${question.id}-opt-${idx}-label`}
                  checked={checked}
                  onCheckedChange={() => onCheckboxToggle(question.id, idx)}
                />
                <div id={`${question.id}-opt-${idx}-label`} className="min-w-0">
                  <RichText text={option} />
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Long text textarea */}
      {isLongText && longTextTier && (
        <div className="space-y-1">
          <Textarea
            placeholder={t('exam.write_your_answer')}
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
