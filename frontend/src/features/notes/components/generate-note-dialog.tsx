'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Sparkles } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { toast } from 'sonner';

import { NoteLength } from '@/client';
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
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useAiAvailable } from '@/hooks/use-ai-available';
import { sdk } from '@/lib/api-client';
import { Routes } from '@/lib/routes';

const LENGTH_OPTIONS = [
  { value: undefined, labelKey: 'length_auto' },
  { value: NoteLength.SHORT, labelKey: 'length_short' },
  { value: NoteLength.MEDIUM, labelKey: 'length_medium' },
  { value: NoteLength.LONG, labelKey: 'length_long' },
] as const;

export function GenerateNoteDialog({ compact = false }: { compact?: boolean }) {
  const t = useTranslations('notes_ai');
  const tCommon = useTranslations('common');
  const tSettings = useTranslations('settings');
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
      toast.success(t('note_generated'));
      setOpen(false);
      resetForm();
      if (!res.data) return;
      router.push(Routes.NOTE_DETAIL(res.data.id));
    },
    onError: () => toast.error(t('failed_to_generate')),
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
          tooltip={!aiAvailable ? tSettings('ai_not_configured') : compact ? t('generate_with_ai') : undefined}
        >
          {!compact && t('generate_with_ai')}
        </Button>
      </DialogTrigger>
      <DialogContent
        showCloseButton={!isGenerating}
        onInteractOutside={isGenerating ? e => e.preventDefault() : undefined}
        onEscapeKeyDown={isGenerating ? e => e.preventDefault() : undefined}
      >
        {isGenerating ? (
          <DialogLoading title={t('generating_notes')} />
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>{t('generate_study_notes')}</DialogTitle>
              <DialogDescription>{t('generate_description')}</DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="topic">{t('topic')}</Label>
                <Input
                  id="topic"
                  placeholder={t('topic_placeholder')}
                  value={topic}
                  onChange={e => setTopic(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="guidance">{t('additional_guidance')}</Label>
                <Textarea
                  id="guidance"
                  placeholder={t('guidance_placeholder')}
                  value={guidance}
                  onChange={e => setGuidance(e.target.value)}
                  rows={3}
                />
              </div>

              <div className="space-y-2">
                <Label>{t('length')}</Label>
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
                {tCommon('generate')}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
