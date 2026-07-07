'use client';

import { ChevronsLeftRight } from 'lucide-react';
import { useMemo, useState } from 'react';

import { QuestionType, type AnswerRead, type TestRead, type TestResultRead } from '@/client';
import { cn } from '@/lib/utils';

import { useResizableSplit } from '../hooks/use-resizable-split';

import GroupDetailPanel from './group-detail-panel';
import { QuestionDetailPanel } from './question-detail-panel';
import { CompactGroupCard, CompactQuestionCard } from './question-review-cards';
import { ExamItemType, buildExamItems, countCorrectInGroup, type ExamItem } from './result-detail-utils';
import { ScoreBanner } from './score-banner';

type Props = {
  result: TestResultRead;
  test: TestRead;
};

type SelectedItem = { type: ExamItemType; id: string };

const SPLIT_RATIO_KEY = 'result-detail-split-ratio';
const DEFAULT_SPLIT_RATIO = 0.5;

export default function ResultDetail({ result, test }: Props) {
  const [selectedItem, setSelectedItem] = useState<SelectedItem | null>(null);
  const { containerRef, splitRatio, handleDividerMouseDown, resetRatio } = useResizableSplit(
    SPLIT_RATIO_KEY,
    DEFAULT_SPLIT_RATIO
  );

  const items: ExamItem[] = useMemo(() => buildExamItems(test), [test]);

  const answerMap = useMemo(() => {
    const map = new Map<string, AnswerRead>();
    (result.answers ?? []).forEach(a => map.set(a.questionId, a));
    return map;
  }, [result.answers]);

  const isPending = (result.pendingAnswers ?? 0) > 0;

  const itemNumbers = useMemo(() => items.map((_, idx) => idx + 1), [items]);

  const hasSelection = selectedItem !== null;

  return (
    <div ref={containerRef} className="flex h-[calc(100vh-6rem)] overflow-hidden">
      {/* Left panel */}
      <div className="min-w-0 overflow-y-auto scrollbar-none p-0.5 pr-4 pb-4 space-y-4" style={{ flex: splitRatio }}>
        <ScoreBanner result={result} testTitle={test.title} />

        {items.map((item, idx) => {
          if (item.type === ExamItemType.QUESTION) {
            const question = item.question;

            return (
              <CompactQuestionCard
                key={question.id}
                question={question}
                answer={answerMap.get(question.id)}
                number={itemNumbers[idx]}
                isSelected={selectedItem?.type === ExamItemType.QUESTION && selectedItem.id === question.id}
                disabled={question.questionType === QuestionType.LONG_TEXT && isPending}
                onClick={() => setSelectedItem({ type: ExamItemType.QUESTION, id: question.id })}
              />
            );
          }

          const group = item.group;
          const questions = group.questions ?? [];
          const groupId = group.id ?? `group-${idx}`;

          return (
            <CompactGroupCard
              key={groupId}
              title={group.title ?? 'Question Group'}
              correctCount={countCorrectInGroup(questions, answerMap)}
              totalCount={questions.length}
              number={itemNumbers[idx]}
              isSelected={selectedItem?.type === ExamItemType.GROUP && selectedItem.id === groupId}
              onClick={() => setSelectedItem({ type: ExamItemType.GROUP, id: groupId })}
            />
          );
        })}
      </div>

      {/* Resizable divider */}
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

      {/* Right panel */}
      <div className="min-w-0 overflow-y-auto scrollbar-none p-0.5 pl-4 pb-4" style={{ flex: 1 - splitRatio }}>
        <RightPanel
          selectedItem={selectedItem}
          items={items}
          test={test}
          answerMap={answerMap}
          itemNumbers={itemNumbers}
        />
      </div>
    </div>
  );
}

function RightPanel({
  selectedItem,
  items,
  test,
  answerMap,
  itemNumbers,
}: {
  selectedItem: SelectedItem | null;
  items: ExamItem[];
  test: TestRead;
  answerMap: Map<string, AnswerRead>;
  itemNumbers: number[];
}) {
  if (!selectedItem) return null;

  const itemIdx = items.findIndex((item, idx) => {
    if (selectedItem.type === ExamItemType.QUESTION) {
      return item.type === ExamItemType.QUESTION && item.question.id === selectedItem.id;
    }
    return item.type === ExamItemType.GROUP && (item.group.id ?? `group-${idx}`) === selectedItem.id;
  });

  if (selectedItem.type === ExamItemType.QUESTION) {
    const question = (test.questions ?? []).find(q => q.id === selectedItem.id);
    if (!question) return null;
    return (
      <QuestionDetailPanel
        question={question}
        answer={answerMap.get(selectedItem.id)}
        number={itemIdx >= 0 ? itemNumbers[itemIdx] : 0}
      />
    );
  }

  const groupItem = itemIdx >= 0 ? items[itemIdx] : undefined;
  if (groupItem?.type !== ExamItemType.GROUP) return null;

  const { group } = groupItem;
  return (
    <GroupDetailPanel
      title={group.title ?? 'Question Group'}
      type={group.type}
      questions={group.questions ?? []}
      answerMap={answerMap}
      number={itemNumbers[itemIdx]}
    />
  );
}
