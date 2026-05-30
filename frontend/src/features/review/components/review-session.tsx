'use client';

import { useCallback, useState } from 'react';
import { toast } from 'sonner';

import { AnswerStatus, type QuestionCheckResponse, type QuestionReadStripped } from '@/client';
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
};

export function ReviewSession({ initialQuestions }: Props) {
  const [questions, setQuestions] = useState<QuestionReadStripped[]>(initialQuestions);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answer, setAnswer] = useState('');
  const [phase, setPhase] = useState<SessionPhase>('answering');
  const [checkResult, setCheckResult] = useState<CheckResult | null>(null);
  const [results, setResults] = useState<CheckedQuestion[]>([]);
  const [isChecking, setIsChecking] = useState(false);
  const [isLoadingBatch, setIsLoadingBatch] = useState(false);
  const [exhausted, setExhausted] = useState(false);

  const currentQuestion = questions[currentIndex] ?? null;

  const handleCheck = useCallback(async () => {
    if (!currentQuestion || !answer.trim()) return;
    setIsChecking(true);
    try {
      const response = await sdk.questionsCheck({
        path: { question_id: currentQuestion.id },
        body: { userAnswer: answer },
      });
      const data = response.data as QuestionCheckResponse;

      const result: CheckResult = {
        status: data.status,
        correctAnswers: data.correctAnswers,
        correctIndices: data.correctIndices,
      };
      setCheckResult(result);
      setResults(prev => [...prev, { question: currentQuestion, userAnswer: answer, status: data.status }]);
      setPhase('checked');
    } catch {
      toast.error('Failed to check answer. Please try again.');
    } finally {
      setIsChecking(false);
    }
  }, [currentQuestion, answer]);

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

  const handleContinue = async () => {
    setIsLoadingBatch(true);
    try {
      const response = await sdk.reviewList({
        query: { limit: REVIEW_BATCH_SIZE },
      });
      const data = response.data ?? [];

      if (!data || data.length === 0) {
        setExhausted(true);
        return;
      }

      setQuestions(data);
      setCurrentIndex(0);
      setAnswer('');
      setCheckResult(null);
      setResults([]);
      setPhase('answering');
    } catch {
      toast.error('Failed to load next batch. Please try again.');
    } finally {
      setIsLoadingBatch(false);
    }
  };

  if (phase === 'batch-done') {
    return (
      <div className="space-y-4">
        <ProgressBar current={questions.length} total={questions.length} />
        <BatchSummary results={results} onContinue={handleContinue} isLoading={isLoadingBatch} exhausted={exhausted} />
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
