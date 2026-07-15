'use client';

import { useMutation } from '@tanstack/react-query';
import { Loader2, Sparkles } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';

import { QuestionType } from '@/client';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { sdk } from '@/lib/api-client';
import { Routes } from '@/lib/routes';
import { cn } from '@/lib/utils';

import { useGenerationStore } from '../store/use-generation-store';

const DIFFICULTY_OPTIONS = [
  { value: 'easy' as const, label: 'Easy' },
  { value: 'medium' as const, label: 'Medium' },
  { value: 'hard' as const, label: 'Hard' },
];

const PROGRESS_MESSAGES = [
  'Reading your notes…',
  'Analyzing key concepts…',
  'Crafting questions…',
  'Fine-tuning difficulty…',
  'Reviewing question quality…',
  'Almost there…',
];

const MESSAGE_INTERVAL_MS = 3000;

type Props = {
  noteId: string;
  noteTitle: string;
};

export function GenerateTestDialog({ noteId, noteTitle }: Props) {
  const [open, setOpen] = useState(false);
  const [questionCount, setQuestionCount] = useState(10);
  const [includeSimple, setIncludeSimple] = useState(true);
  const [includeMC, setIncludeMC] = useState(true);
  const [difficulty, setDifficulty] = useState<'easy' | 'medium' | 'hard'>('medium');
  const [guidance, setGuidance] = useState('');

  const router = useRouter();
  const setResult = useGenerationStore(s => s.setResult);

  const { mutate: generate, isPending: isGenerating } = useMutation({
    mutationFn: () => {
      const questionTypes: QuestionType[] = [];
      if (includeSimple) questionTypes.push(QuestionType.SIMPLE);
      if (includeMC) questionTypes.push(QuestionType.MULTIPLE_CHOICE);

      return sdk.testsGenerate({
        body: {
          noteId,
          questionCount,
          questionTypes,
          difficulty,
          guidance: guidance || undefined,
        },
      });
    },
    onSuccess: res => {
      if (!res.data) return;
      setResult(res.data.questions, res.data.sourceNoteId, res.data.sourceNoteTitle);
      setOpen(false);
      resetForm();
      router.push(Routes.TEST_GENERATE_PREVIEW);
    },
    onError: () => toast.error('Failed to generate questions. Please try again.'),
  });

  const hasTypeSelected = includeSimple || includeMC;
  const isCountValid = questionCount >= 5 && questionCount <= 30;
  const canGenerate = hasTypeSelected && isCountValid && !isGenerating;

  function resetForm() {
    setQuestionCount(10);
    setIncludeSimple(true);
    setIncludeMC(true);
    setDifficulty('medium');
    setGuidance('');
  }

  return (
    <Dialog open={open} onOpenChange={isGenerating ? undefined : setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" icon={Sparkles}>
          Generate Test
        </Button>
      </DialogTrigger>
      <DialogContent
        showCloseButton={!isGenerating}
        onInteractOutside={isGenerating ? e => e.preventDefault() : undefined}
        onEscapeKeyDown={isGenerating ? e => e.preventDefault() : undefined}
      >
        {isGenerating ? (
          <GeneratingState />
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Generate Test from Notes</DialogTitle>
              <DialogDescription>AI will create practice questions from &quot;{noteTitle}&quot;.</DialogDescription>
            </DialogHeader>

            <div className="space-y-5 py-4">
              <div className="space-y-2">
                <Label htmlFor="question-count">Number of Questions (5–30)</Label>
                <Input
                  id="question-count"
                  type="number"
                  min={5}
                  max={30}
                  value={questionCount}
                  onChange={e => setQuestionCount(Number(e.target.value))}
                />
              </div>

              <div className="space-y-2">
                <Label>Question Types</Label>
                <div className="flex flex-col gap-3">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <Checkbox checked={includeSimple} onCheckedChange={v => setIncludeSimple(v === true)} />
                    <span className="text-sm">Simple (type an answer)</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <Checkbox checked={includeMC} onCheckedChange={v => setIncludeMC(v === true)} />
                    <span className="text-sm">Multiple Choice</span>
                  </label>
                </div>
                {!hasTypeSelected && <p className="text-xs text-destructive">Select at least one question type</p>}
              </div>

              <div className="space-y-2">
                <Label>Difficulty</Label>
                <div className="flex gap-2">
                  {DIFFICULTY_OPTIONS.map(opt => (
                    <Button
                      key={opt.value}
                      type="button"
                      variant={difficulty === opt.value ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setDifficulty(opt.value)}
                    >
                      {opt.label}
                    </Button>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="guidance">Additional Guidance</Label>
                <Textarea
                  id="guidance"
                  placeholder="e.g. Focus on dates, include trick questions, avoid definitions..."
                  value={guidance}
                  onChange={e => setGuidance(e.target.value)}
                  rows={3}
                />
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button onClick={() => generate()} disabled={!canGenerate} icon={Sparkles}>
                Generate
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function GeneratingState() {
  const [messageIndex, setMessageIndex] = useState(0);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval>>(null);

  useEffect(() => {
    timerRef.current = setInterval(() => {
      setIsTransitioning(true);
      setTimeout(() => {
        setMessageIndex(prev => (prev + 1) % PROGRESS_MESSAGES.length);
        setIsTransitioning(false);
      }, 200);
    }, MESSAGE_INTERVAL_MS);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  return (
    <div className="flex flex-col items-center justify-center gap-6 py-12">
      <div className="relative">
        <Loader2 className="size-10 animate-spin text-primary" />
        <Sparkles className="absolute -top-1 -right-1 size-4 text-primary animate-pulse" />
      </div>
      <div className="text-center space-y-2">
        <p className="text-sm font-medium text-foreground">Generating your test…</p>
        <p
          className={cn(
            'text-sm text-muted-foreground transition-opacity duration-200',
            isTransitioning ? 'opacity-0' : 'opacity-100'
          )}
        >
          {PROGRESS_MESSAGES[messageIndex]}
        </p>
      </div>
    </div>
  );
}
