'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { WandSparkles } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { toast } from 'sonner';

import { DialogLoading } from '@/components/shared/DialogLoading';
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
import { useAiAvailable } from '@/hooks/useAiAvailable';
import { sdk } from '@/lib/apiClient';
import { getErrorDetail } from '@/lib/utils';

type Props = {
  noteId: string;
  onRefined: (content: string) => void;
};

export function RefineNoteDialog({ noteId, onRefined, compact = false }: Props & { compact?: boolean }) {
  const t = useTranslations();
  const aiAvailable = useAiAvailable();
  const [open, setOpen] = useState(false);
  const [instructions, setInstructions] = useState('');
  const queryClient = useQueryClient();

  const { mutate: refine, isPending: isRefining } = useMutation({
    mutationFn: async () => {
      const res = await sdk.notesRefine({
        path: { note_id: noteId },
        body: { instructions },
      });
      return res.data;
    },
    onSuccess: data => {
      if (!data) return;
      void queryClient.invalidateQueries({ queryKey: ['notes'] });
      onRefined(data.content ?? '');
      setOpen(false);
      setInstructions('');
      toast.success(t('notes_ai.note_refined'));
    },
    onError: (error: unknown) => toast.error(getErrorDetail(error, t('notes_ai.failed_to_refine'))),
  });

  return (
    <Dialog open={open} onOpenChange={isRefining ? undefined : setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="outline"
          size={compact ? 'icon-lg' : 'lg'}
          icon={WandSparkles}
          disabled={!aiAvailable}
          tooltip={!aiAvailable ? t('settings.ai_not_configured') : compact ? t('notes_ai.refine_with_ai') : undefined}
        >
          {!compact && t('notes_ai.refine_with_ai')}
        </Button>
      </DialogTrigger>
      <DialogContent
        showCloseButton={!isRefining}
        onInteractOutside={isRefining ? e => e.preventDefault() : undefined}
        onEscapeKeyDown={isRefining ? e => e.preventDefault() : undefined}
      >
        {isRefining ? (
          <DialogLoading title={t('notes_ai.refining_notes')} />
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>{t('notes_ai.refine_study_notes')}</DialogTitle>
              <DialogDescription>{t('notes_ai.refine_description')}</DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="refine-note-instructions">{t('notes_ai.instructions')}</Label>
                <Textarea
                  id="refine-note-instructions"
                  placeholder={t('notes_ai.refine_placeholder')}
                  value={instructions}
                  onChange={e => setInstructions(e.target.value)}
                  rows={5}
                />
              </div>
            </div>

            <DialogFooter>
              <Button
                size="lg"
                className="w-full sm:w-auto"
                onClick={() => refine()}
                disabled={!instructions.trim()}
                icon={WandSparkles}
              >
                {t('common.refine')}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
