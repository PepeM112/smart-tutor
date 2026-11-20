'use client';

import { useTranslations } from 'next-intl';
import { useCallback, useMemo, useRef, useState } from 'react';

import { type AnswerRead, type TestResultRead } from '@/client';
import { OutlineColumn } from '@/components/shared/OutlineColumn';

import { ResultReviewContext } from '../context/resultReviewContext';
import { buildResultEntries } from '../utils/resultEntries';

import { buildExamItems, isOverridden, type ExamItem, type ResultTest } from './resultDetailUtils';
import { ResultEntryDetail } from './ResultEntryDetail';
import { ResultOutline } from './ResultOutline';

interface ResultDetailProps {
  result: TestResultRead;
  test: ResultTest;
  /** The viewer is a teacher of the classroom of this result: they can override grades. */
  canOverride?: boolean;
}

const OUTLINE_STORAGE_KEY = 'result-outline-width';

export function ResultDetail({ result, test, canOverride = false }: ResultDetailProps) {
  const t = useTranslations();
  // Nothing chosen yet: the result opens on the first question.
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const paneRef = useRef<HTMLDivElement>(null);

  const items: ExamItem[] = useMemo(() => buildExamItems(test), [test]);

  const answerMap = useMemo(() => {
    const map = new Map<string, AnswerRead>();
    (result.answers ?? []).forEach(a => map.set(a.questionId, a));
    return map;
  }, [result.answers]);

  const entries = useMemo(() => buildResultEntries(items, answerMap, t('exam.question_group')), [items, answerMap, t]);

  const selectedIndex = Math.max(
    0,
    entries.findIndex(entry => entry.id === selectedId)
  );
  const hasTeacherGrades = (result.answers ?? []).some(isOverridden);

  // The page is one scroller: a new question starts at its top.
  const handleSelect = useCallback((id: string): void => {
    setSelectedId(id);
    paneRef.current?.scrollIntoView({ block: 'start' });
  }, []);

  const review = useMemo(
    () => ({ canOverride, resultId: result.id, isSpaceResult: result.spaceItemId != null }),
    [canOverride, result.id, result.spaceItemId]
  );

  const selectedEntry = entries.at(selectedIndex);
  const selectedItem = items.at(selectedIndex);

  return (
    <ResultReviewContext.Provider value={review}>
      <OutlineColumn
        storageKey={OUTLINE_STORAGE_KEY}
        label={t('outline.contents')}
        outline={
          <ResultOutline
            result={result}
            testTitle={test.title}
            entries={entries}
            selectedId={selectedEntry?.id ?? ''}
            onSelect={handleSelect}
          />
        }
      >
        <div ref={paneRef} className="mx-auto w-full max-w-3xl space-y-6">
          {!canOverride && hasTeacherGrades && (
            <p className="rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
              {t('history.has_teacher_grades')}
            </p>
          )}
          {selectedEntry && selectedItem && (
            <ResultEntryDetail
              entry={selectedEntry}
              item={selectedItem}
              answerMap={answerMap}
              previous={selectedIndex > 0 ? entries[selectedIndex - 1] : undefined}
              next={entries[selectedIndex + 1]}
              onSelect={handleSelect}
            />
          )}
        </div>
      </OutlineColumn>
    </ResultReviewContext.Provider>
  );
}
