'use client';

import { useMutation } from '@tanstack/react-query';
import { WandSparkles } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { toast } from 'sonner';

import type { GeneratedQuestionPreviewInput } from '@/client';
import { DialogLoading } from '@/components/shared/dialog-loading';
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
import { useAiAvailable } from '@/hooks/use-ai-available';
import { sdk } from '@/lib/api-client';

const PROGRESS_MESSAGES = [
  'Reading your instructions…',
  'Reviewing current questions…',
  'Applying your changes…',
  'Refining question quality…',
  'Wrapping up…',
];

type Props = {
  noteId: string;
  currentQuestions: GeneratedQuestionPreviewInput[];
  onRefined: (questions: GeneratedQuestionPreviewInput[]) => void;
};

export function RefineTestDialog({ noteId, currentQuestions, onRefined }: Props) {
  const t = useTranslations('test_generation');
  const tNotesAi = useTranslations('notes_ai');
  const tCommon = useTranslations('common');
  const tSettings = useTranslations('settings');
  const aiAvailable = useAiAvailable();
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
      toast.success(t('questions_refined'));
    },
    onError: () => toast.error(t('failed_to_refine')),
  });

  return (
    <Dialog open={open} onOpenChange={isRefining ? undefined : setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="outline"
          size="lg"
          icon={WandSparkles}
          disabled={!aiAvailable}
          tooltip={!aiAvailable ? tSettings('ai_not_configured') : undefined}
        >
          {t('refine_with_ai')}
        </Button>
      </DialogTrigger>
      <DialogContent
        showCloseButton={!isRefining}
        onInteractOutside={isRefining ? e => e.preventDefault() : undefined}
        onEscapeKeyDown={isRefining ? e => e.preventDefault() : undefined}
      >
        {isRefining ? (
          <DialogLoading title={t('refining_questions')} messages={PROGRESS_MESSAGES} />
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>{t('refine_questions_title')}</DialogTitle>
              <DialogDescription>{t('refine_description')}</DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="refine-instructions">{tNotesAi('instructions')}</Label>
                <Textarea
                  id="refine-instructions"
                  placeholder='e.g. "Change question 3 to ask about dates instead. Add 2 more multiple choice questions about chapter 5. Make the distractors harder."'
                  value={instructions}
                  onChange={e => setInstructions(e.target.value)}
                  rows={5}
                />
              </div>
              <p className="text-xs text-muted-foreground">
                {t('questions_sent', { count: currentQuestions.length })}
              </p>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>
                {tCommon('cancel')}
              </Button>
              <Button onClick={() => refine()} disabled={!instructions.trim()} icon={WandSparkles}>
                {tCommon('refine')}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
