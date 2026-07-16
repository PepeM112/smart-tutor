'use client';

import { useMutation } from '@tanstack/react-query';
import { Loader2, Sparkles, WandSparkles } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';

import type { GeneratedQuestionPreview } from '@/client';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { sdk } from '@/lib/api-client';
import { cn } from '@/lib/utils';

const PROGRESS_MESSAGES = [
  'Reading your instructions…',
  'Reviewing current questions…',
  'Applying your changes…',
  'Refining question quality…',
  'Wrapping up…',
];

const MESSAGE_INTERVAL_MS = 3000;

type Props = {
  noteId: string;
  currentQuestions: GeneratedQuestionPreview[];
  onRefined: (questions: GeneratedQuestionPreview[]) => void;
};

export function RefineTestDialog({ noteId, currentQuestions, onRefined }: Props) {
  const [open, setOpen] = useState(false);
  const [instructions, setInstructions] = useState('');

  const { mutate: refine, isPending: isRefining } = useMutation({
    mutationFn: () =>
      sdk.testsRefine({
        body: {
          noteId,
          currentQuestions,
          instructions,
        },
      }),
    onSuccess: res => {
      if (!res.data) return;
      onRefined(res.data.questions);
      setOpen(false);
      setInstructions('');
      toast.success('Questions refined successfully');
    },
    onError: () => toast.error('Failed to refine questions. Please try again.'),
  });

  return (
    <Dialog open={open} onOpenChange={isRefining ? undefined : setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" icon={WandSparkles}>
          Refine with AI
        </Button>
      </DialogTrigger>
      <DialogContent
        showCloseButton={!isRefining}
        onInteractOutside={isRefining ? e => e.preventDefault() : undefined}
        onEscapeKeyDown={isRefining ? e => e.preventDefault() : undefined}
      >
        {isRefining ? (
          <RefiningState />
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Refine Questions with AI</DialogTitle>
              <DialogDescription>
                Tell the AI what to change. It will update the current questions based on your instructions.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="refine-instructions">Instructions</Label>
                <Textarea
                  id="refine-instructions"
                  placeholder='e.g. "Change question 3 to ask about dates instead. Add 2 more multiple choice questions about chapter 5. Make the distractors harder."'
                  value={instructions}
                  onChange={e => setInstructions(e.target.value)}
                  rows={5}
                />
              </div>
              <p className="text-xs text-muted-foreground">
                {currentQuestions.length} questions will be sent to the AI for refinement.
              </p>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button onClick={() => refine()} disabled={!instructions.trim()} icon={WandSparkles}>
                Refine
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function RefiningState() {
  const [messageIndex, setMessageIndex] = useState(0);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval>>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>(null);

  useEffect(() => {
    timerRef.current = setInterval(() => {
      setIsTransitioning(true);
      timeoutRef.current = setTimeout(() => {
        setMessageIndex(prev => (prev + 1) % PROGRESS_MESSAGES.length);
        setIsTransitioning(false);
      }, 200);
    }, MESSAGE_INTERVAL_MS);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  return (
    <div className="flex flex-col items-center justify-center gap-6 py-12">
      <div className="relative">
        <Loader2 className="size-10 animate-spin text-primary" />
        <Sparkles className="absolute -top-1 -right-1 size-4 text-primary animate-pulse" />
      </div>
      <div className="text-center space-y-2">
        <p className="text-sm font-medium text-foreground">Refining your questions…</p>
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
