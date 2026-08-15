'use client';

import { useMutation } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useCallback, useState } from 'react';
import { toast } from 'sonner';

import type { AnswerStatus, QuestionCheckResponse, QuestionReadStripped } from '@/client';
import { sdk } from '@/lib/api-client';

import { REVIEW_BATCH_SIZE } from '../helpers';

import { BatchSummary } from './batch-summary';
import { ProgressBar } from './progress-bar';
import { type CheckResult, QuestionReview } from './question-review';

export type CheckedQuestion = {
  question: QuestionReadStripped;
  userAnswer: string;
  status: AnswerStatus;
};

type SessionPhase = 'answering' | 'checked' | 'batch-done';

type Props = {
  initialQuestions: QuestionReadStripped[];
  mode: 'review' | 'practice';
};

export function ReviewSession({ initialQuestions, mode }: Props) {
  const t = useTranslations('review');
  const [questions, setQuestions] = useState<QuestionReadStripped[]>(initialQuestions);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answer, setAnswer] = useState('');
  const [phase, setPhase] = useState<SessionPhase>('answering');
  const [checkResult, setCheckResult] = useState<CheckResult | null>(null);
  const [results, setResults] = useState<CheckedQuestion[]>([]);
  const [exhausted, setExhausted] = useState(false);

  const currentQuestion = questions[currentIndex] ?? null;

  const { mutate: checkAnswer, isPending: isChecking } = useMutation({
    mutationFn: ({ questionId, userAnswer }: { questionId: string; userAnswer: string }) =>
      sdk.questionsCheck({
        path: { question_id: questionId },
        body: { userAnswer },
      }),
    onSuccess: (response, { userAnswer }) => {
      // SAFETY: SDK returns QuestionCheckResponse on success; throwOnError handles failures
      const data = response.data as QuestionCheckResponse;
      const result: CheckResult = {
        status: data.status,
        correctAnswers: data.correctAnswers,
        correctIndices: data.correctIndices,
        srsState: data.srsState ?? undefined,
      };
      setCheckResult(result);
      setResults(prev => [...prev, { question: currentQuestion, userAnswer, status: data.status }]);
      setPhase('checked');
    },
    onError: () => toast.error(t('failed_to_check')),
  });

  const { mutate: loadNextBatch, isPending: isLoadingBatch } = useMutation({
    mutationFn: () => sdk.reviewList({ query: { limit: REVIEW_BATCH_SIZE, mode } }),
    onSuccess: response => {
      const data = response.data;
      if (!data || data.questions.length === 0) {
        setExhausted(true);
        return;
      }
      setQuestions(data.questions);
      setCurrentIndex(0);
      setAnswer('');
      setCheckResult(null);
      setResults([]);
      setPhase('answering');
    },
    onError: () => toast.error(t('failed_to_load_batch')),
  });

  const handleCheck = useCallback(() => {
    if (!currentQuestion || !answer.trim()) return;
    checkAnswer({ questionId: currentQuestion.id, userAnswer: answer });
  }, [currentQuestion, answer, checkAnswer]);

  const handleNext = () => {
    if (currentIndex + 1 >= questions.length) {
      setPhase('batch-done');
      return;
    }
    setCurrentIndex(prev => prev + 1);
    setAnswer('');
    setCheckResult(null);
    setPhase('answering');
  };

  if (phase === 'batch-done') {
    return (
      <div className="space-y-4">
        <ProgressBar current={questions.length} total={questions.length} />
        <BatchSummary
          results={results}
          onContinue={() => loadNextBatch()}
          isLoading={isLoadingBatch}
          exhausted={exhausted}
        />
      </div>
    );
  }

  if (!currentQuestion) return null;

  return (
    <div className="space-y-6">
      <ProgressBar current={currentIndex + (phase === 'checked' ? 1 : 0)} total={questions.length} />
      <QuestionReview
        question={currentQuestion}
        answer={answer}
        onAnswerChange={setAnswer}
        onCheck={handleCheck}
        isChecking={isChecking}
        checkResult={checkResult}
        onNext={handleNext}
        isLast={currentIndex + 1 >= questions.length}
      />
    </div>
  );
}
