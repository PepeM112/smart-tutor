'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Check, Pencil, RotateCcw } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';

import type { GeneratedQuestionPreview, MultipleChoiceContent, SimpleContent } from '@/client';
import { QuestionGroupType, QuestionType } from '@/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { sdk } from '@/lib/api-client';
import { Routes } from '@/lib/routes';

import { useGenerationStore } from '../store/use-generation-store';

import { type MultipleChoiceQuestionData, MultipleChoiceQuestionBlock } from './multiple-choice-question-block';
import { type QuestionGroupData, QuestionGroupBlock } from './question-group-block';
import { RefineTestDialog } from './refine-test-dialog';

type PreviewItem =
  | { id: string; kind: 'mc'; data: MultipleChoiceQuestionData }
  | { id: string; kind: 'group'; data: QuestionGroupData };

export function GeneratedTestPreview() {
  const router = useRouter();
  const queryClient = useQueryClient();

  const initialQuestions = useGenerationStore(s => s.questions);
  const sourceNoteId = useGenerationStore(s => s.sourceNoteId);
  const sourceNoteTitle = useGenerationStore(s => s.sourceNoteTitle);
  const hasData = useGenerationStore(s => s.hasData);
  const clear = useGenerationStore(s => s.clear);

  const [items, setItems] = useState<PreviewItem[]>([]);
  const [accepted, setAccepted] = useState<boolean[]>([]);
  const [testTitle, setTestTitle] = useState('');
  const [isEditingTitle, setIsEditingTitle] = useState(false);

  useEffect(() => {
    if (!hasData) {
      router.replace(Routes.NOTES);
      return;
    }
    const previewItems = toPreviewItems(initialQuestions);
    setItems(previewItems);
    setAccepted(previewItems.map(() => true));
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

  const acceptedCount = useMemo(() => accepted.filter(Boolean).length, [accepted]);
  const allAccepted = acceptedCount === items.length;

  const acceptedByType = useMemo(() => {
    let mc = 0;
    let simple = 0;
    items.forEach((item, i) => {
      if (!accepted[i]) return;
      if (item.kind === 'mc') mc++;
      else simple += item.data.rows.length;
    });
    return { mc, simple };
  }, [items, accepted]);

  const toggleAll = useCallback(() => {
    setAccepted(prev => {
      const allOn = prev.every(Boolean);
      return prev.map(() => !allOn);
    });
  }, []);

  const toggleAccept = useCallback((index: number) => {
    setAccepted(prev => prev.map((v, i) => (i === index ? !v : v)));
  }, []);

  const updateMcItem = useCallback((index: number, data: MultipleChoiceQuestionData) => {
    setItems(prev => prev.map((item, i) => (i === index ? { ...item, kind: 'mc' as const, data } : item)));
  }, []);

  const updateGroupItem = useCallback((index: number, data: QuestionGroupData) => {
    setItems(prev => prev.map((item, i) => (i === index ? { ...item, kind: 'group' as const, data } : item)));
  }, []);

  const removeItem = useCallback((index: number) => {
    setItems(prev => prev.filter((_, i) => i !== index));
    setAccepted(prev => prev.filter((_, i) => i !== index));
  }, []);

  const handleRefined = useCallback((refined: GeneratedQuestionPreview[]) => {
    const previewItems = toPreviewItems(refined);
    setItems(previewItems);
    setAccepted(previewItems.map(() => true));
  }, []);

  const handleRegenerate = useCallback(() => {
    const previewItems = toPreviewItems(initialQuestions);
    setItems(previewItems);
    setAccepted(previewItems.map(() => true));
    toast.success('Questions reset to original generation');
  }, [initialQuestions]);

  const currentQuestionsForRefine = useMemo((): GeneratedQuestionPreview[] => {
    const result: GeneratedQuestionPreview[] = [];
    items.forEach(item => {
      if (item.kind === 'mc') {
        result.push({
          questionType: QuestionType.MULTIPLE_CHOICE,
          prompt: item.data.prompt,
          points: item.data.points,
          content: {
            options: item.data.choices.map(c => c.text),
            correct_indices: item.data.choices.flatMap((c, i) => (c.isCorrect ? [i] : [])),
          },
        });
      } else {
        item.data.rows.forEach(row => {
          result.push({
            questionType: QuestionType.SIMPLE,
            prompt: row.prompt,
            points: item.data.points,
            content: {
              answers: row.answers.filter(Boolean),
            },
          });
        });
      }
    });
    return result;
  }, [items]);

  const { mutate: createTest, isPending: isCreating } = useMutation({
    mutationFn: () => {
      const acceptedItems = items.filter((_, i) => accepted[i]);

      let orderIndex = 0;

      const standaloneQuestions = acceptedItems
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

      const questionGroups = acceptedItems
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
          questions: standaloneQuestions,
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

  if (!hasData) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="size-5 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent" />
      </div>
    );
  }

  const countParts: string[] = [];
  if (acceptedByType.mc > 0) countParts.push(`${acceptedByType.mc} MC`);
  if (acceptedByType.simple > 0) countParts.push(`${acceptedByType.simple} Simple`);
  const countSummary = countParts.length > 0 ? ` (${countParts.join(', ')})` : '';

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
          <div className="flex items-center gap-3">
            <p className="text-sm text-muted-foreground">
              {acceptedCount} of {items.length} accepted{countSummary}
            </p>
            <Button variant="ghost" size="sm" onClick={toggleAll} className="text-xs h-6 px-2">
              {allAccepted ? 'Deselect all' : 'Select all'}
            </Button>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon-sm" onClick={handleRegenerate} tooltip="Reset to original generation">
            <RotateCcw className="size-4" />
          </Button>
          <RefineTestDialog
            noteId={sourceNoteId}
            currentQuestions={currentQuestionsForRefine}
            onRefined={handleRefined}
          />
          <Button
            icon={Check}
            onClick={() => createTest()}
            disabled={acceptedCount === 0 || !testTitle.trim() || isCreating}
          >
            {isCreating ? 'Creating…' : 'Create Test'}
          </Button>
        </div>
      </div>

      <div className="space-y-3">
        {items.map((item, i) => {
          if (item.kind === 'mc') {
            return (
              <MultipleChoiceQuestionBlock
                key={item.id}
                data={item.data}
                onChange={data => updateMcItem(i, data)}
                onRemove={() => removeItem(i)}
                accepted={accepted[i]}
                onToggleAccept={() => toggleAccept(i)}
              />
            );
          }
          return (
            <QuestionGroupBlock
              key={item.id}
              data={item.data}
              onChange={data => updateGroupItem(i, data)}
              onRemove={() => removeItem(i)}
              accepted={accepted[i]}
              onToggleAccept={() => toggleAccept(i)}
            />
          );
        })}
      </div>
    </div>
  );
}

function toPreviewItems(questions: GeneratedQuestionPreview[]): PreviewItem[] {
  const items: PreviewItem[] = [];
  const simpleQuestions = questions.filter(q => q.questionType === QuestionType.SIMPLE);
  const mcQuestions = questions.filter(q => q.questionType === QuestionType.MULTIPLE_CHOICE);

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
