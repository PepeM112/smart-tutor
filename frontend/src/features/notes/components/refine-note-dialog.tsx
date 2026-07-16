'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { WandSparkles } from 'lucide-react';
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
import { sdk } from '@/lib/api-client';

type Props = {
  noteId: string;
  onRefined: (content: string) => void;
};

export function RefineNoteDialog({ noteId, onRefined }: Props) {
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
      toast.success('Note refined successfully');
    },
    onError: () => toast.error('Failed to refine note. Please try again.'),
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
          <DialogLoading title="Refining your notes…" />
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Refine Notes with AI</DialogTitle>
              <DialogDescription>
                Tell the AI what to change. It will update the current notes based on your instructions.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="refine-note-instructions">Instructions</Label>
                <Textarea
                  id="refine-note-instructions"
                  placeholder='e.g. "Add more examples to the section on photosynthesis. Expand the summary. Make the mnemonics more memorable."'
                  value={instructions}
                  onChange={e => setInstructions(e.target.value)}
                  rows={5}
                />
              </div>
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
