'use client';

import { Check, Loader2, RotateCcw, Scale, Send, ShieldCheck, Undo2, X } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { AnswerStatus, type AnswerRead, type RubricResultItem } from '@/client';
import { Textarea } from '@/components/ui/textarea';
import { Tooltip } from '@/components/ui/tooltip';
import { useAiAvailable } from '@/hooks/use-ai-available';
import { cn } from '@/lib/utils';

import { useChallengeMode } from '../hooks/use-challenge-mode';

import { effectiveMet } from './result-detail-utils';

export function LongTextReview({ answer }: { answer?: AnswerRead }) {
  const tChallenge = useTranslations('challenge');

  if (!answer) return null;

  return (
    <div className="space-y-3">
      <div>
        <p className="text-sm text-muted-foreground mb-1">{tChallenge('your_answer')}</p>
        <p className="text-sm whitespace-pre-wrap rounded-md bg-muted/50 p-3">{answer.userAnswer}</p>
      </div>
      {answer.status === AnswerStatus.FAILED ? (
        <p className="text-sm text-destructive">{tChallenge('grading_failed')}</p>
      ) : (
        answer.rubricResult &&
        answer.rubricResult.length > 0 && <RubricBreakdown items={answer.rubricResult} answerId={answer.id} />
      )}
    </div>
  );
}

function RubricBreakdown({ items, answerId }: { items: RubricResultItem[]; answerId: string }) {
  const tChallenge = useTranslations('challenge');
  const tCommon = useTranslations('common');
  const tSettings = useTranslations('settings');
  const aiAvailable = useAiAvailable();
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

  const effectiveMetCount = items.filter(effectiveMet).length;
  const iconBtnClass = 'inline-flex items-center justify-center size-7 rounded-md transition-colors';

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-muted-foreground">
          {tChallenge('rubric', { met: `${effectiveMetCount}/${items.length}` })}
        </p>
        <div className="flex items-center gap-1">
          {isChallengeMode && (
            <div className="flex items-center gap-1 animate-in fade-in-0 slide-in-from-right-3 duration-200">
              <Tooltip content={tCommon('cancel')}>
                <button
                  className={cn(iconBtnClass, 'text-muted-foreground hover:bg-muted')}
                  onClick={exitChallengeMode}
                >
                  <Undo2 className="size-4" />
                </button>
              </Tooltip>
              <Tooltip
                content={
                  canSubmit
                    ? `${tChallenge('submit_challenge')} (${selectedCriteria.size})`
                    : tChallenge('select_criteria_first')
                }
              >
                <button
                  className={cn(
                    iconBtnClass,
                    'bg-feedback-partial/15 text-feedback-partial hover:bg-feedback-partial/25',
                    (!canSubmit || isSubmitting) && 'opacity-40 pointer-events-none'
                  )}
                  onClick={() => submitChallenge()}
                  disabled={!canSubmit || isSubmitting}
                >
                  {isSubmitting ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
                </button>
              </Tooltip>
            </div>
          )}
          {!isChallengeMode && !hasPendingChallenge && (
            <div className="animate-in fade-in-0 slide-in-from-left-3 duration-200">
              <Tooltip
                content={
                  !aiAvailable
                    ? tSettings('ai_not_configured')
                    : canChallenge
                      ? tChallenge('challenge_grade')
                      : tChallenge('all_criteria_reviewed')
                }
              >
                <button
                  className={cn(
                    iconBtnClass,
                    canChallenge && aiAvailable
                      ? 'bg-feedback-partial/15 text-feedback-partial hover:bg-feedback-partial/25'
                      : 'text-muted-foreground/40 cursor-not-allowed'
                  )}
                  onClick={canChallenge && aiAvailable ? enterChallengeMode : undefined}
                  disabled={!canChallenge || !aiAvailable}
                >
                  <Scale className="size-4" />
                </button>
              </Tooltip>
            </div>
          )}
        </div>
      </div>
      <div className="space-y-1.5">
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
      </div>
    </div>
  );
}

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
  const tChallenge = useTranslations('challenge');
  const cr = item.challengeResult;
  const isPending = cr != null && cr.met == null;
  const isOverturned = cr != null && cr.met === true;
  const isUpheld = cr != null && cr.met === false;
  const isChallenged = cr != null;

  const isMet = effectiveMet(item);

  const isChallengeable = isChallengeMode && !item.met && !isChallenged;
  const isDimmed = isChallengeMode && (item.met || isChallenged);

  return (
    <div
      className={cn(
        'rounded-md border-l-[3px] px-3 py-2 transition-colors',
        isMet ? 'border-l-feedback-correct bg-feedback-correct-bg' : 'border-l-destructive bg-feedback-wrong-bg',
        isSelected && 'border-l-feedback-partial bg-feedback-partial-bg',
        isPending && 'border-l-feedback-partial animate-pulse',
        isDimmed && 'opacity-40',
        isChallengeable && 'cursor-pointer hover:ring-1 hover:ring-feedback-partial/60'
      )}
      onClick={isChallengeable ? onToggle : undefined}
    >
      <div className="flex items-start gap-2">
        <CriterionIcon
          isMet={isMet}
          isPending={isPending}
          isSelected={isSelected}
          isChallengeMode={isChallengeMode}
          isChallengeable={isChallengeable}
        />
        <div className="space-y-0.5 min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <p className="text-sm">
              {item.point}
              <span className="text-muted-foreground ml-1.5 tabular-nums">({item.weight.toFixed(2)})</span>
            </p>
            {isOverturned && <ChallengeVerdict variant="overturned" />}
            {isPending && <ChallengeVerdict variant="pending" />}
          </div>
          {item.reason && <p className="text-xs text-muted-foreground italic">{item.reason}</p>}
          {(isOverturned || isUpheld) && cr?.reason && (
            <>
              <div className="border-t border-border/60 my-1" />
              <div className="flex items-start gap-1.5">
                <Scale className="size-3 text-feedback-partial shrink-0 mt-0.5" />
                <p className="text-xs text-feedback-partial italic">{cr.reason}</p>
              </div>
            </>
          )}
        </div>
      </div>
      {isSelected && (
        <div className="mt-4 ml-6" onClick={e => e.stopPropagation()}>
          <Textarea
            placeholder={tChallenge('explain_criterion')}
            value={argument}
            onChange={e => onArgumentChange(e.target.value)}
            rows={2}
            maxLength={500}
            autoFocus
            className="text-sm bg-background"
          />
          <p className="text-[0.65rem] text-muted-foreground/60 text-right mt-0.5 tabular-nums">
            {argument.length}/500
          </p>
        </div>
      )}
    </div>
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
    return <Loader2 className="size-4 text-feedback-partial shrink-0 mt-0.5 animate-spin" />;
  }
  if (isSelected) {
    return <RotateCcw className="size-4 text-feedback-partial shrink-0 mt-0.5" />;
  }
  if (isChallengeMode && isChallengeable) {
    return <Scale className="size-4 text-feedback-partial shrink-0 mt-0.5" />;
  }
  if (isMet) {
    return <Check className="size-4 text-feedback-correct shrink-0 mt-0.5" />;
  }
  return <X className="size-4 text-destructive shrink-0 mt-0.5" />;
}

function ChallengeVerdict({ variant }: { variant: 'overturned' | 'pending' }) {
  const tChallenge = useTranslations('challenge');

  if (variant === 'overturned') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-feedback-correct-bg px-2 py-0.5 text-[0.65rem] font-medium text-feedback-correct ring-1 ring-feedback-correct-border shrink-0">
        <ShieldCheck className="size-3" />
        {tChallenge('overturned')}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-feedback-partial-bg px-2 py-0.5 text-[0.65rem] font-medium text-feedback-partial ring-1 ring-feedback-partial-border shrink-0">
      <Loader2 className="size-3 animate-spin" />
      {tChallenge('re_evaluating')}
    </span>
  );
}
