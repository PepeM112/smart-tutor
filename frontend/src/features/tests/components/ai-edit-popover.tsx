'use client';

import { WandSparkles } from 'lucide-react';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { FloatingCard, FloatingCardContent, FloatingCardTrigger } from '@/components/ui/floating-card';
import { Textarea } from '@/components/ui/textarea';

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
  const [open, setOpen] = useState(false);
  const [instructions, setInstructions] = useState('');

  function handleSubmit() {
    if (!instructions.trim()) return;
    onSubmit(instructions);
  }

  return (
    <FloatingCard open={open} onOpenChange={isPending ? undefined : setOpen}>
      <FloatingCardTrigger asChild>
        <Button variant="outline" size="lg" icon={WandSparkles}>
          AI Edit
        </Button>
      </FloatingCardTrigger>
      <FloatingCardContent className="w-80 space-y-3">
        <Textarea
          placeholder="Describe how you want to edit the selected questions…"
          value={instructions}
          onChange={e => setInstructions(e.target.value)}
          rows={4}
          disabled={isPending}
          autoFocus
        />
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs text-muted-foreground">
            {selectedCount} question{selectedCount === 1 ? '' : 's'} selected
          </p>
          <Button size="sm" onClick={handleSubmit} disabled={!instructions.trim() || isPending}>
            {isPending ? 'Applying…' : 'Submit'}
          </Button>
        </div>
      </FloatingCardContent>
    </FloatingCard>
  );
}
