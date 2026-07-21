'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { WandSparkles } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { toast } from 'sonner';

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

type Props = {
  noteId: string;
  onRefined: (content: string) => void;
};

export function RefineNoteDialog({ noteId, onRefined, compact = false }: Props & { compact?: boolean }) {
  const t = useTranslations('notes_ai');
  const tCommon = useTranslations('common');
  const tSettings = useTranslations('settings');
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
      toast.success(t('note_refined'));
    },
    onError: () => toast.error(t('failed_to_refine')),
  });

  return (
    <Dialog open={open} onOpenChange={isRefining ? undefined : setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="outline"
          size={compact ? 'icon-lg' : 'lg'}
          icon={WandSparkles}
          disabled={!aiAvailable}
          tooltip={!aiAvailable ? tSettings('ai_not_configured') : compact ? t('refine_with_ai') : undefined}
        >
          {!compact && t('refine_with_ai')}
        </Button>
      </DialogTrigger>
      <DialogContent
        showCloseButton={!isRefining}
        onInteractOutside={isRefining ? e => e.preventDefault() : undefined}
        onEscapeKeyDown={isRefining ? e => e.preventDefault() : undefined}
      >
        {isRefining ? (
          <DialogLoading title={t('refining_notes')} />
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>{t('refine_study_notes')}</DialogTitle>
              <DialogDescription>{t('refine_description')}</DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="refine-note-instructions">{t('instructions')}</Label>
                <Textarea
                  id="refine-note-instructions"
                  placeholder={t('refine_placeholder')}
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
                {tCommon('refine')}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
