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
import { getErrorDetail } from '@/lib/utils';

type Props = {
  noteId: string;
  currentQuestions: GeneratedQuestionPreviewInput[];
  onRefined: (questions: GeneratedQuestionPreviewInput[]) => void;
};

export function RefineTestDialog({ noteId, currentQuestions, onRefined }: Props) {
  const t = useTranslations();
  const PROGRESS_MESSAGES = [
    t('test_generation.refine_progress_reading'),
    t('test_generation.refine_progress_reviewing'),
    t('test_generation.refine_progress_applying'),
    t('test_generation.refine_progress_refining'),
    t('test_generation.refine_progress_wrapping'),
  ];
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
      toast.success(t('test_generation.questions_refined'));
    },
    onError: (error: unknown) => toast.error(getErrorDetail(error, t('test_generation.failed_to_refine'))),
  });

  return (
    <Dialog open={open} onOpenChange={isRefining ? undefined : setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="outline"
          size="lg"
          icon={WandSparkles}
          disabled={!aiAvailable}
          tooltip={!aiAvailable ? t('settings.ai_not_configured') : undefined}
        >
          {t('test_generation.refine_with_ai')}
        </Button>
      </DialogTrigger>
      <DialogContent
        showCloseButton={!isRefining}
        onInteractOutside={isRefining ? e => e.preventDefault() : undefined}
        onEscapeKeyDown={isRefining ? e => e.preventDefault() : undefined}
      >
        {isRefining ? (
          <DialogLoading title={t('test_generation.refining_questions')} messages={PROGRESS_MESSAGES} />
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>{t('test_generation.refine_questions_title')}</DialogTitle>
              <DialogDescription>{t('test_generation.refine_description')}</DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="refine-instructions">{t('notes_ai.instructions')}</Label>
                <Textarea
                  id="refine-instructions"
                  placeholder={t('test_generation.refine_placeholder')}
                  value={instructions}
                  onChange={e => setInstructions(e.target.value)}
                  rows={5}
                />
              </div>
              <p className="text-xs text-muted-foreground">
                {t('test_generation.questions_sent', { count: currentQuestions.length })}
              </p>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>
                {t('common.cancel')}
              </Button>
              <Button onClick={() => refine()} disabled={!instructions.trim()} icon={WandSparkles}>
                {t('common.refine')}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
