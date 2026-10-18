'use client';

import { GraduationCap, PencilLine } from 'lucide-react';
import { useFormatter, useTranslations } from 'next-intl';
import { useState, type FormEvent } from 'react';

import { type AnswerRead } from '@/client';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

import { useResultReview } from '../context/resultReviewContext';
import { useAnswerOverride } from '../hooks/useAnswerOverride';
import { parseOverrideScore } from '../utils/answerOverride';

import { computeAiScore, computeQuestionScore, isOverridden, type ResultQuestion } from './resultDetailUtils';

type Props = {
  answer: AnswerRead;
  question: ResultQuestion;
};

/**
 * The teacher grade of one answer.
 * Student: "Graded by your teacher" with the teacher score, and the AI grade as second line.
 * Teacher: the AI grade, the teacher grade, and the controls to set or remove it.
 * It shows nothing to a student when the teacher did not grade the answer.
 */
export function AnswerGradePanel({ answer, question }: Props) {
  const { canOverride } = useResultReview();
  const overridden = isOverridden(answer);

  if (!canOverride && !overridden) return null;
  return canOverride ? (
    <TeacherGrade answer={answer} question={question} />
  ) : (
    <StudentGrade answer={answer} question={question} />
  );
}

function StudentGrade({ answer, question }: Props) {
  const t = useTranslations();
  const teacherScore = computeQuestionScore(answer, question);
  const aiScore = computeAiScore(answer, question);

  return (
    <div
      className="space-y-1 rounded-md border border-border bg-muted/40 px-3 py-2 text-sm"
      data-testid="teacher-grade"
    >
      <p className="flex items-center gap-1.5 font-medium text-foreground">
        <GraduationCap className="size-4 text-feedback-partial" aria-hidden />
        {t('history.graded_by_teacher')}
        {teacherScore && <span className="ml-auto tabular-nums">{teacherScore.label}</span>}
      </p>
      {aiScore && (
        <p className="flex items-center justify-between text-xs text-muted-foreground">
          {t('history.ai_grade')}
          <span className="tabular-nums">{aiScore.label}</span>
        </p>
      )}
    </div>
  );
}

function TeacherGrade({ answer, question }: Props) {
  const t = useTranslations();
  const format = useFormatter();
  const { resultId } = useResultReview();
  const { setOverride, isSettingOverride, clearOverride, isClearingOverride } = useAnswerOverride(resultId);
  const maxPoints = question.points ?? 1;
  const overridden = isOverridden(answer);
  const aiScore = computeAiScore(answer, question);
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const parsed = parseOverrideScore(draft, maxPoints);
  // Show an error only after the teacher typed something.
  const error =
    draft.trim() !== '' && !parsed.ok ? t(`history.override_input_${parsed.reason}`, { points: maxPoints }) : null;

  const startEditing = (): void => {
    setDraft(overridden ? String(answer.overrideScore) : '');
    setIsEditing(true);
  };

  const save = (event: FormEvent): void => {
    event.preventDefault();
    if (!parsed.ok) return;
    setOverride({ answerId: answer.id, score: parsed.score }, { onSuccess: () => setIsEditing(false) });
  };

  return (
    <div
      className="space-y-2 rounded-md border border-border bg-muted/40 px-3 py-2 text-sm"
      data-testid="teacher-grade"
    >
      <p className="flex items-center justify-between text-muted-foreground">
        {t('history.ai_grade')}
        <span className="tabular-nums">{aiScore ? aiScore.label : t('history.ai_grade_none')}</span>
      </p>

      {overridden && !isEditing && (
        <p className="flex items-center justify-between font-medium text-foreground">
          <span className="flex items-center gap-1.5">
            <PencilLine className="size-4 text-feedback-partial" aria-hidden />
            {t('history.teacher_grade')}
          </span>
          <span className="tabular-nums">{computeQuestionScore(answer, question)?.label}</span>
        </p>
      )}
      {overridden && !isEditing && answer.overriddenAt && (
        <p className="text-xs text-muted-foreground">
          {t('history.overridden_at', { date: format.dateTime(answer.overriddenAt, { dateStyle: 'short' }) })}
        </p>
      )}

      {isEditing ? (
        <form onSubmit={save} className="space-y-2">
          <Label htmlFor={`override-${answer.id}`}>{t('history.override_label', { points: maxPoints })}</Label>
          <div className="flex items-center gap-2">
            <Input
              id={`override-${answer.id}`}
              inputMode="decimal"
              autoFocus
              className="max-w-28"
              value={draft}
              aria-invalid={error !== null}
              onChange={e => setDraft(e.target.value)}
            />
            <Button type="submit" size="sm" loading={isSettingOverride} disabled={!parsed.ok}>
              {t('common.save')}
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setIsEditing(false)}>
              {t('common.cancel')}
            </Button>
          </div>
          {error && <p className="text-xs text-destructive">{error}</p>}
        </form>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" size="sm" variant="outline" icon={PencilLine} onClick={startEditing}>
            {overridden ? t('history.override_edit') : t('history.override_action')}
          </Button>
          {overridden && (
            <ConfirmDialog
              trigger={
                <Button type="button" size="sm" variant="ghost" loading={isClearingOverride}>
                  {t('history.override_remove')}
                </Button>
              }
              title={t('history.override_remove_title')}
              description={t('history.override_remove_description')}
              confirmLabel={t('history.override_remove')}
              onConfirm={() => clearOverride(answer.id)}
            />
          )}
        </div>
      )}
    </div>
  );
}
