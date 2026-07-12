'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Check, Loader2, MessageSquareWarning, RotateCcw, ShieldCheck, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';

import { type AnswerRead, type RubricResultItem } from '@/client';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { sdk } from '@/lib/api-client';
import { cn } from '@/lib/utils';

import { effectiveMet } from './result-detail-utils';

export function LongTextReview({ answer }: { answer?: AnswerRead }) {
  if (!answer) return null;

  return (
    <div className="space-y-3">
      <div>
        <p className="text-sm text-muted-foreground mb-1">Your answer:</p>
        <p className="text-sm whitespace-pre-wrap rounded-md bg-muted/50 p-3">{answer.userAnswer}</p>
      </div>
      {answer.rubricResult && answer.rubricResult.length > 0 && (
        <RubricBreakdown items={answer.rubricResult} answerId={answer.id} />
      )}
    </div>
  );
}

function RubricBreakdown({ items, answerId }: { items: RubricResultItem[]; answerId: string }) {
  const [isChallengeMode, setIsChallengeMode] = useState(false);
  const [selectedCriteria, setSelectedCriteria] = useState<Map<number, string>>(new Map());
  const queryClient = useQueryClient();

  const { mutate: submitChallenge, isPending: isSubmitting } = useMutation({
    mutationFn: () =>
      sdk.answersChallenge({
        path: { answer_id: answerId },
        body: {
          criteria: Array.from(selectedCriteria.entries()).map(([criterionIndex, argument]) => ({
            criterionIndex,
            argument,
          })),
        },
      }),
    onSuccess: () => {
      toast.success('Challenge submitted — re-evaluating...');
      setIsChallengeMode(false);
      setSelectedCriteria(new Map());
      void queryClient.invalidateQueries({ queryKey: ['results'] });
    },
    onError: (error: Error & { status?: number; body?: { detail?: string } }) => {
      const detail = error.body?.detail ?? error.message;
      toast.error(`Challenge failed: ${detail}`);
    },
  });

  const effectiveMetCount = items.filter(effectiveMet).length;

  const hasUnchallengedFailedCriteria = items.some(item => !item.met && item.challengeResult == null);
  const hasPendingChallenge = items.some(item => item.challengeResult != null && item.challengeResult.met == null);
  const canChallenge = hasUnchallengedFailedCriteria && !hasPendingChallenge;

  const wasPending = useRef(false);
  useEffect(() => {
    if (hasPendingChallenge) {
      wasPending.current = true;
    } else if (wasPending.current) {
      wasPending.current = false;
      const overturned = items.filter(i => i.challengeResult?.met === true).length;
      if (overturned > 0) {
        toast.success(`Challenge resolved — ${overturned} ${overturned === 1 ? 'criterion' : 'criteria'} overturned`);
      } else {
        toast.info('Challenge resolved — original grading upheld');
      }
    }
  }, [hasPendingChallenge, items]);

  const canSubmit =
    selectedCriteria.size > 0 && Array.from(selectedCriteria.values()).every(arg => arg.trim().length > 0);

  function toggleCriterion(idx: number) {
    setSelectedCriteria(prev => {
      const next = new Map(prev);
      if (next.has(idx)) {
        next.delete(idx);
      } else {
        next.set(idx, '');
      }
      return next;
    });
  }

  function updateArgument(idx: number, value: string) {
    setSelectedCriteria(prev => {
      const next = new Map(prev);
      next.set(idx, value);
      return next;
    });
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-muted-foreground">
          Rubric ({effectiveMetCount}/{items.length} criteria met)
        </p>
        {canChallenge && !isChallengeMode && (
          <Button variant="outline" size="xs" icon={MessageSquareWarning} onClick={() => setIsChallengeMode(true)}>
            Challenge Grade
          </Button>
        )}
        {isChallengeMode && (
          <Button
            variant="ghost"
            size="xs"
            onClick={() => {
              setIsChallengeMode(false);
              setSelectedCriteria(new Map());
            }}
          >
            Cancel
          </Button>
        )}
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
      {isChallengeMode && (
        <div className="flex items-center justify-end gap-2 pt-1">
          <Button variant="default" size="sm" disabled={!canSubmit || isSubmitting} onClick={() => submitChallenge()}>
            {isSubmitting && <Loader2 className="size-3.5 animate-spin" />}
            Submit Challenge ({selectedCriteria.size})
          </Button>
        </div>
      )}
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
  const cr = item.challengeResult;
  const isPending = cr != null && cr.met == null;
  const isOverturned = cr != null && cr.met === true;
  const isUpheld = cr != null && cr.met === false;
  const isChallenged = cr != null;

  const effectiveMet = isOverturned ? true : item.met;

  const isChallengeable = isChallengeMode && !item.met && !isChallenged;
  const isDimmed = isChallengeMode && (item.met || isChallenged);

  return (
    <div
      className={cn(
        'rounded-md border-l-[3px] px-3 py-2 transition-all',
        effectiveMet ? 'border-l-feedback-correct bg-feedback-correct-bg' : 'border-l-destructive bg-feedback-wrong-bg',
        isSelected && 'border-l-feedback-partial bg-feedback-partial-bg',
        isPending && 'border-l-feedback-partial animate-pulse',
        isDimmed && 'opacity-40',
        isChallengeable && 'cursor-pointer hover:ring-1 hover:ring-feedback-partial/60'
      )}
      onClick={isChallengeable ? onToggle : undefined}
    >
      <div className="flex items-start gap-2">
        <CriterionIcon
          effectiveMet={effectiveMet}
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
            {isUpheld && <ChallengeVerdict variant="upheld" />}
            {isPending && <ChallengeVerdict variant="pending" />}
          </div>
          {item.reason && !isOverturned && !isUpheld && (
            <p className="text-xs text-muted-foreground italic">{item.reason}</p>
          )}
          {(isOverturned || isUpheld) && cr?.reason && (
            <p className="text-xs text-muted-foreground italic">{cr.reason}</p>
          )}
        </div>
      </div>
      {isSelected && (
        <div className="mt-2 ml-6" onClick={e => e.stopPropagation()}>
          <Textarea
            placeholder="Explain why your answer addresses this criterion..."
            value={argument}
            onChange={e => onArgumentChange(e.target.value)}
            rows={2}
            maxLength={2000}
            className="text-sm"
          />
        </div>
      )}
    </div>
  );
}

function CriterionIcon({
  effectiveMet,
  isPending,
  isSelected,
  isChallengeMode,
  isChallengeable,
}: {
  effectiveMet: boolean;
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
    return <MessageSquareWarning className="size-4 text-muted-foreground shrink-0 mt-0.5" />;
  }
  if (effectiveMet) {
    return <Check className="size-4 text-feedback-correct shrink-0 mt-0.5" />;
  }
  return <X className="size-4 text-destructive shrink-0 mt-0.5" />;
}

function ChallengeVerdict({ variant }: { variant: 'overturned' | 'upheld' | 'pending' }) {
  if (variant === 'overturned') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-feedback-correct-bg px-2 py-0.5 text-[0.65rem] font-medium text-feedback-correct ring-1 ring-feedback-correct-border shrink-0">
        <ShieldCheck className="size-3" />
        Overturned
      </span>
    );
  }
  if (variant === 'upheld') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[0.65rem] font-medium text-muted-foreground ring-1 ring-border shrink-0">
        Upheld
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-feedback-partial-bg px-2 py-0.5 text-[0.65rem] font-medium text-feedback-partial ring-1 ring-feedback-partial-border shrink-0">
      <Loader2 className="size-3 animate-spin" />
      Re-evaluating
    </span>
  );
}
