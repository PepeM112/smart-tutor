'use client';

import { ChevronsLeftRight } from 'lucide-react';
import { useMemo, useState } from 'react';

import { QuestionGroupType, QuestionType, type AnswerRead, type TestRead, type TestResultRead } from '@/client';
import { Card, CardContent } from '@/components/ui/card';
import { getScoreTextColor } from '@/features/history/utils/score-colors';
import { cn } from '@/lib/utils';

import { useResizableSplit } from '../hooks/use-resizable-split';

import { QuestionDetailPanel } from './question-detail-panel';
import { CompactQuestionCard, NestedQuestionCard } from './question-review-cards';
import { buildExamItems, countCorrectInGroup } from './result-detail-utils';
import { ScoreBanner } from './score-banner';
import { VocabularyReviewTable } from './vocabulary-review-table';

type Props = {
  result: TestResultRead;
  test: TestRead;
};

const SPLIT_RATIO_KEY = 'result-detail-split-ratio';
const DEFAULT_SPLIT_RATIO = 0.5;

export function ResultDetail({ result, test }: Props) {
  const [selectedQuestionId, setSelectedQuestionId] = useState<string | null>(null);
  const { containerRef, splitRatio, handleDividerMouseDown, resetRatio } = useResizableSplit(
    SPLIT_RATIO_KEY,
    DEFAULT_SPLIT_RATIO
  );

  const items = useMemo(() => buildExamItems(test), [test]);

  const answerMap = useMemo(() => {
    const map = new Map<string, AnswerRead>();
    (result.answers ?? []).forEach(a => map.set(a.questionId, a));
    return map;
  }, [result.answers]);

  const isPending = (result.pendingAnswers ?? 0) > 0;

  const { itemNumbers, questionNumbers } = useMemo(() => {
    const itemNums: number[] = [];
    const questionNums = new Map<string, number>();
    let counter = 0;
    items.forEach(item => {
      counter++;
      itemNums.push(counter);
      if (item.kind === 'question') {
        questionNums.set(item.question.id, counter);
      }
    });
    return { itemNumbers: itemNums, questionNumbers: questionNums };
  }, [items]);

  const selectedQuestion = selectedQuestionId
    ? (test.questions ?? []).find(q => q.id === selectedQuestionId)
    : undefined;
  const selectedAnswer = selectedQuestionId ? answerMap.get(selectedQuestionId) : undefined;

  const hasSelection = selectedQuestionId !== null;

  return (
    <div ref={containerRef} className="flex h-[calc(100vh-6rem)] overflow-hidden">
      {/* Left panel */}
      <div className="min-w-0 overflow-y-auto scrollbar-none p-0.5 pr-4 pb-4 space-y-4" style={{ flex: splitRatio }}>
        <ScoreBanner result={result} testTitle={test.title} />

        {items.map((item, idx) => {
          if (item.kind === 'question') {
            const question = item.question;

            return (
              <CompactQuestionCard
                key={question.id}
                question={question}
                answer={answerMap.get(question.id)}
                number={itemNumbers[idx]}
                isSelected={selectedQuestionId === question.id}
                disabled={question.questionType === QuestionType.LONG_TEXT && isPending}
                onClick={() => setSelectedQuestionId(question.id)}
              />
            );
          }

          const group = item.group;
          const questions = group.questions ?? [];
          const isVocabulary = group.type === QuestionGroupType.VOCABULARY;
          const groupNumber = itemNumbers[idx];

          const correctCount = countCorrectInGroup(questions, answerMap);
          const totalCount = questions.length;
          const groupPct = totalCount > 0 ? (correctCount / totalCount) * 100 : 0;

          return (
            <Card key={group.id ?? `group-${idx}`} className="p-6 ring-1 ring-foreground/10">
              <CardContent className="space-y-4 p-0">
                <div className="flex items-start justify-between gap-2">
                  <p className="font-medium">
                    <span className="text-muted-foreground mr-1.5">{groupNumber}.</span>
                    {group.title ?? 'Question Group'}
                  </p>
                  <span className={cn('text-sm font-medium shrink-0 tabular-nums', getScoreTextColor(groupPct))}>
                    {correctCount}/{totalCount}
                  </span>
                </div>

                {isVocabulary ? (
                  <VocabularyReviewTable questions={questions} answerMap={answerMap} />
                ) : (
                  <div className="space-y-3">
                    {questions.map(q => (
                      <NestedQuestionCard key={q.id} question={q} answer={answerMap.get(q.id)} />
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Resizable divider — always rendered for consistent layout */}
      <div
        className={cn(
          'shrink-0 relative flex items-center justify-center w-12',
          hasSelection ? 'cursor-col-resize' : 'invisible'
        )}
        onMouseDown={hasSelection ? handleDividerMouseDown : undefined}
        onDoubleClick={hasSelection ? resetRatio : undefined}
      >
        <div className="absolute inset-y-0 left-1/2 w-0.5 -translate-x-1/2 bg-border" />
        <div className="relative z-10 flex items-center justify-center w-6 h-10 rounded-full border border-border bg-background text-muted-foreground hover:text-foreground transition-colors">
          <ChevronsLeftRight className="size-5" />
        </div>
      </div>

      {/* Right panel — always rendered for consistent layout */}
      <div className="min-w-0 overflow-y-auto scrollbar-none p-0.5 pl-4 pb-4" style={{ flex: 1 - splitRatio }}>
        {hasSelection && selectedQuestion && (
          <QuestionDetailPanel
            question={selectedQuestion}
            answer={selectedAnswer}
            number={questionNumbers.get(selectedQuestion.id) ?? 0}
          />
        )}
      </div>
    </div>
  );
}
