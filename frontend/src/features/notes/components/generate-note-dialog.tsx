'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Sparkles } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { toast } from 'sonner';

import { NoteLength } from '@/client';
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
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useAiAvailable } from '@/hooks/use-ai-available';
import { sdk } from '@/lib/api-client';
import { Routes } from '@/lib/routes';
import { getErrorDetail } from '@/lib/utils';

const LENGTH_OPTIONS = [
  { value: undefined, labelKey: 'notes_ai.length_auto' },
  { value: NoteLength.SHORT, labelKey: 'notes_ai.length_short' },
  { value: NoteLength.MEDIUM, labelKey: 'notes_ai.length_medium' },
  { value: NoteLength.LONG, labelKey: 'notes_ai.length_long' },
] as const;

export function GenerateNoteDialog({ compact = false }: { compact?: boolean }) {
  const t = useTranslations();
  const aiAvailable = useAiAvailable();
  const [open, setOpen] = useState(false);
  const [topic, setTopic] = useState('');
  const [guidance, setGuidance] = useState('');
  const [length, setLength] = useState<NoteLength | undefined>(undefined);

  const router = useRouter();
  const queryClient = useQueryClient();

  const { mutate: generate, isPending: isGenerating } = useMutation({
    mutationFn: () =>
      sdk.notesGenerate({
        body: {
          topic,
          guidance: guidance || undefined,
          length: length ?? undefined,
        },
      }),
    onSuccess: res => {
      void queryClient.invalidateQueries({ queryKey: ['notes'] });
      toast.success(t('notes_ai.note_generated'));
      setOpen(false);
      resetForm();
      if (!res.data) return;
      router.push(Routes.NOTE_DETAIL(res.data.id));
    },
    onError: (error: unknown) => toast.error(getErrorDetail(error, t('notes_ai.failed_to_generate'))),
  });

  function resetForm() {
    setTopic('');
    setGuidance('');
    setLength(undefined);
  }

  return (
    <Dialog open={open} onOpenChange={isGenerating ? undefined : setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="outline"
          size={compact ? 'icon-lg' : 'lg'}
          icon={Sparkles}
          disabled={!aiAvailable}
          tooltip={
            !aiAvailable ? t('settings.ai_not_configured') : compact ? t('notes_ai.generate_with_ai') : undefined
          }
        >
          {!compact && t('notes_ai.generate_with_ai')}
        </Button>
      </DialogTrigger>
      <DialogContent
        showCloseButton={!isGenerating}
        onInteractOutside={isGenerating ? e => e.preventDefault() : undefined}
        onEscapeKeyDown={isGenerating ? e => e.preventDefault() : undefined}
      >
        {isGenerating ? (
          <DialogLoading title={t('notes_ai.generating_notes')} />
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>{t('notes_ai.generate_study_notes')}</DialogTitle>
              <DialogDescription>{t('notes_ai.generate_description')}</DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="topic">{t('notes_ai.topic')}</Label>
                <Input
                  id="topic"
                  placeholder={t('notes_ai.topic_placeholder')}
                  value={topic}
                  onChange={e => setTopic(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="guidance">{t('notes_ai.additional_guidance')}</Label>
                <Textarea
                  id="guidance"
                  placeholder={t('notes_ai.guidance_placeholder')}
                  value={guidance}
                  onChange={e => setGuidance(e.target.value)}
                  rows={3}
                />
              </div>

              <div className="space-y-2">
                <Label>{t('notes_ai.length')}</Label>
                <div className="flex gap-2">
                  {LENGTH_OPTIONS.map(opt => (
                    <Button
                      key={opt.labelKey}
                      type="button"
                      variant={length === opt.value ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setLength(opt.value)}
                    >
                      {t(opt.labelKey)}
                    </Button>
                  ))}
                </div>
              </div>
            </div>

            <DialogFooter>
              <Button
                size="lg"
                className="w-full sm:w-auto"
                onClick={() => generate()}
                disabled={!topic.trim()}
                icon={Sparkles}
              >
                {t('common.generate')}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
