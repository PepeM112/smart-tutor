'use client';

import { WandSparkles } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { FloatingCard, FloatingCardContent, FloatingCardTrigger } from '@/components/ui/floating-card';
import { Textarea } from '@/components/ui/textarea';
import { useAiAvailable } from '@/hooks/use-ai-available';

type Props = {
  selectedCount: number;
  isPending: boolean;
  onSubmit: (instructions: string) => void;
};

/**
 * Toolbar entry point for editing the currently selected question blocks with AI.
 * Only rendered while at least one block is selected; the parent clears the
 * selection on a successful edit, which unmounts this popover and resets its
 * local state along with it.
 */
export function AiEditPopover({ selectedCount, isPending, onSubmit }: Props) {
  const t = useTranslations();
  const aiAvailable = useAiAvailable();
  const [open, setOpen] = useState(false);
  const [instructions, setInstructions] = useState('');

  function handleSubmit() {
    if (!instructions.trim()) return;
    onSubmit(instructions);
  }

  return (
    <FloatingCard open={open} onOpenChange={isPending ? undefined : setOpen}>
      <FloatingCardTrigger asChild>
        <Button
          variant="outline"
          size="lg"
          icon={WandSparkles}
          disabled={!aiAvailable}
          tooltip={!aiAvailable ? t('settings.ai_not_configured') : undefined}
        >
          {t('test_generation.ai_edit')}
        </Button>
      </FloatingCardTrigger>
      <FloatingCardContent className="w-80 space-y-3">
        <Textarea
          placeholder={t('test_generation.ai_edit_placeholder')}
          value={instructions}
          onChange={e => setInstructions(e.target.value)}
          rows={4}
          disabled={isPending}
          autoFocus
        />
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs text-muted-foreground">{t('test_generation.questions_selected', { count: selectedCount })}</p>
          <Button size="sm" onClick={handleSubmit} disabled={!instructions.trim() || isPending}>
            {isPending ? t('test_generation.applying') : t('common.submit')}
          </Button>
        </div>
      </FloatingCardContent>
    </FloatingCard>
  );
}
