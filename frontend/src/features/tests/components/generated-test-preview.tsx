'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Columns2, Pencil, Rows3, RotateCcw } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';

import type { GeneratedQuestionPreviewInput, LongTextContent, MultipleChoiceContent, SimpleContent } from '@/client';
import { QuestionGroupType, QuestionType } from '@/client';
import { LoadingSpinner } from '@/components/shared/loading-spinner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { sdk } from '@/lib/api-client';
import { Routes } from '@/lib/routes';
import { cn } from '@/lib/utils';

import { useBlockSelection } from '../hooks/use-block-selection';
import { useGenerationStore } from '../store/use-generation-store';

import { AiEditPopover } from './ai-edit-popover';
import { type LongTextQuestionData, LongTextQuestionBlock } from './long-text-question-block';
import { type MultipleChoiceQuestionData, MultipleChoiceQuestionBlock } from './multiple-choice-question-block';
import { type QuestionGroupData, QuestionGroupBlock } from './question-group-block';
import { RefineTestDialog } from './refine-test-dialog';
import { flattenEditorItems, groupToApiGroup, longTextToApiQuestion, mcToApiQuestion } from './test-editor/converters';

import type { EditorItem } from './test-editor/types';

type PreviewItem =
  | { id: string; kind: 'mc'; data: MultipleChoiceQuestionData }
  | { id: string; kind: 'group'; data: QuestionGroupData }
  | { id: string; kind: 'long_text'; data: LongTextQuestionData };

export function GeneratedTestPreview() {
  const t = useTranslations('test_generation');
  const router = useRouter();
  const queryClient = useQueryClient();

  const initialQuestions = useGenerationStore(s => s.questions);
  const sourceNoteId = useGenerationStore(s => s.sourceNoteId);
  const sourceNoteTitle = useGenerationStore(s => s.sourceNoteTitle);
  const hasData = useGenerationStore(s => s.questions.length > 0);
  const clear = useGenerationStore(s => s.clear);

  const [items, setItems] = useState<PreviewItem[]>(() => toPreviewItems(initialQuestions));
  const [testTitle, setTestTitle] = useState(() => t('test_from_note', { noteTitle: sourceNoteTitle }));
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const { selectedIndices, toggleSelection, removeAndReindex, clearSelection } = useBlockSelection();
  const [columns, setColumns] = useState<1 | 2>(1);

  const { data: noteData } = useQuery({
    queryKey: ['notes', sourceNoteId],
    queryFn: () => sdk.notesGet({ path: { note_id: sourceNoteId } }),
    enabled: !!sourceNoteId,
  });
  const noteContent = noteData?.data?.content ?? undefined;

  useEffect(() => {
    if (!hasData) router.replace(Routes.NOTES);
  }, [hasData, router]);

  // beforeunload guard
  useEffect(() => {
    if (!hasData || items.length === 0) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [hasData, items.length]);

  const updateMcItem = useCallback((index: number, data: MultipleChoiceQuestionData) => {
    setItems(prev => prev.map((item, i) => (i === index ? { ...item, kind: 'mc' as const, data } : item)));
  }, []);

  const updateGroupItem = useCallback((index: number, data: QuestionGroupData) => {
    setItems(prev => prev.map((item, i) => (i === index ? { ...item, kind: 'group' as const, data } : item)));
  }, []);

  const updateLongTextItem = useCallback((index: number, data: LongTextQuestionData) => {
    setItems(prev => prev.map((item, i) => (i === index ? { ...item, kind: 'long_text' as const, data } : item)));
  }, []);

  const removeItem = useCallback(
    (index: number) => {
      setItems(prev => prev.filter((_, i) => i !== index));
      removeAndReindex(index);
    },
    [removeAndReindex]
  );

  const handleRefined = useCallback(
    (refined: GeneratedQuestionPreviewInput[]) => {
      const previewItems = toPreviewItems(refined);
      setItems(previewItems);
      clearSelection();
    },
    [clearSelection]
  );

  const handleRegenerate = useCallback(() => {
    const previewItems = toPreviewItems(initialQuestions);
    setItems(previewItems);
    clearSelection();
    toast.success(t('reset_original'));
  }, [initialQuestions, clearSelection, t]);

  const editorItems = useMemo((): EditorItem[] => items.map(i => i.data), [items]);

  const flatEntries = useMemo(() => flattenEditorItems(editorItems), [editorItems]);

  const currentQuestionsForRefine = useMemo(
    (): GeneratedQuestionPreviewInput[] => flatEntries.map(entry => entry.question),
    [flatEntries]
  );

  const { mutate: createTest, isPending: isCreating } = useMutation({
    mutationFn: () => {
      const standaloneQuestions = editorItems.flatMap((item, idx) => {
        if (item.type === QuestionType.MULTIPLE_CHOICE) return [mcToApiQuestion(item, idx)];
        if (item.type === QuestionType.LONG_TEXT) return [longTextToApiQuestion(item, idx)];
        return [];
      });

      const questionGroups = editorItems.flatMap((item, idx) => {
        if (item.type !== QuestionType.MULTIPLE_CHOICE && item.type !== QuestionType.LONG_TEXT) {
          const group = groupToApiGroup(item, idx);
          return [{ ...group, title: group.title ?? sourceNoteTitle }];
        }
        return [];
      });

      return sdk.testsCreate({
        body: {
          title: testTitle.trim(),
          questions: standaloneQuestions,
          questionGroups,
          sourceNoteId,
        },
      });
    },
    onSuccess: res => {
      void queryClient.invalidateQueries({ queryKey: ['tests'] });
      toast.success(t('test_created'));
      clear();
      if (res.data?.id) {
        router.push(Routes.TEST_EDIT(res.data.id));
      } else {
        router.push(Routes.TESTS);
      }
    },
    onError: () => toast.error(t('failed_to_create')),
  });

  const { mutate: aiEdit, isPending: isAiEditing } = useMutation({
    mutationFn: (instructions: string) => {
      const selectedFlatIndices = flatEntries
        .map((entry, flatIndex) => (selectedIndices.has(entry.blockIndex) ? flatIndex : -1))
        .filter(flatIndex => flatIndex !== -1);

      return sdk.testsEditQuestions({
        body: {
          selectedIndices: selectedFlatIndices,
          allQuestions: currentQuestionsForRefine,
          instructions,
          noteContent,
        },
      });
    },
    onSuccess: res => {
      if (!res.data) return;
      setItems(toPreviewItems(res.data.questions));
      clearSelection();
      toast.success(t('questions_refined'));
    },
    onError: () => toast.error(t('failed_to_refine')),
  });

  if (!hasData) {
    return <LoadingSpinner />;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-3 flex-1 min-w-0">
          <div className="flex items-center gap-2">
            {isEditingTitle ? (
              <Input
                value={testTitle}
                onChange={e => setTestTitle(e.target.value)}
                onBlur={() => setIsEditingTitle(false)}
                onKeyDown={e => {
                  if (e.key === 'Enter') setIsEditingTitle(false);
                }}
                className="max-w-md text-lg font-semibold"
                autoFocus
              />
            ) : (
              <>
                <h1 className="text-lg font-semibold text-foreground">{testTitle || t('review_generated')}</h1>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => setIsEditingTitle(true)}
                  className="text-muted-foreground"
                >
                  <Pencil className="size-3.5" />
                </Button>
              </>
            )}
          </div>
          <p className="text-sm text-muted-foreground">{t('questions_count', { count: items.length })}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setColumns(c => (c === 1 ? 2 : 1))}
            tooltip={columns === 1 ? t('two_column_layout') : t('one_column_layout')}
          >
            {columns === 1 ? <Columns2 className="size-5" /> : <Rows3 className="size-5" />}
          </Button>
          <Button variant="ghost" size="icon" onClick={handleRegenerate} tooltip={t('reset_to_original')}>
            <RotateCcw className="size-5" />
          </Button>
          {selectedIndices.size > 0 && (
            <AiEditPopover selectedCount={selectedIndices.size} isPending={isAiEditing} onSubmit={aiEdit} />
          )}
          <RefineTestDialog
            noteId={sourceNoteId}
            currentQuestions={currentQuestionsForRefine}
            onRefined={handleRefined}
          />
          <Button
            size="lg"
            onClick={() => createTest()}
            disabled={items.length === 0 || !testTitle.trim() || isCreating}
          >
            {isCreating ? t('creating') : t('create_test')}
          </Button>
        </div>
      </div>

      <div className={cn('gap-3', columns === 2 ? 'grid grid-cols-1 lg:grid-cols-2' : 'flex flex-col')}>
        {items.map((item, i) => {
          const selected = selectedIndices.has(i);
          const onClick = (e: React.MouseEvent) => toggleSelection(i, e);

          if (item.kind === 'mc') {
            return (
              <MultipleChoiceQuestionBlock
                key={item.id}
                data={item.data}
                onChange={data => updateMcItem(i, data)}
                onRemove={() => removeItem(i)}
                selected={selected}
                onClick={onClick}
              />
            );
          }
          if (item.kind === 'long_text') {
            return (
              <LongTextQuestionBlock
                key={item.id}
                data={item.data}
                onChange={data => updateLongTextItem(i, data)}
                onRemove={() => removeItem(i)}
                selected={selected}
                onClick={onClick}
              />
            );
          }
          return (
            <QuestionGroupBlock
              key={item.id}
              data={item.data}
              onChange={data => updateGroupItem(i, data)}
              onRemove={() => removeItem(i)}
              selected={selected}
              onClick={onClick}
            />
          );
        })}
      </div>
    </div>
  );
}

function toPreviewItems(questions: GeneratedQuestionPreviewInput[]): PreviewItem[] {
  const items: PreviewItem[] = [];
  const simpleQuestions = questions.filter(q => q.questionType === QuestionType.SIMPLE);
  const mcQuestions = questions.filter(q => q.questionType === QuestionType.MULTIPLE_CHOICE);
  const longTextQuestions = questions.filter(q => q.questionType === QuestionType.LONG_TEXT);

  mcQuestions.forEach(q => {
    const content = q.content as MultipleChoiceContent;
    items.push({
      id: crypto.randomUUID(),
      kind: 'mc',
      data: {
        key: crypto.randomUUID(),
        type: QuestionType.MULTIPLE_CHOICE,
        prompt: q.prompt,
        choices: content.options.map((text, i) => ({
          text,
          isCorrect: content.correctIndices.includes(i),
        })),
        points: q.points ?? 1,
      },
    });
  });

  longTextQuestions.forEach(q => {
    const content = q.content as LongTextContent;
    items.push({
      id: crypto.randomUUID(),
      kind: 'long_text',
      data: {
        key: crypto.randomUUID(),
        type: QuestionType.LONG_TEXT,
        prompt: q.prompt,
        lengthLimit: content.lengthLimit ?? 2,
        criteria: (content.rubric ?? []).map(r => ({
          point: r.point,
          weight: r.weight,
          category: r.category ?? '',
        })),
        points: q.points ?? 2,
      },
    });
  });

  if (simpleQuestions.length > 0) {
    items.push({
      id: crypto.randomUUID(),
      kind: 'group',
      data: {
        key: crypto.randomUUID(),
        type: 'group',
        groupType: QuestionGroupType.UNKNOWN,
        title: '',
        rows: simpleQuestions.map(q => {
          const content = q.content as SimpleContent;
          return {
            prompt: q.prompt,
            answers: content.answers,
          };
        }),
        points: 1,
      },
    });
  }

  return items;
}
