'use client';

import { Check, Clock, Loader2, RotateCcw, Scale, Send, ShieldCheck, X } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { AnswerStatus, type AnswerRead, type RubricResultItem } from '@/client';
import { RichText } from '@/components/RichText';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useAiAvailable } from '@/hooks/useAiAvailable';
import { cn } from '@/lib/utils';

import { useResultReview } from '../context/resultReviewContext';
import { useChallengeMode } from '../hooks/useChallengeMode';

import { computeAiScore, effectiveMet, isOverridden, type ResultQuestion } from './resultDetailUtils';

interface LongTextReviewProps {
  question: ResultQuestion;
  answer?: AnswerRead;
}

export function LongTextReview({ question, answer }: LongTextReviewProps) {
  const t = useTranslations();
  const { canOverride } = useResultReview();

  if (!answer) return null;

  const hasTeacherGrade = isOverridden(answer);
  // With a teacher grade (or for a teacher) the grade panel already shows the AI grade. A failed grading has none.
  const aiScore =
    canOverride || hasTeacherGrade || answer.status === AnswerStatus.FAILED ? null : computeAiScore(answer, question);

  return (
    <div className="space-y-6">
      <div className="space-y-1.5">
        <p className="text-sm text-muted-foreground">{t('challenge.your_answer')}</p>
        <p className="whitespace-pre-wrap rounded-lg bg-muted p-3 text-sm">{answer.userAnswer}</p>
      </div>
      {aiScore && (
        <p className="flex items-baseline justify-between gap-2 text-sm">
          <span className="font-medium">{t('history.ai_grade')}</span>
          <span className="text-muted-foreground tabular-nums">{aiScore.label}</span>
        </p>
      )}
      <GradingBody answer={answer} hasTeacherGrade={hasTeacherGrade} />
    </div>
  );
}

interface GradingBodyProps {
  answer: AnswerRead;
  hasTeacherGrade: boolean;
}

/** A teacher grade replaces the AI state, so a failed or pending AI grading shows only without one. */
function GradingBody({ answer, hasTeacherGrade }: GradingBodyProps) {
  const t = useTranslations();

  if (!hasTeacherGrade && answer.status === AnswerStatus.FAILED) {
    return <p className="text-sm text-destructive">{t('challenge.grading_failed')}</p>;
  }
  if (!hasTeacherGrade && answer.status === AnswerStatus.PENDING) {
    return (
      <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
        <Clock aria-hidden className="size-4 shrink-0" />
        {t('history.pending_detail')}
      </p>
    );
  }
  if (!answer.rubricResult?.length) return null;
  return <RubricBreakdown items={answer.rubricResult} answerId={answer.id} isOverridden={hasTeacherGrade} />;
}

function RubricBreakdown({
  items,
  answerId,
  isOverridden: hasTeacherGrade,
}: {
  items: RubricResultItem[];
  answerId: string;
  isOverridden: boolean;
}) {
  const t = useTranslations();
  const { canOverride, isSpaceResult } = useResultReview();
  const hasOwnKey = useAiAvailable();
  // In a space the Class key may pay. If no key works, the backend refuses and the error shows.
  const aiAvailable = hasOwnKey || isSpaceResult;
  const {
    isChallengeMode,
    enterChallengeMode,
    exitChallengeMode,
    selectedCriteria,
    toggleCriterion,
    updateArgument,
    submitChallenge,
    isSubmitting,
    canChallenge,
    canSubmit,
    hasPendingChallenge,
  } = useChallengeMode(items, answerId);

  // A teacher graded the answer: it cannot be challenged. A teacher looking at it does not challenge.
  const canStartChallenge = canChallenge && !hasTeacherGrade;
  const effectiveMetCount = items.filter(effectiveMet).length;
  const challengeHint = getChallengeHint({ aiAvailable, hasTeacherGrade, canChallenge, t });

  return (
    <div className="space-y-3">
      <p className="text-sm font-medium text-muted-foreground">
        {t('challenge.rubric', { met: `${effectiveMetCount}/${items.length}` })}
      </p>
      <ul className="divide-y divide-hairline overflow-hidden rounded-lg border border-border">
        {items.map((item, idx) => (
          <CriterionCard
            key={idx}
            item={item}
            isChallengeMode={isChallengeMode}
            isSelected={selectedCriteria.has(idx)}
            argument={selectedCriteria.get(idx) ?? ''}
            onToggle={() => toggleCriterion(idx)}
            onArgumentChange={value => updateArgument(idx, value)}
          />
        ))}
      </ul>
      {isChallengeMode ? (
        <div className="flex items-center gap-2 animate-in fade-in-0 duration-200">
          <Button type="button" variant="ghost" onClick={exitChallengeMode}>
            {t('common.cancel')}
          </Button>
          <Button
            type="button"
            variant="outline"
            icon={Send}
            loading={isSubmitting}
            disabled={!canSubmit}
            tooltip={canSubmit ? undefined : t('challenge.select_criteria_first')}
            onClick={() => submitChallenge()}
          >
            {t('challenge.submit_challenge', { count: selectedCriteria.size })}
          </Button>
        </div>
      ) : (
        // A teacher looking at the answer does not challenge it. A pending challenge is already in progress.
        !canOverride &&
        !hasPendingChallenge && (
          <Button
            type="button"
            variant="outline"
            icon={Scale}
            disabled={!canStartChallenge || !aiAvailable}
            tooltip={challengeHint}
            onClick={enterChallengeMode}
          >
            {t('challenge.challenge_grade')}
          </Button>
        )
      )}
    </div>
  );
}

interface ChallengeHintInput {
  aiAvailable: boolean;
  hasTeacherGrade: boolean;
  canChallenge: boolean;
  t: ReturnType<typeof useTranslations>;
}

/** Why the challenge button is disabled. `undefined` means it is not. */
function getChallengeHint({ aiAvailable, hasTeacherGrade, canChallenge, t }: ChallengeHintInput): string | undefined {
  if (!aiAvailable) return t('settings.ai_not_configured');
  if (hasTeacherGrade) return t('challenge.graded_by_teacher');
  if (!canChallenge) return t('challenge.all_criteria_reviewed');
  return undefined;
}

const CRITERION_ROW_CLASS = 'flex w-full items-start gap-3 px-3 py-2.5 text-left';

function CriterionCard({
  item,
  isChallengeMode,
  isSelected,
  argument,
  onToggle,
  onArgumentChange,
}: {
  item: RubricResultItem;
  isChallengeMode: boolean;
  isSelected: boolean;
  argument: string;
  onToggle: () => void;
  onArgumentChange: (value: string) => void;
}) {
  const t = useTranslations();
  const cr = item.challengeResult;
  const isPending = cr != null && cr.met == null;
  const isOverturned = cr != null && cr.met === true;
  const isUpheld = cr != null && cr.met === false;
  const isChallenged = cr != null;

  const isMet = effectiveMet(item);

  const isChallengeable = isChallengeMode && !item.met && !isChallenged;
  const isDimmed = isChallengeMode && (item.met || isChallenged);

  const rowContent = (
    <>
      <span className="block min-w-0 flex-1 space-y-0.5">
        <span className="block text-sm">
          <RichText text={item.point} inline />
          <span className="ml-1.5 text-muted-foreground tabular-nums">({item.weight.toFixed(2)})</span>
        </span>
        {item.reason && <RichText text={item.reason} inline className="block text-xs text-muted-foreground italic" />}
        {(isOverturned || isUpheld) && cr?.reason && (
          <span className="mt-1 flex items-start gap-1.5 text-xs text-feedback-partial italic">
            <Scale className="mt-0.5 size-3 shrink-0" aria-hidden />
            <RichText text={cr.reason} inline />
          </span>
        )}
      </span>
      <span className="flex shrink-0 flex-col items-end gap-1">
        <span
          className={cn(
            'inline-flex items-center gap-1 text-xs font-medium',
            isMet ? 'text-feedback-correct' : 'text-destructive'
          )}
        >
          <CriterionIcon
            isMet={isMet}
            isPending={isPending}
            isSelected={isSelected}
            isChallengeMode={isChallengeMode}
            isChallengeable={isChallengeable}
          />
          {isMet ? t('challenge.criterion_met') : t('challenge.criterion_not_met')}
        </span>
        {isOverturned && <ChallengeVerdict variant="overturned" />}
        {isPending && <ChallengeVerdict variant="pending" />}
      </span>
    </>
  );

  return (
    <li
      className={cn(
        'transition-colors',
        isSelected && 'bg-feedback-partial-bg ring-1 ring-inset ring-feedback-partial',
        isPending && 'animate-pulse',
        isDimmed && 'opacity-40'
      )}
    >
      {/* A button, so the row works with the keyboard and a screen reader. Its content is phrasing only. */}
      {isChallengeable ? (
        <button
          type="button"
          aria-pressed={isSelected}
          onClick={onToggle}
          className={cn(
            CRITERION_ROW_CLASS,
            'cursor-pointer outline-none hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/50'
          )}
        >
          {rowContent}
        </button>
      ) : (
        <div className={CRITERION_ROW_CLASS}>{rowContent}</div>
      )}
      {isSelected && (
        <div className="px-3 pb-2.5">
          <Textarea
            placeholder={t('challenge.explain_criterion')}
            value={argument}
            onChange={e => onArgumentChange(e.target.value)}
            rows={2}
            maxLength={500}
            autoFocus
            className="bg-background text-sm"
          />
          <p className="mt-0.5 text-right text-[0.65rem] text-muted-foreground/60 tabular-nums">
            {argument.length}/500
          </p>
        </div>
      )}
    </li>
  );
}

function CriterionIcon({
  isMet,
  isPending,
  isSelected,
  isChallengeMode,
  isChallengeable,
}: {
  isMet: boolean;
  isPending: boolean;
  isSelected: boolean;
  isChallengeMode: boolean;
  isChallengeable: boolean;
}) {
  if (isPending) {
    return <Loader2 aria-hidden className="size-3.5 shrink-0 animate-spin text-feedback-partial" />;
  }
  if (isSelected) {
    return <RotateCcw aria-hidden className="size-3.5 shrink-0 text-feedback-partial" />;
  }
  if (isChallengeMode && isChallengeable) {
    return <Scale aria-hidden className="size-3.5 shrink-0 text-feedback-partial" />;
  }
  if (isMet) {
    return <Check aria-hidden className="size-3.5 shrink-0" />;
  }
  return <X aria-hidden className="size-3.5 shrink-0" />;
}

function ChallengeVerdict({ variant }: { variant: 'overturned' | 'pending' }) {
  const t = useTranslations();

  if (variant === 'overturned') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-feedback-correct-bg px-2 py-0.5 text-[0.65rem] font-medium text-feedback-correct ring-1 ring-feedback-correct-border shrink-0">
        <ShieldCheck className="size-3" />
        {t('challenge.overturned')}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-feedback-partial-bg px-2 py-0.5 text-[0.65rem] font-medium text-feedback-partial ring-1 ring-feedback-partial-border shrink-0">
      <Loader2 className="size-3 animate-spin" />
      {t('challenge.re_evaluating')}
    </span>
  );
}
