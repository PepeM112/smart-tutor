'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Pencil, RotateCcw } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';

import type { GeneratedQuestionPreviewInput, LongTextContent, MultipleChoiceContent, SimpleContent } from '@/client';
import { QuestionGroupType, QuestionType } from '@/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { sdk } from '@/lib/api-client';
import { Routes } from '@/lib/routes';

import { useGenerationStore } from '../store/use-generation-store';

import { AiEditPopover } from './ai-edit-popover';
import { type LongTextQuestionData, LongTextQuestionBlock } from './long-text-question-block';
import { type MultipleChoiceQuestionData, MultipleChoiceQuestionBlock } from './multiple-choice-question-block';
import { type QuestionGroupData, QuestionGroupBlock } from './question-group-block';
import { RefineTestDialog } from './refine-test-dialog';

type PreviewItem =
  | { id: string; kind: 'mc'; data: MultipleChoiceQuestionData }
  | { id: string; kind: 'group'; data: QuestionGroupData }
  | { id: string; kind: 'long_text'; data: LongTextQuestionData };

export function GeneratedTestPreview() {
  const router = useRouter();
  const queryClient = useQueryClient();

  const initialQuestions = useGenerationStore(s => s.questions);
  const sourceNoteId = useGenerationStore(s => s.sourceNoteId);
  const sourceNoteTitle = useGenerationStore(s => s.sourceNoteTitle);
  const hasData = useGenerationStore(s => s.questions.length > 0);
  const clear = useGenerationStore(s => s.clear);

  const [items, setItems] = useState<PreviewItem[]>([]);
  const [testTitle, setTestTitle] = useState('');
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [selectedIndices, setSelectedIndices] = useState<Set<number>>(new Set());
  const lastSelectedRef = useRef<number | null>(null);

  const { data: noteData } = useQuery({
    queryKey: ['notes', sourceNoteId],
    queryFn: () => sdk.notesGet({ path: { note_id: sourceNoteId } }),
    enabled: !!sourceNoteId,
  });
  const noteContent = noteData?.data?.content ?? undefined;

  useEffect(() => {
    if (!hasData) {
      router.replace(Routes.NOTES);
      return;
    }
    const previewItems = toPreviewItems(initialQuestions);
    setItems(previewItems);
    setTestTitle(`Test from ${sourceNoteTitle}`);
  }, [hasData, initialQuestions, sourceNoteTitle, router]);

  // beforeunload guard
  useEffect(() => {
    if (!hasData || items.length === 0) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [hasData, items.length]);

  function handleBlockClick(index: number, e: React.MouseEvent) {
    // Don't select when clicking on inputs/buttons/textareas inside the block
    const target = e.target as HTMLElement;
    if (target.closest('input, textarea, button, select, [role="checkbox"], [data-slot="switch"]')) return;

    setSelectedIndices(prev => {
      const next = new Set(prev);
      if (e.shiftKey && lastSelectedRef.current !== null) {
        const start = Math.min(lastSelectedRef.current, index);
        const end = Math.max(lastSelectedRef.current, index);
        for (let i = start; i <= end; i++) next.add(i);
      } else {
        if (next.has(index)) next.delete(index);
        else next.add(index);
      }
      return next;
    });
    lastSelectedRef.current = index;
  }

  const updateMcItem = useCallback((index: number, data: MultipleChoiceQuestionData) => {
    setItems(prev => prev.map((item, i) => (i === index ? { ...item, kind: 'mc' as const, data } : item)));
  }, []);

  const updateGroupItem = useCallback((index: number, data: QuestionGroupData) => {
    setItems(prev => prev.map((item, i) => (i === index ? { ...item, kind: 'group' as const, data } : item)));
  }, []);

  const updateLongTextItem = useCallback((index: number, data: LongTextQuestionData) => {
    setItems(prev => prev.map((item, i) => (i === index ? { ...item, kind: 'long_text' as const, data } : item)));
  }, []);

  const removeItem = useCallback((index: number) => {
    setItems(prev => prev.filter((_, i) => i !== index));
    setSelectedIndices(prev => {
      const next = new Set<number>();
      prev.forEach(i => {
        if (i === index) return;
        next.add(i > index ? i - 1 : i);
      });
      return next;
    });
  }, []);

  const handleRefined = useCallback((refined: GeneratedQuestionPreviewInput[]) => {
    const previewItems = toPreviewItems(refined);
    setItems(previewItems);
    setSelectedIndices(new Set());
  }, []);

  const handleRegenerate = useCallback(() => {
    const previewItems = toPreviewItems(initialQuestions);
    setItems(previewItems);
    setSelectedIndices(new Set());
    toast.success('Questions reset to original generation');
  }, [initialQuestions]);

  // Flat AI-facing question list, each entry tagged with the block (item) it
  // came from. A 'group' block expands into one entry per row, so block-level
  // selection has to be translated into these flat indices before they're
  // sent to the backend (which validates indices against this flat array).
  const flatEntries = useMemo((): { blockIndex: number; question: GeneratedQuestionPreviewInput }[] => {
    const result: { blockIndex: number; question: GeneratedQuestionPreviewInput }[] = [];
    items.forEach((item, blockIndex) => {
      if (item.kind === 'mc') {
        result.push({
          blockIndex,
          question: {
            questionType: QuestionType.MULTIPLE_CHOICE,
            prompt: item.data.prompt,
            points: item.data.points,
            content: {
              options: item.data.choices.map(c => c.text),
              correct_indices: item.data.choices.flatMap((c, i) => (c.isCorrect ? [i] : [])),
            },
          },
        });
      } else if (item.kind === 'long_text') {
        result.push({
          blockIndex,
          question: {
            questionType: QuestionType.LONG_TEXT,
            prompt: item.data.prompt,
            points: item.data.points,
            content: {
              length_limit: item.data.lengthLimit,
              rubric: item.data.criteria.map(c => ({
                point: c.point,
                weight: c.weight,
                ...(c.category ? { category: c.category } : {}),
              })),
            },
          },
        });
      } else {
        item.data.rows.forEach(row => {
          result.push({
            blockIndex,
            question: {
              questionType: QuestionType.SIMPLE,
              prompt: row.prompt,
              points: item.data.points,
              content: {
                answers: row.answers.filter(Boolean),
              },
            },
          });
        });
      }
    });
    return result;
  }, [items]);

  const currentQuestionsForRefine = useMemo(
    (): GeneratedQuestionPreviewInput[] => flatEntries.map(entry => entry.question),
    [flatEntries]
  );

  const { mutate: createTest, isPending: isCreating } = useMutation({
    mutationFn: () => {
      let orderIndex = 0;

      const standaloneQuestions = items
        .filter((it): it is PreviewItem & { kind: 'mc' } => it.kind === 'mc')
        .map(it => ({
          questionType: QuestionType.MULTIPLE_CHOICE,
          prompt: it.data.prompt,
          order: orderIndex++,
          points: it.data.points,
          content: {
            options: it.data.choices.map(c => c.text),
            correct_indices: it.data.choices.flatMap((c, i) => (c.isCorrect ? [i] : [])),
          },
        }));

      const longTextQuestions = items
        .filter((it): it is PreviewItem & { kind: 'long_text' } => it.kind === 'long_text')
        .map(it => ({
          questionType: QuestionType.LONG_TEXT,
          prompt: it.data.prompt,
          order: orderIndex++,
          points: it.data.points,
          content: {
            length_limit: it.data.lengthLimit,
            rubric: it.data.criteria.map(c => ({
              point: c.point,
              weight: c.weight,
              ...(c.category ? { category: c.category } : {}),
            })),
          },
        }));

      const questionGroups = items
        .filter((it): it is PreviewItem & { kind: 'group' } => it.kind === 'group')
        .map(it => ({
          order: orderIndex++,
          title: it.data.title || sourceNoteTitle,
          points: it.data.points,
          questions: it.data.rows.map((row, i) => ({
            questionType: QuestionType.SIMPLE,
            prompt: row.prompt,
            order: i,
            content: {
              answers: row.answers.filter(Boolean),
            },
          })),
        }));

      return sdk.testsCreate({
        body: {
          title: testTitle.trim(),
          questions: [...standaloneQuestions, ...longTextQuestions],
          questionGroups,
          sourceNoteId,
        },
      });
    },
    onSuccess: res => {
      void queryClient.invalidateQueries({ queryKey: ['tests'] });
      toast.success('Test created successfully');
      clear();
      if (res.data?.id) {
        router.push(Routes.TEST_EDIT(res.data.id));
      } else {
        router.push(Routes.TESTS);
      }
    },
    onError: () => toast.error('Failed to create test'),
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
      setSelectedIndices(new Set());
      toast.success('Questions updated');
    },
    onError: () => toast.error('Failed to edit questions. Please try again.'),
  });

  if (!hasData) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="size-5 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="max-w-3xl space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-3 flex-1">
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
                <h1 className="text-lg font-semibold text-foreground">{testTitle || 'Untitled'}</h1>
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
          <p className="text-sm text-muted-foreground">
            {items.length} question{items.length === 1 ? '' : 's'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon-sm" onClick={handleRegenerate} tooltip="Reset to original generation">
            <RotateCcw className="size-4" />
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
            icon={Check}
            onClick={() => createTest()}
            disabled={items.length === 0 || !testTitle.trim() || isCreating}
          >
            {isCreating ? 'Creating…' : 'Create Test'}
          </Button>
        </div>
      </div>

      <div className="space-y-3">
        {items.map((item, i) => {
          const selected = selectedIndices.has(i);
          const onClick = (e: React.MouseEvent) => handleBlockClick(i, e);

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
        type: QuestionType.MULTIPLE_CHOICE,
        prompt: q.prompt,
        choices: content.options.map((text, i) => ({
          text,
          isCorrect: content.correct_indices.includes(i),
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
        type: QuestionType.LONG_TEXT,
        prompt: q.prompt,
        lengthLimit: content.length_limit ?? 2,
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
