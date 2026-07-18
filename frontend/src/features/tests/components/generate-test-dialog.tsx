'use client';

import { useMutation } from '@tanstack/react-query';
import { Sparkles } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';

import { QuestionType } from '@/client';
import { DialogLoading } from '@/components/shared/dialog-loading';
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

type Props = {
  noteId: string;
  noteTitle: string;
};

export function GenerateTestDialog({ noteId, noteTitle }: Props) {
  const [open, setOpen] = useState(false);
  const [questionCount, setQuestionCount] = useState(10);
  const [includeSimple, setIncludeSimple] = useState(true);
  const [includeMC, setIncludeMC] = useState(true);
  const [includeLongText, setIncludeLongText] = useState(false);
  const [difficulty, setDifficulty] = useState<'easy' | 'medium' | 'hard'>('medium');
  const [guidance, setGuidance] = useState('');

  const router = useRouter();
  const setResult = useGenerationStore(s => s.setResult);

  const { mutate: generate, isPending: isGenerating } = useMutation({
    mutationFn: () => {
      const questionTypes: QuestionType[] = [];
      if (includeSimple) questionTypes.push(QuestionType.SIMPLE);
      if (includeMC) questionTypes.push(QuestionType.MULTIPLE_CHOICE);
      if (includeLongText) questionTypes.push(QuestionType.LONG_TEXT);

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

  const hasTypeSelected = includeSimple || includeMC || includeLongText;
  const isCountValid = questionCount >= 5 && questionCount <= 30;
  const canGenerate = hasTypeSelected && isCountValid && !isGenerating;

  function resetForm() {
    setQuestionCount(10);
    setIncludeSimple(true);
    setIncludeMC(true);
    setIncludeLongText(false);
    setDifficulty('medium');
    setGuidance('');
  }

  return (
    <Dialog open={open} onOpenChange={isGenerating ? undefined : setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="lg" icon={Sparkles}>
          Generate Test
        </Button>
      </DialogTrigger>
      <DialogContent
        showCloseButton={!isGenerating}
        onInteractOutside={isGenerating ? e => e.preventDefault() : undefined}
        onEscapeKeyDown={isGenerating ? e => e.preventDefault() : undefined}
      >
        {isGenerating ? (
          <DialogLoading title="Generating your test…" messages={PROGRESS_MESSAGES} />
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
                  aria-invalid={!isCountValid || undefined}
                />
                {!isCountValid && <p className="text-xs text-destructive">Must be between 5 and 30</p>}
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
                  <label className="flex items-center gap-2 cursor-pointer">
                    <Checkbox checked={includeLongText} onCheckedChange={v => setIncludeLongText(v === true)} />
                    <span className="text-sm">Long Text (AI-graded essay)</span>
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
